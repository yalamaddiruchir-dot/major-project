const express = require('express');
const bcrypt = require('bcryptjs');
const { body, validationResult } = require('express-validator');
const db = require('../database/connection');
const { auth, authorize } = require('../middleware/auth');
const { sanitizeText, escapeLikePattern, normalizeLanguageCode } = require('../utils/security');
const logger = require('../utils/logger');

const router = express.Router();

// Admin-only account creation (authorized teachers and students)
router.post(
  '/',
  auth,
  authorize('admin'),
  [
    body('username')
      .trim()
      .isLength({ min: 3, max: 40 })
      .matches(/^[a-zA-Z0-9_.-]+$/)
      .withMessage('Username must be 3–40 characters (letters, numbers, ., _, -)'),
    body('email').trim().isEmail().withMessage('Provide a valid email address'),
    body('password').isLength({ min: 8, max: 128 }).withMessage('Password must be 8–128 characters'),
    body('full_name').trim().isLength({ min: 1, max: 120 }).withMessage('Full name is required'),
    body('role').isIn(['student', 'teacher']).withMessage('Role must be student or teacher'),
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

      const username = sanitizeText(req.body.username, 40);
      const email = sanitizeText(req.body.email, 160).toLowerCase();
      const fullName = sanitizeText(req.body.full_name, 120);
      const { role } = req.body;
      const schoolName = req.body.school_name ? sanitizeText(req.body.school_name, 160) : null;
      const classGrade = req.body.class_grade ? sanitizeText(req.body.class_grade, 60) : null;
      const preferredLanguage = normalizeLanguageCode(req.body.preferred_language);

      const existing = await db.query(
        'SELECT id FROM users WHERE LOWER(username) = LOWER($1) OR LOWER(email) = LOWER($2)',
        [username, email]
      );
      if (existing.rows.length) {
        return res.status(409).json({ success: false, message: 'Username or email is already registered.' });
      }

      const passwordHash = await bcrypt.hash(String(req.body.password), 12);
      const created = await db.query(
        `INSERT INTO users (username, email, password_hash, full_name, role, school_name, class_grade, preferred_language)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id, username, email, full_name, role, school_name, class_grade, preferred_language, is_active, created_at`,
        [username, email, passwordHash, fullName, role, schoolName, classGrade, preferredLanguage]
      );

      logger.security('Admin created user account', {
        adminId: req.user.id,
        createdUserId: created.rows[0].id,
        role,
      });

      return res.status(201).json({
        success: true,
        message: 'User created successfully.',
        user: created.rows[0],
      });
    } catch (error) {
      logger.error('Create user error', { error: error.message });
      return res.status(500).json({ success: false, message: 'Error creating user.' });
    }
  }
);

// Get users (admin: all users; teacher: students) with search & optional pagination
router.get('/', auth, authorize('admin', 'teacher'), async (req, res) => {
  try {
    const { role, search, page, limit } = req.query;
    let whereSql = 'WHERE 1=1';
    const params = [];
    let paramCount = 0;

    if (req.user.role === 'teacher') {
      whereSql += " AND role = 'student'";
    } else if (role) {
      paramCount += 1;
      whereSql += ` AND role = $${paramCount}`;
      params.push(String(role));
    }

    if (search) {
      paramCount += 1;
      whereSql += ` AND (LOWER(full_name) LIKE LOWER($${paramCount}) ESCAPE '\\' OR LOWER(username) LIKE LOWER($${paramCount}) ESCAPE '\\' OR LOWER(email) LIKE LOWER($${paramCount}) ESCAPE '\\')`;
      params.push(`%${escapeLikePattern(search)}%`);
    }

    const totalRow = await db.get(`SELECT COUNT(*) AS count FROM users ${whereSql}`, params);
    const total = Number(totalRow?.count || 0);

    let paginationSql = '';
    let paginationMeta = null;
    if (page !== undefined || limit !== undefined) {
      const pageNum = Math.max(1, parseInt(page, 10) || 1);
      const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
      const offset = (pageNum - 1) * limitNum;
      paramCount += 1;
      const limitParam = paramCount;
      paramCount += 1;
      const offsetParam = paramCount;
      paginationSql = ` LIMIT $${limitParam} OFFSET $${offsetParam}`;
      params.push(limitNum, offset);
      paginationMeta = {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.max(1, Math.ceil(total / limitNum)),
      };
    }

    const result = await db.query(
      `SELECT id, username, email, full_name, role, school_name, class_grade,
              preferred_language, low_bandwidth_mode, is_active, created_at
       FROM users ${whereSql}
       ORDER BY created_at DESC${paginationSql}`,
      params
    );

    return res.json({
      success: true,
      users: result.rows,
      ...(paginationMeta ? { pagination: paginationMeta } : {}),
    });
  } catch (error) {
    logger.error('Get users error', { error: error.message });
    return res.status(500).json({ success: false, message: 'Error fetching users' });
  }
});

