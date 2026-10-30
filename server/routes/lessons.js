const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const db = require('../database/connection');
const { auth, authorize } = require('../middleware/auth');

const isAllowedVideoUrl = (value) => {
  if (!value) return true;
  if (typeof value !== 'string' || value.length > 2048) return false;
  if (/^\/uploads\/videos\/[A-Za-z0-9._-]+$/.test(value) && !value.includes('..')) return true;
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'https:') return false;
    const host = parsed.hostname.toLowerCase();
    const isYoutube = host === 'youtube.com' || host === 'www.youtube.com' || host === 'm.youtube.com' || host === 'youtu.be' || host === 'www.youtu.be';
    const isVideoFile = /\.(mp4|webm|mov|ogv|ogg|mpeg|mpg)$/i.test(parsed.pathname);
    return isYoutube || isVideoFile;
  } catch (_error) {
    return false;
  }
};

// Get lessons for a course
router.get('/', auth, async (req, res) => {
  try {
    const { course_id } = req.query;
    
    if (!course_id) {
      return res.status(400).json({ success: false, message: 'course_id is required' });
    }
    
    const course = await db.query('SELECT id, created_by FROM courses WHERE id = $1 AND is_active = 1', [course_id]);
    if (!course.rows.length) return res.status(404).json({ success: false, message: 'Course not found' });
    if (req.user.role === 'student') {
      const enrollment = await db.query('SELECT id FROM enrollments WHERE user_id = $1 AND course_id = $2', [req.user.id, course_id]);
      if (!enrollment.rows.length) return res.status(403).json({ success: false, message: 'Enroll in this course to access its lessons.' });
    } else if (req.user.role === 'teacher' && course.rows[0].created_by !== req.user.id) {
      return res.status(403).json({ success: false, message: 'You can only view lessons in your own courses.' });
    }
    const result = await db.query(
      'SELECT id, course_id, title, description, lesson_type, order_index, duration_minutes, is_active FROM lessons WHERE course_id = $1 AND is_active = 1 ORDER BY order_index ASC',
      [course_id]
    );
    
    res.json({ success: true, lessons: result.rows });
  } catch (error) {
    console.error('Get lessons error:', error);
    res.status(500).json({ success: false, message: 'Error fetching lessons' });
  }
});

// Get single lesson
router.get('/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await db.query('SELECT * FROM lessons WHERE id = $1 AND is_active = 1', [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Lesson not found' });
    }
    
    // Students must be enrolled before viewing lesson content. Teachers may preview
    // lessons only in courses they own; admins may preview all courses.
    const lessonCourse = await db.query('SELECT created_by FROM courses WHERE id = $1 AND is_active = 1', [result.rows[0].course_id]);
    if (!lessonCourse.rows.length) {
      return res.status(404).json({ success: false, message: 'Course not found' });
    }
    if (req.user.role === 'student') {
      const enrollment = await db.query('SELECT id FROM enrollments WHERE user_id = $1 AND course_id = $2', [req.user.id, result.rows[0].course_id]);
      if (!enrollment.rows.length) return res.status(403).json({ success: false, message: 'Enroll in this course to access its lessons.' });
    } else if (req.user.role === 'teacher' && lessonCourse.rows[0].created_by !== req.user.id) {
      return res.status(403).json({ success: false, message: 'You can only preview lessons in your own courses.' });
    }

    // Get assessments if any
    const assessments = await db.query(
      'SELECT id, lesson_id, question, options, points, order_index FROM assessments WHERE lesson_id = $1 ORDER BY order_index ASC',
      [id]
    );
    
    const lesson = result.rows[0];
    lesson.assessments = assessments.rows;
    
    res.json({ success: true, lesson });
  } catch (error) {
    console.error('Get lesson error:', error);
    res.status(500).json({ success: false, message: 'Error fetching lesson' });
  }
});

// Create lesson (teacher/admin only)
router.post('/', auth, authorize('teacher', 'admin'), [
  body('course_id').isInt().withMessage('Valid course_id is required'),
  body('title').trim().notEmpty().withMessage('Title is required'),
  body('content').trim().notEmpty().withMessage('Content is required'),
  body('video_url').optional({ checkFalsy: true }).custom(isAllowedVideoUrl).withMessage('Use an uploaded video, HTTPS video file, or YouTube URL.'),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }
    
    const { course_id, title, description, content, lesson_type, video_url, order_index, duration_minutes } = req.body;
    
    // Verify course exists
    const courseCheck = await db.query('SELECT id, created_by FROM courses WHERE id = $1 AND is_active = 1', [course_id]);
    if (courseCheck.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Course not found' });
    }
    if (req.user.role !== 'admin' && courseCheck.rows[0].created_by !== req.user.id) {
      return res.status(403).json({ success: false, message: 'You can only add lessons to your own courses.' });
    }
    
    const result = await db.query(
      `INSERT INTO lessons (course_id, title, description, content, lesson_type, video_url, order_index, duration_minutes) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [course_id, title, description, content, lesson_type || 'text', video_url, order_index || 0, duration_minutes]
    );
    
    res.status(201).json({ success: true, lesson: result.rows[0] });
  } catch (error) {
    console.error('Create lesson error:', error);
    res.status(500).json({ success: false, message: 'Error creating lesson' });
  }
});

// Update lesson (teacher/admin only)
router.put('/:id', auth, authorize('teacher', 'admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, content, lesson_type, video_url, order_index, duration_minutes, is_active } = req.body;
    if (video_url !== undefined && !isAllowedVideoUrl(video_url)) {
      return res.status(400).json({ success: false, message: 'Use an uploaded video, HTTPS video file, or YouTube URL.' });
    }
    
    const lessonOwner = await db.query('SELECT c.created_by FROM lessons l JOIN courses c ON c.id = l.course_id WHERE l.id = $1', [id]);
    if (!lessonOwner.rows.length) return res.status(404).json({ success: false, message: 'Lesson not found' });
    if (req.user.role !== 'admin' && lessonOwner.rows[0].created_by !== req.user.id) {
      return res.status(403).json({ success: false, message: 'You can only edit lessons in your own courses.' });
    }

    const result = await db.query(
      `UPDATE lessons SET title = COALESCE($1, title), description = COALESCE($2, description),
       content = COALESCE($3, content), lesson_type = COALESCE($4, lesson_type),
       video_url = COALESCE($5, video_url), order_index = COALESCE($6, order_index),
       duration_minutes = COALESCE($7, duration_minutes), is_active = COALESCE($8, is_active),
       updated_at = CURRENT_TIMESTAMP WHERE id = $9 RETURNING *`,
      [title, description, content, lesson_type, video_url, order_index, duration_minutes, is_active, id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Lesson not found' });
    }
    
    res.json({ success: true, lesson: result.rows[0] });
  } catch (error) {
    console.error('Update lesson error:', error);
    res.status(500).json({ success: false, message: 'Error updating lesson' });
  }
});

// Delete lesson (admin only)
router.delete('/:id', auth, authorize('admin'), async (req, res) => {
  try {
    const { id } = req.params;
    
    await db.query('DELETE FROM lessons WHERE id = $1', [id]);
    
    res.json({ success: true, message: 'Lesson deleted successfully' });
  } catch (error) {
    console.error('Delete lesson error:', error);
    res.status(500).json({ success: false, message: 'Error deleting lesson' });
  }
});

module.exports = router;

