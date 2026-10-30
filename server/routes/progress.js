const express = require('express');
const router = express.Router();
const db = require('../database/connection');
const { auth } = require('../middleware/auth');

// Get user progress
router.get('/', auth, async (req, res) => {
  try {
    const { course_id, lesson_id } = req.query;
    let query = 'SELECT * FROM user_progress WHERE user_id = $1';
    const params = [req.user.id];
    let paramCount = 1;
    
    if (course_id) {
      paramCount++;
      query += ` AND course_id = $${paramCount}`;
      params.push(course_id);
    }
    
    if (lesson_id) {
      paramCount++;
      query += ` AND lesson_id = $${paramCount}`;
      params.push(lesson_id);
    }
    
    query += ' ORDER BY updated_at DESC';
    
    const result = await db.query(query, params);
    
    res.json({ success: true, progress: result.rows });
  } catch (error) {
    console.error('Get progress error:', error);
    res.status(500).json({ success: false, message: 'Error fetching progress' });
  }
});

// Update or create progress
router.post('/', auth, async (req, res) => {
  try {
    const { course_id, lesson_id, completion_status = 'in_progress', progress_percentage = 0, time_spent_minutes = 0 } = req.body;

    if (req.user.role !== 'student') return res.status(403).json({ success: false, message: 'Only students can update learning progress.' });
    
    if (!course_id || !lesson_id) {
      return res.status(400).json({ success: false, message: 'course_id and lesson_id are required' });
    }
    
    const percentage = Number(progress_percentage);
    const minutes = Number(time_spent_minutes);
    if (!Number.isInteger(percentage) || percentage < 0 || percentage > 100 || !Number.isFinite(minutes) || minutes < 0 || minutes > 60) {
      return res.status(400).json({ success: false, message: 'Progress must be 0–100 and time spent must be between 0 and 60 minutes per update.' });
    }
    if (!['not_started', 'in_progress', 'completed'].includes(completion_status)) {
      return res.status(400).json({ success: false, message: 'Invalid completion_status.' });
    }
    if (completion_status === 'completed' && percentage !== 100) {
      return res.status(400).json({ success: false, message: 'Completed lessons must have 100% progress.' });
    }
    const lessonCheck = await db.query('SELECT id FROM lessons WHERE id = $1 AND course_id = $2 AND is_active = 1', [lesson_id, course_id]);
    if (!lessonCheck.rows.length) return res.status(400).json({ success: false, message: 'The lesson does not belong to the selected active course.' });
    const enrollment = await db.query('SELECT id FROM enrollments WHERE user_id = $1 AND course_id = $2', [req.user.id, course_id]);
    if (!enrollment.rows.length) return res.status(403).json({ success: false, message: 'You must be enrolled in this course to save progress.' });

    // Check if progress exists
    const existing = await db.query(
      'SELECT * FROM user_progress WHERE user_id = $1 AND lesson_id = $2',
      [req.user.id, lesson_id]
    );
    
    let result;
    const previous = existing.rows[0] || null;
    // Progress is monotonic: a client cannot accidentally downgrade a completed lesson.
    const effectiveStatus = previous?.completion_status === 'completed'
      ? 'completed'
      : (previous?.completion_status === 'in_progress' && completion_status === 'not_started' ? 'in_progress' : completion_status);
    const effectivePercentage = previous?.completion_status === 'completed'
      ? 100
      : (completion_status === 'completed' ? 100 : Math.max(Number(previous?.progress_percentage || 0), percentage));
    const completedAt = effectiveStatus === 'completed'
      ? (previous?.completed_at || new Date().toISOString())
      : null;

    if (previous) {
      result = await db.query(
        `UPDATE user_progress SET completion_status = $1, progress_percentage = $2,
         time_spent_minutes = time_spent_minutes + $3, last_accessed = CURRENT_TIMESTAMP,
         completed_at = $4, updated_at = CURRENT_TIMESTAMP
         WHERE user_id = $5 AND lesson_id = $6 RETURNING *`,
        [effectiveStatus, effectivePercentage, minutes, completedAt, req.user.id, lesson_id]
      );
    } else {
      result = await db.query(
        `INSERT INTO user_progress (user_id, course_id, lesson_id, completion_status, progress_percentage, time_spent_minutes, completed_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
        [req.user.id, course_id, lesson_id, effectiveStatus, effectivePercentage, minutes, completedAt]
      );
    }
    
    res.json({ success: true, progress: result.rows[0] });
  } catch (error) {
    console.error('Update progress error:', error);
    res.status(500).json({ success: false, message: 'Error updating progress' });
  }
});

// Get student progress (for teachers)
router.get('/students', auth, async (req, res) => {
  try {
    if (req.user.role !== 'teacher' && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }
    
    const { course_id, user_id } = req.query;
    let query = `
      SELECT up.*, u.full_name, u.username, l.title as lesson_title, c.title as course_title
      FROM user_progress up
      JOIN users u ON up.user_id = u.id
      JOIN lessons l ON up.lesson_id = l.id
      JOIN courses c ON up.course_id = c.id
      WHERE 1=1
    `;
    const params = [];
    let paramCount = 0;
    
    if (course_id) {
      paramCount++;
      query += ` AND up.course_id = $${paramCount}`;
      params.push(course_id);
    }
    
    if (user_id) {
      paramCount++;
      query += ` AND up.user_id = $${paramCount}`;
      params.push(user_id);
    }
    if (req.user.role === 'teacher') {
      paramCount++;
      query += ` AND c.created_by = $${paramCount}`;
      params.push(req.user.id);
    }
    
    query += ' ORDER BY up.updated_at DESC';
    
    const result = await db.query(query, params);
    
    res.json({ success: true, progress: result.rows });
  } catch (error) {
    console.error('Get student progress error:', error);
    res.status(500).json({ success: false, message: 'Error fetching student progress' });
  }
});

// Get course completion statistics
router.get('/stats/:course_id', auth, async (req, res) => {
  try {
    const { course_id } = req.params;
    
    const enrollment = await db.query('SELECT id FROM enrollments WHERE user_id = $1 AND course_id = $2', [req.user.id, course_id]);
    if (!enrollment.rows.length && req.user.role === 'student') return res.status(403).json({ success: false, message: 'You are not enrolled in this course.' });

    // Get total lessons
    const totalLessons = await db.query(
      'SELECT COUNT(*) AS count FROM lessons WHERE course_id = $1 AND is_active = 1',
      [course_id]
    );
    
    // Get completed lessons for user
    const completedLessons = await db.query(
      'SELECT COUNT(*) AS count FROM user_progress WHERE user_id = $1 AND course_id = $2 AND completion_status = $3',
      [req.user.id, course_id, 'completed']
    );
    
    // Get total time spent
    const timeSpent = await db.query(
      'SELECT SUM(time_spent_minutes) as total_time FROM user_progress WHERE user_id = $1 AND course_id = $2',
      [req.user.id, course_id]
    );
    
    const stats = {
      total_lessons: parseInt(totalLessons.rows[0].count),
      completed_lessons: parseInt(completedLessons.rows[0].count),
      total_time_minutes: parseInt(timeSpent.rows[0].total_time) || 0,
      completion_percentage: totalLessons.rows[0].count > 0 
        ? Math.round((parseInt(completedLessons.rows[0].count) / parseInt(totalLessons.rows[0].count)) * 100)
        : 0
    };
    
    res.json({ success: true, stats });
  } catch (error) {
    console.error('Get stats error:', error);
    res.status(500).json({ success: false, message: 'Error fetching statistics' });
  }
});

module.exports = router;