// Get user by ID (self or admin)
router.get('/:id', auth, async (req, res) => {
  try {
    const targetId = parseInt(req.params.id, 10);
    if (!Number.isInteger(targetId) || targetId <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid user ID' });
    }

    if (req.user.role !== 'admin' && targetId !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const user = await db.get(
      `SELECT id, username, email, full_name, role, school_name, class_grade,
              preferred_language, low_bandwidth_mode, is_active, created_at
       FROM users WHERE id = $1`,
      [targetId]
    );

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    return res.json({ success: true, user });
  } catch (error) {
    logger.error('Get user error', { error: error.message });
    return res.status(500).json({ success: false, message: 'Error fetching user' });
  }
});

// Update user (admin can manage roles/status; user can update own profile fields)
router.put(
  '/:id',
  auth,
  [
    body('full_name').optional().trim().isLength({ min: 1, max: 120 }),
    body('email').optional().trim().isEmail(),
    body('role').optional().isIn(['student', 'teacher', 'admin']),
    body('is_active').optional().isBoolean(),
  ],
  async (req, res) => {
    try {
      const targetId = parseInt(req.params.id, 10);
      if (!Number.isInteger(targetId) || targetId <= 0) {
        return res.status(400).json({ success: false, message: 'Invalid user ID' });
      }

      if (req.user.role !== 'admin' && targetId !== req.user.id) {
        return res.status(403).json({ success: false, message: 'Access denied' });
      }

      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, message: errors.array()[0].msg, errors: errors.array() });
      }

      const existing = await db.get('SELECT * FROM users WHERE id = $1', [targetId]);
      if (!existing) {
        return res.status(404).json({ success: false, message: 'User not found' });
      }

      if (req.user.role !== 'admin' && (req.body.role !== undefined || req.body.is_active !== undefined)) {
        return res.status(403).json({ success: false, message: 'Only administrators can modify account roles or status.' });
      }

      let nextRole = existing.role;
      let nextActive = Number(existing.is_active ?? 1);
      let bumpTokenVersion = false;

      if (req.user.role === 'admin') {
        if (req.body.role && req.body.role !== existing.role) {
          if (existing.role === 'admin' && req.body.role !== 'admin') {
            const adminCount = await db.get("SELECT COUNT(*) AS count FROM users WHERE role = 'admin' AND COALESCE(is_active, 1) = 1");
            if (Number(adminCount.count) <= 1) {
              return res.status(400).json({ success: false, message: 'Cannot demote the last active administrator.' });
            }
          }
          nextRole = req.body.role;
          bumpTokenVersion = true;
        }
        if (req.body.is_active !== undefined) {
          const desiredActive = req.body.is_active ? 1 : 0;
          if (desiredActive === 0 && targetId === req.user.id) {
            return res.status(400).json({ success: false, message: 'You cannot deactivate your own administrator account.' });
          }
          if (desiredActive === 0 && existing.role === 'admin') {
            const adminCount = await db.get("SELECT COUNT(*) AS count FROM users WHERE role = 'admin' AND COALESCE(is_active, 1) = 1");
            if (Number(adminCount.count) <= 1) {
              return res.status(400).json({ success: false, message: 'Cannot deactivate the last active administrator.' });
            }
          }
          if (desiredActive !== nextActive) {
            nextActive = desiredActive;
            bumpTokenVersion = true;
          }
        }
      }

      const nextName = req.body.full_name !== undefined ? sanitizeText(req.body.full_name, 120) : existing.full_name;
      const nextEmail = req.body.email !== undefined ? sanitizeText(req.body.email, 160).toLowerCase() : existing.email;
      const nextSchool = req.body.school_name !== undefined
        ? (req.body.school_name ? sanitizeText(req.body.school_name, 160) : null)
        : existing.school_name;
      const nextGrade = req.body.class_grade !== undefined
        ? (req.body.class_grade ? sanitizeText(req.body.class_grade, 60) : null)
        : existing.class_grade;

      if (nextEmail !== existing.email.toLowerCase()) {
        const dup = await db.get('SELECT id FROM users WHERE LOWER(email) = LOWER($1) AND id != $2', [nextEmail, targetId]);
        if (dup) {
          return res.status(409).json({ success: false, message: 'Email is already registered to another user.' });
        }
      }

      const updated = await db.query(
        `UPDATE users
         SET full_name = $1, email = $2, school_name = $3, class_grade = $4,
             role = $5, is_active = $6,
             token_version = COALESCE(token_version, 0) + $7,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $8
         RETURNING id, username, email, full_name, role, school_name, class_grade, preferred_language, is_active, created_at`,
        [nextName, nextEmail, nextSchool, nextGrade, nextRole, nextActive, bumpTokenVersion ? 1 : 0, targetId]
      );

      return res.json({ success: true, message: 'User updated successfully', user: updated.rows[0] });
    } catch (error) {
      logger.error('Update user error', { error: error.message });
      return res.status(500).json({ success: false, message: 'Error updating user' });
    }
  }
);

