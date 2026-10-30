const express = require('express');
const router = express.Router();
const db = require('../database/connection');
const bcrypt = require('bcryptjs');
const { body, validationResult } = require('express-validator');
const { auth, authorize } = require('../middleware/auth');

// Admin-only account creation. Public registration remains student-only.
router.post('/', auth, authorize('admin'), [
  body('username').trim().isLength({ min: 3, max: 40 }).matches(/^[a-zA-Z0-9_.-]+$/),
  body('email').trim().isEmail().normalizeEmail(),
  body('password').isLength({ min: 8, max: 128 }),
  body('full_name').trim().isLength({ min: 1, max: 120 }),
  body('role').isIn(['student', 'teacher']),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });
    const username = String(req.body.username).trim();
    const email = String(req.body.email).trim().toLowerCase();
    const { password, full_name, role, school_name, class_grade } = req.body;
    const existing = await db.query('SELECT id FROM users WHERE LOWER(username) = LOWER($1) OR LOWER(email) = LOWER($2)', [username, email]);
    if (existing.rows.length) return res.status(409).json({ success: false, message: 'Username or email is already registered.' });
    const passwordHash = await bcrypt.hash(password, 12);
    const created = await db.query(
      `INSERT INTO users (username, email, password_hash, full_name, role, school_name, class_grade)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id, username, email, full_name, role, school_name, class_grade, created_at`,
      [username, email, passwordHash, full_name, role, school_name || null, class_grade || null]
    );
    return res.status(201).json({ success: true, message: 'User created successfully.', user: created.rows[0] });
  } catch (error) {
    console.error('Create user error:', error);
    return res.status(500).json({ success: false, message: 'Error creating user.' });
  }
});

// Get all users (admin/teacher only)
router.get('/', auth, authorize('admin', 'teacher'), async (req, res) => {
  try {
    const { role, search } = req.query;
    let query = 'SELECT id, username, email, full_name, role, school_name, class_grade, created_at FROM users WHERE 1=1';
    if (req.user.role === 'teacher') query += " AND role = 'student'";
    const params = [];
    let paramCount = 0;
    
    if (role) {
      paramCount++;
      query += ` AND role = $${paramCount}`;
      params.push(role);
    }
    
    if (search) {
      paramCount++;
      query += ` AND (LOWER(full_name) LIKE LOWER($${paramCount}) OR LOWER(username) LIKE LOWER($${paramCount}) OR LOWER(email) LIKE LOWER($${paramCount}))`;
      params.push(`%${search}%`);
    }
    
    query += ' ORDER BY created_at DESC';
    
    const result = await db.query(query, params);
    
    res.json({ success: true, users: result.rows });
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ success: false, message: 'Error fetching users' });
  }
});

// Get user by ID
router.get('/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Users can view their own profile; administrators can view any account.
    if (req.user.role !== 'admin' && parseInt(id, 10) !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }
    
    const result = await db.query(
      'SELECT id, username, email, full_name, role, school_name, class_grade, created_at FROM users WHERE id = $1',
      [id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    
    res.json({ success: true, user: result.rows[0] });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ success: false, message: 'Error fetching user' });
  }
});

// Get user enrollments
router.get('/:id/enrollments', auth, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Users can view their own enrollments; administrators can view any account.
    if (req.user.role !== 'admin' && parseInt(id, 10) !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }
    
    const result = await db.query(
      `SELECT e.*, c.title as course_title, c.description as course_description, c.category, c.language
       FROM enrollments e
       JOIN courses c ON e.course_id = c.id
       WHERE e.user_id = $1
       ORDER BY e.enrolled_at DESC`,
      [id]
    );
    
    res.json({ success: true, enrollments: result.rows });
  } catch (error) {
    console.error('Get enrollments error:', error);
    res.status(500).json({ success: false, message: 'Error fetching enrollments' });
  }
});

// Enroll in course
router.post('/:id/enrollments', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const { course_id } = req.body;
    
    // Users can only enroll themselves unless they're admin/teacher
    if (req.user.role !== 'admin' && parseInt(id, 10) !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }
    
    if (!course_id) {
      return res.status(400).json({ success: false, message: 'course_id is required' });
    }
    
    // Check if course exists
    const courseCheck = await db.query('SELECT id FROM courses WHERE id = $1 AND is_active = 1', [course_id]);
    if (courseCheck.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Course not found' });
    }
    
    const targetUser = await db.query('SELECT id, role FROM users WHERE id = $1', [id]);
    if (!targetUser.rows.length || targetUser.rows[0].role !== 'student') {
      return res.status(400).json({ success: false, message: 'Only student accounts can be enrolled.' });
    }

    // Check if already enrolled
    const existing = await db.query(
      'SELECT id FROM enrollments WHERE user_id = $1 AND course_id = $2',
      [id, course_id]
    );
    
    if (existing.rows.length > 0) {
      return res.status(400).json({ success: false, message: 'Already enrolled in this course' });
    }
    
    const result = await db.query(
      'INSERT INTO enrollments (user_id, course_id) VALUES ($1, $2) RETURNING *',
      [id, course_id]
    );
    
    res.status(201).json({ success: true, enrollment: result.rows[0] });
  } catch (error) {
    console.error('Enroll error:', error);
    res.status(500).json({ success: false, message: 'Error enrolling in course' });
  }
});

module.exports = router;

