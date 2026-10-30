const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const db = require('../database/connection');
const { auth, authorize } = require('../middleware/auth');

// Get all courses
router.get('/', async (req, res) => {
  try {
    const { category, language, search } = req.query;
    let query = 'SELECT c.*, u.full_name as created_by_name FROM courses c LEFT JOIN users u ON c.created_by = u.id WHERE c.is_active = true';
    const params = [];
    let paramCount = 0;
    
    if (category) {
      paramCount++;
      query += ` AND c.category = $${paramCount}`;
      params.push(category);
    }
    
    if (language) {
      paramCount++;
      query += ` AND c.language = $${paramCount}`;
      params.push(language);
    }
    
    if (search) {
      paramCount++;
      query += ` AND (LOWER(c.title) LIKE LOWER($${paramCount}) OR LOWER(COALESCE(c.description, '')) LIKE LOWER($${paramCount}))`;
      params.push(`%${search}%`);
    }
    
    query += ' ORDER BY c.created_at DESC';
    
    const result = await db.query(query, params);
    
    // Get lesson count for each course
    for (const course of result.rows) {
      const lessonCount = await db.query(
        'SELECT COUNT(*) AS count FROM lessons WHERE course_id = $1 AND is_active = 1',
        [course.id]
      );
      course.lesson_count = parseInt(lessonCount.rows[0].count);
    }
    
    res.json({ success: true, courses: result.rows });
  } catch (error) {
    console.error('Get courses error:', error);
    res.status(500).json({ success: false, message: 'Error fetching courses' });
  }
});

// Get single course with lessons
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const courseResult = await db.query(
      'SELECT c.*, u.full_name as created_by_name FROM courses c LEFT JOIN users u ON c.created_by = u.id WHERE c.id = $1 AND c.is_active = 1',
      [id]
    );
    
    if (courseResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Course not found' });
    }
    
    const course = courseResult.rows[0];
    
    // Get lessons
    const lessonsResult = await db.query(
      'SELECT id, course_id, title, description, lesson_type, order_index, duration_minutes FROM lessons WHERE course_id = $1 AND is_active = 1 ORDER BY order_index ASC',
      [id]
    );
    
    course.lessons = lessonsResult.rows;
    
    res.json({ success: true, course });
  } catch (error) {
    console.error('Get course error:', error);
    res.status(500).json({ success: false, message: 'Error fetching course' });
  }
});

// Create course (teacher/admin only)
router.post('/', auth, authorize('teacher', 'admin'), [
  body('title').trim().notEmpty().withMessage('Title is required'),
  body('description').optional(),
  body('category').optional(),
  body('language').optional(),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }
    
    const { title, description, category, language, thumbnail_url } = req.body;
    
    const result = await db.query(
      `INSERT INTO courses (title, description, category, language, thumbnail_url, created_by) 
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [title, description, category, language || 'en', thumbnail_url, req.user.id]
    );
    
    res.status(201).json({ success: true, course: result.rows[0] });
  } catch (error) {
    console.error('Create course error:', error);
    res.status(500).json({ success: false, message: 'Error creating course' });
  }
});

// Update course (teacher/admin only)
router.put('/:id', auth, authorize('teacher', 'admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, category, language, thumbnail_url, is_active } = req.body;
    
    // Check if course exists and user has permission
    const courseCheck = await db.query('SELECT created_by FROM courses WHERE id = $1', [id]);
    if (courseCheck.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Course not found' });
    }
    
    if (req.user.role !== 'admin' && courseCheck.rows[0].created_by !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Permission denied' });
    }
    
    const result = await db.query(
      `UPDATE courses SET title = COALESCE($1, title), description = COALESCE($2, description), 
       category = COALESCE($3, category), language = COALESCE($4, language), 
       thumbnail_url = COALESCE($5, thumbnail_url), is_active = COALESCE($6, is_active),
       updated_at = CURRENT_TIMESTAMP WHERE id = $7 RETURNING *`,
      [title, description, category, language, thumbnail_url, is_active, id]
    );
    
    res.json({ success: true, course: result.rows[0] });
  } catch (error) {
    console.error('Update course error:', error);
    res.status(500).json({ success: false, message: 'Error updating course' });
  }
});

// Delete course (admin only)
router.delete('/:id', auth, authorize('admin'), async (req, res) => {
  try {
    const { id } = req.params;
    
    await db.query('DELETE FROM courses WHERE id = $1', [id]);
    
    res.json({ success: true, message: 'Course deleted successfully' });
  } catch (error) {
    console.error('Delete course error:', error);
    res.status(500).json({ success: false, message: 'Error deleting course' });
  }
});

module.exports = router;