// Delete user (admin only, prevents self-deletion and deleting the last admin)
router.delete('/:id', auth, authorize('admin'), async (req, res) => {
  try {
    const targetId = parseInt(req.params.id, 10);
    if (!Number.isInteger(targetId) || targetId <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid user ID' });
    }

    if (targetId === req.user.id) {
      return res.status(400).json({ success: false, message: 'You cannot delete your own active administrator account.' });
    }

    const existing = await db.get('SELECT id, username, role FROM users WHERE id = $1', [targetId]);
    if (!existing) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    if (existing.role === 'admin') {
      const adminCount = await db.get("SELECT COUNT(*) AS count FROM users WHERE role = 'admin'");
      if (Number(adminCount.count) <= 1) {
        return res.status(400).json({ success: false, message: 'Cannot delete the last administrator account.' });
      }
    }

    await db.query('DELETE FROM users WHERE id = $1', [targetId]);
    logger.security('Admin deleted user account', { adminId: req.user.id, deletedUserId: targetId });
    return res.json({ success: true, message: 'User deleted successfully' });
  } catch (error) {
    logger.error('Delete user error', { error: error.message });
    return res.status(500).json({ success: false, message: 'Error deleting user' });
  }
});

// Get user enrollments (self or admin)
router.get('/:id/enrollments', auth, async (req, res) => {
  try {
    const targetId = parseInt(req.params.id, 10);
    if (!Number.isInteger(targetId) || targetId <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid user ID' });
    }

    if (req.user.role !== 'admin' && targetId !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const result = await db.query(
      `SELECT e.*,
              c.title AS course_title,
              c.description AS course_description,
              c.category,
              c.language,
              c.thumbnail_url,
              (SELECT COUNT(*) FROM lessons l WHERE l.course_id = c.id AND l.is_active = 1) AS lesson_count,
              (SELECT COUNT(*) FROM user_progress up WHERE up.user_id = e.user_id AND up.course_id = c.id AND up.completion_status = 'completed') AS completed_lessons
       FROM enrollments e
       JOIN courses c ON e.course_id = c.id
       WHERE e.user_id = $1 AND c.is_active = 1
       ORDER BY e.enrolled_at DESC`,
      [targetId]
    );

    const enrollments = result.rows.map((row) => {
      const totalLessons = Number(row.lesson_count || 0);
      const completedLessons = Number(row.completed_lessons || 0);
      return {
        ...row,
        lesson_count: totalLessons,
        completed_lessons: completedLessons,
        completion_percentage: totalLessons > 0 ? Math.round((completedLessons / totalLessons) * 100) : 0,
      };
    });

    return res.json({ success: true, enrollments });
  } catch (error) {
    logger.error('Get enrollments error', { error: error.message });
    return res.status(500).json({ success: false, message: 'Error fetching enrollments' });
  }
});

// Enroll in course (supports both /:id/enrollments and legacy /:id/enroll)
router.post(['/:id/enrollments', '/:id/enroll'], auth, async (req, res) => {
  try {
    const targetId = parseInt(req.params.id, 10);
    const courseId = parseInt(req.body.course_id, 10);

    if (!Number.isInteger(targetId) || targetId <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid user ID' });
    }
    if (req.user.role !== 'admin' && targetId !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }
    if (!Number.isInteger(courseId) || courseId <= 0) {
      return res.status(400).json({ success: false, message: 'Valid course_id is required' });
    }

    const courseCheck = await db.get('SELECT id FROM courses WHERE id = $1 AND is_active = 1', [courseId]);
    if (!courseCheck) {
      return res.status(404).json({ success: false, message: 'Course not found' });
    }

    const targetUser = await db.get('SELECT id, role FROM users WHERE id = $1', [targetId]);
    if (!targetUser || targetUser.role !== 'student') {
      return res.status(400).json({ success: false, message: 'Only student accounts can be enrolled.' });
    }

    const existing = await db.get(
      'SELECT id FROM enrollments WHERE user_id = $1 AND course_id = $2',
      [targetId, courseId]
    );
    if (existing) {
      return res.status(400).json({ success: false, message: 'Already enrolled in this course' });
    }

    const result = await db.query(
      'INSERT INTO enrollments (user_id, course_id) VALUES ($1, $2) RETURNING *',
      [targetId, courseId]
    );

    return res.status(201).json({ success: true, enrollment: result.rows[0] });
  } catch (error) {
    logger.error('Enroll error', { error: error.message });
    return res.status(500).json({ success: false, message: 'Error enrolling in course' });
  }
});

module.exports = router;
