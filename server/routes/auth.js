const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const db = require('../database/connection');
const { auth } = require('../middleware/auth');

// Register
router.post('/register', [
  body('username').trim().isLength({ min: 3, max: 40 }).matches(/^[a-zA-Z0-9_.-]+$/).withMessage('Username must be at least 3 characters'),
  body('email').trim().isEmail().normalizeEmail().withMessage('Please provide a valid email'),
  body('password').isLength({ min: 8, max: 128 }).withMessage('Password must be between 8 and 128 characters'),
  body('full_name').trim().isLength({ min: 1, max: 120 }).withMessage('Full name is required and must be under 120 characters'),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const username = String(req.body.username).trim();
    const email = String(req.body.email).trim().toLowerCase();
    const { password, full_name, school_name, class_grade } = req.body;
    // Public registration can only create student accounts. Roles are assigned by admins.
    const role = 'student';

    if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
      return res.status(503).json({ success: false, message: 'Authentication is not configured. Set a JWT_SECRET of at least 32 characters.' });
    }

    // Check if user exists
    const userCheck = await db.query(
      'SELECT id FROM users WHERE LOWER(username) = LOWER($1) OR LOWER(email) = LOWER($2)',
      [username, email]
    );

    if (userCheck.rows.length > 0) {
      return res.status(400).json({ success: false, message: 'User already exists' });
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 12);

    // Insert, then fetch the newly created account without exposing its password hash.
    const insertResult = await db.query(
      `INSERT INTO users (username, email, password_hash, full_name, role, school_name, class_grade) 
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [username, email, passwordHash, full_name, role, school_name, class_grade]
    );

    // insertResult.lastID contains the new ID
    const newUserId = insertResult.lastID;

    // Fetch the new user
    const userResult = await db.query(
      'SELECT id, username, email, full_name, role, school_name, class_grade FROM users WHERE id = $1',
      [newUserId]
    );

    const user = userResult.rows[0];

    // Generate token
    const token = jwt.sign(
      { userId: user.id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      token,
      user
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ success: false, message: 'Server error during registration' });
  }
});

// Login
router.post('/login', [
  body('username').trim().notEmpty().withMessage('Username is required'),
  body('password').notEmpty().withMessage('Password is required'),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const username = String(req.body.username).trim();
    const { password } = req.body;

    if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
      return res.status(503).json({ success: false, message: 'Authentication is not configured. Set a JWT_SECRET of at least 32 characters.' });
    }

    // Find user
    const result = await db.query(
      'SELECT id, username, email, password_hash, full_name, role, school_name, class_grade FROM users WHERE LOWER(username) = LOWER($1) OR LOWER(email) = LOWER($1)',
      [username]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    const user = result.rows[0];

    // Verify password
    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    // Generate token
    const token = jwt.sign(
      { userId: user.id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    // Remove password from response
    delete user.password_hash;

    res.json({
      success: true,
      message: 'Login successful',
      token,
      user
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ success: false, message: 'Server error during login' });
  }
});

// Get current user
router.get('/me', auth, async (req, res) => {
  res.json({ success: true, user: req.user });
});

module.exports = router;

