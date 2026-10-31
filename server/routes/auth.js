const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const db = require('../database/connection');
const { auth } = require('../middleware/auth');
const { authLimiter } = require('../middleware/rateLimiter');
const { sanitizeText, normalizeLanguageCode } = require('../utils/security');
const logger = require('../utils/logger');

const router = express.Router();

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000;

const signAccessToken = (user) => jwt.sign(
  {
    userId: user.id,
    role: user.role,
    tokenVersion: Number(user.token_version || 0),
    jti: crypto.randomUUID(),
  },
  process.env.JWT_SECRET,
  { algorithm: 'HS256', expiresIn: '7d' }
);

const getCookieOptions = (req) => {
  const isSecureReq = Boolean(
    req.secure
    || String(req.headers['x-forwarded-proto'] || '').toLowerCase().includes('https')
  );
  return {
    httpOnly: true,
    path: '/',
    sameSite: isSecureReq ? 'none' : 'lax',
    secure: isSecureReq,
    ...(isSecureReq ? { partitioned: true } : {}),
  };
};

const setAuthCookie = (req, res, token) => {
  res.cookie('dlp_token', token, {
    ...getCookieOptions(req),
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
};

const clearAuthCookie = (req, res) => {
  res.clearCookie('dlp_token', getCookieOptions(req));
};

const publicUserFields = (u) => ({
  id: u.id,
  username: u.username,
  email: u.email,
  full_name: u.full_name,
  role: u.role,
  school_name: u.school_name,
  class_grade: u.class_grade,
  preferred_language: u.preferred_language || 'en',
  low_bandwidth_mode: Boolean(u.low_bandwidth_mode),
  is_active: u.is_active === undefined ? true : Boolean(u.is_active),
  created_at: u.created_at,
});

// Public Registration (always creates a student account)
router.post(
  '/register',
  authLimiter,
  [
    body('username')
      .trim()
      .isLength({ min: 3, max: 40 })
      .matches(/^[a-zA-Z0-9_.-]+$/)
      .withMessage('Username must be 3–40 characters using letters, numbers, dots, underscores, or hyphens'),
    body('email').trim().isEmail().withMessage('Please provide a valid email'),
    body('password')
      .isLength({ min: 8, max: 128 })
      .withMessage('Password must be between 8 and 128 characters'),
    body('full_name')
      .trim()
      .isLength({ min: 1, max: 120 })
      .withMessage('Full name is required and must be under 120 characters'),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: errors.array()[0].msg,
          errors: errors.array(),
        });
      }

      if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
        return res.status(503).json({
          success: false,
          message: 'Authentication is not configured. Set a JWT_SECRET of at least 32 characters.',
        });
      }

      if (req.body.role && req.body.role !== 'student') {
        logger.security('Blocked privilege escalation attempt during public registration', {
          requestedRole: req.body.role,
          ip: req.ip,
        });
      }

      const username = sanitizeText(req.body.username, 40);
      const email = sanitizeText(req.body.email, 160).toLowerCase();
      const fullName = sanitizeText(req.body.full_name, 120);
      const schoolName = req.body.school_name ? sanitizeText(req.body.school_name, 160) : null;
      const classGrade = req.body.class_grade ? sanitizeText(req.body.class_grade, 60) : null;
      const preferredLanguage = normalizeLanguageCode(req.body.preferred_language);
      const role = 'student';

      const userCheck = await db.query(
        'SELECT id FROM users WHERE LOWER(username) = LOWER($1) OR LOWER(email) = LOWER($2)',
        [username, email]
      );
      if (userCheck.rows.length > 0) {
        return res.status(400).json({ success: false, message: 'User already exists' });
      }

      const passwordHash = await bcrypt.hash(String(req.body.password), 12);

      const insertResult = await db.query(
        `INSERT INTO users (username, email, password_hash, full_name, role, school_name, class_grade, preferred_language)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [username, email, passwordHash, fullName, role, schoolName, classGrade, preferredLanguage]
      );

      const createdUser = await db.get(
        `SELECT id, username, email, full_name, role, school_name, class_grade,
                preferred_language, low_bandwidth_mode, is_active, token_version, created_at
         FROM users WHERE id = $1`,
        [insertResult.lastID]
      );

      const token = signAccessToken(createdUser);
      setAuthCookie(req, res, token);

      return res.status(201).json({
        success: true,
        message: 'User registered successfully',
        token,
        user: publicUserFields(createdUser),
      });
    } catch (error) {
      logger.error('Registration error', { error: error.message });
      return res.status(500).json({ success: false, message: 'Server error during registration' });
    }
  }
);

// Login with brute-force account lockout protection
router.post(
  '/login',
  authLimiter,
  [
    body('username').trim().notEmpty().withMessage('Username is required'),
    body('password').notEmpty().withMessage('Password is required'),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: errors.array()[0].msg,
          errors: errors.array(),
        });
      }

      if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
        return res.status(503).json({
          success: false,
          message: 'Authentication is not configured. Set a JWT_SECRET of at least 32 characters.',
        });
      }

      const identifier = sanitizeText(req.body.username, 160);
      const password = String(req.body.password);

      const user = await db.get(
        `SELECT id, username, email, password_hash, full_name, role, school_name, class_grade,
                preferred_language, low_bandwidth_mode, is_active, token_version,
                failed_login_attempts, locked_until, created_at
         FROM users
         WHERE LOWER(username) = LOWER($1) OR LOWER(email) = LOWER($1)`,
        [identifier]
      );

      if (!user) {
        return res.status(401).json({ success: false, message: 'Invalid credentials' });
      }

      if (Number(user.is_active ?? 1) === 0) {
        return res.status(403).json({
          success: false,
          message: 'This account has been deactivated. Contact your school administrator.',
        });
      }

      if (user.locked_until) {
        const lockTime = new Date(user.locked_until).getTime();
        if (Number.isFinite(lockTime) && lockTime > Date.now()) {
          return res.status(429).json({
            success: false,
            message: 'Account temporarily locked due to repeated failed sign-in attempts. Please try again in 15 minutes.',
          });
        }
      }

      const isMatch = await bcrypt.compare(password, user.password_hash);
      if (!isMatch) {
        const attempts = Number(user.failed_login_attempts || 0) + 1;
        const lockedUntil = attempts >= MAX_FAILED_ATTEMPTS
          ? new Date(Date.now() + LOCKOUT_DURATION_MS).toISOString()
          : null;

        await db.query(
          'UPDATE users SET failed_login_attempts = $1, locked_until = $2 WHERE id = $3',
          [attempts, lockedUntil, user.id]
        );

        if (lockedUntil) {
          logger.security('Account locked after repeated failed login attempts', {
            userId: user.id,
            username: user.username,
            ip: req.ip,
          });
        }

        return res.status(401).json({ success: false, message: 'Invalid credentials' });
      }

      await db.query(
        'UPDATE users SET failed_login_attempts = 0, locked_until = NULL, last_login_at = CURRENT_TIMESTAMP WHERE id = $1',
        [user.id]
      );

      const token = signAccessToken(user);
      setAuthCookie(req, res, token);

      return res.json({
        success: true,
        message: 'Login successful',
        token,
        user: publicUserFields(user),
      });
    } catch (error) {
      logger.error('Login error', { error: error.message });
      return res.status(500).json({ success: false, message: 'Server error during login' });
    }
  }
);

// Logout & immediate server-side token revocation
router.post('/logout', auth, async (req, res) => {
  try {
    await db.query('DELETE FROM revoked_tokens WHERE expires_at <= $1', [new Date().toISOString()]);
    if (req.authPayload?.jti) {
      const expiresIso = req.authPayload.exp
        ? new Date(req.authPayload.exp * 1000).toISOString()
        : new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();
      await db.query(
        'INSERT OR IGNORE INTO revoked_tokens (jti, user_id, expires_at) VALUES ($1, $2, $3)',
        [req.authPayload.jti, req.user.id, expiresIso]
      );
    }
    clearAuthCookie(req, res);
    return res.json({ success: true, message: 'Logged out successfully' });
  } catch (error) {
    logger.error('Logout error', { error: error.message });
    return res.status(500).json({ success: false, message: 'Error logging out' });
  }
});

// Get current user
router.get('/me', auth, async (req, res) => {
  return res.json({ success: true, user: publicUserFields(req.user) });
});

// Update current user's profile & rural-school preferences
router.put(
  '/profile',
  auth,
  [
    body('full_name').optional().trim().isLength({ min: 1, max: 120 }).withMessage('Full name must be 1–120 characters'),
    body('email').optional().trim().isEmail().withMessage('Provide a valid email address'),
    body('school_name').optional({ nullable: true }).isLength({ max: 160 }),
    body('class_grade').optional({ nullable: true }).isLength({ max: 60 }),
    body('preferred_language').optional().isIn(['en', 'te', 'hi', 'english', 'telugu', 'hindi']),
    body('low_bandwidth_mode').optional().isBoolean(),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: errors.array()[0].msg,
          errors: errors.array(),
        });
      }

      if (req.body.role && req.body.role !== req.user.role) {
        logger.security('Blocked role modification attempt via profile endpoint', { userId: req.user.id });
        return res.status(403).json({ success: false, message: 'Role cannot be changed from profile settings.' });
      }

      const fullName = req.body.full_name !== undefined ? sanitizeText(req.body.full_name, 120) : req.user.full_name;
      const email = req.body.email !== undefined ? sanitizeText(req.body.email, 160).toLowerCase() : req.user.email;
      const schoolName = req.body.school_name !== undefined
        ? (req.body.school_name ? sanitizeText(req.body.school_name, 160) : null)
        : req.user.school_name;
      const classGrade = req.body.class_grade !== undefined
        ? (req.body.class_grade ? sanitizeText(req.body.class_grade, 60) : null)
        : req.user.class_grade;
      const preferredLanguage = req.body.preferred_language !== undefined
        ? normalizeLanguageCode(req.body.preferred_language)
        : (req.user.preferred_language || 'en');
      const lowBandwidthMode = req.body.low_bandwidth_mode !== undefined
        ? (req.body.low_bandwidth_mode ? 1 : 0)
        : (req.user.low_bandwidth_mode ? 1 : 0);

      if (email !== req.user.email.toLowerCase()) {
        const duplicate = await db.get(
          'SELECT id FROM users WHERE LOWER(email) = LOWER($1) AND id != $2',
          [email, req.user.id]
        );
        if (duplicate) {
          return res.status(409).json({ success: false, message: 'Email is already in use by another account.' });
        }
      }

      const updated = await db.query(
        `UPDATE users
         SET full_name = $1, email = $2, school_name = $3, class_grade = $4,
             preferred_language = $5, low_bandwidth_mode = $6, updated_at = CURRENT_TIMESTAMP
         WHERE id = $7
         RETURNING id, username, email, full_name, role, school_name, class_grade,
                   preferred_language, low_bandwidth_mode, is_active, created_at`,
        [fullName, email, schoolName, classGrade, preferredLanguage, lowBandwidthMode, req.user.id]
      );

      return res.json({
        success: true,
        message: 'Profile updated successfully',
        user: publicUserFields(updated.rows[0]),
      });
    } catch (error) {
      logger.error('Profile update error', { error: error.message });
      return res.status(500).json({ success: false, message: 'Error updating profile' });
    }
  }
);

// Change password & invalidate all previous tokens
router.put(
  '/password',
  auth,
  [
    body('current_password').notEmpty().withMessage('Current password is required'),
    body('new_password')
      .isLength({ min: 8, max: 128 })
      .withMessage('New password must be between 8 and 128 characters'),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: errors.array()[0].msg,
          errors: errors.array(),
        });
      }

      const { current_password: currentPassword, new_password: newPassword } = req.body;
      if (currentPassword === newPassword) {
        return res.status(400).json({
          success: false,
          message: 'New password must be different from your current password.',
        });
      }

      const fullUser = await db.get(
        'SELECT id, password_hash, role, token_version FROM users WHERE id = $1',
        [req.user.id]
      );
      const validCurrent = await bcrypt.compare(String(currentPassword), fullUser.password_hash);
      if (!validCurrent) {
        return res.status(401).json({ success: false, message: 'Current password is incorrect.' });
      }

      const newHash = await bcrypt.hash(String(newPassword), 12);
      const updated = await db.query(
        `UPDATE users
         SET password_hash = $1, token_version = COALESCE(token_version, 0) + 1, updated_at = CURRENT_TIMESTAMP
         WHERE id = $2
         RETURNING id, role, token_version`,
        [newHash, req.user.id]
      );

      const newToken = signAccessToken(updated.rows[0]);
      setAuthCookie(req, res, newToken);
      return res.json({
        success: true,
        message: 'Password updated successfully.',
        token: newToken,
      });
    } catch (error) {
      logger.error('Password change error', { error: error.message });
      return res.status(500).json({ success: false, message: 'Error changing password' });
    }
  }
);

module.exports = router;
