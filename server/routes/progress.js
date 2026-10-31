const express = require('express');
const db = require('../database/connection');
const { auth } = require('../middleware/auth');
const logger = require('../utils/logger');

const router = express.Router();

const applyProgressUpdateTx = async (tx, userId, payload) => {
  const courseId = parseInt(payload.course_id, 10);
  const lessonId = parseInt(payload.lesson_id, 10);
  const completionStatus = payload.completion_status || 'in_progress';
  const percentage = Number(payload.progress_percentage ?? 0);
  const minutes = Number(payload.time_spent_minutes ?? 0);
  const lastPositionSeconds = Math.max(0, Math.floor(Number(payload.last_position_seconds ?? 0) || 0));
  const idempotencyKey = payload.idempotency_key ? String(payload.idempotency_key).trim().slice(0, 120) : null;

  if (!Number.isInteger(courseId) || courseId <= 0 || !Number.isInteger(lessonId) || lessonId <= 0) {
    const err = new Error('course_id and lesson_id are required');
    err.status = 400;
    throw err;
  }
  if (!Number.isInteger(percentage) || percentage < 0 || percentage > 100 || !Number.isFinite(minutes) || minutes < 0 || minutes > 240) {
    const err = new Error('Progress must be 0–100 and time spent must be between 0 and 240 minutes per update.');
    err.status = 400;
    throw err;
  }
  if (!['not_started', 'in_progress', 'completed'].includes(completionStatus)) {
    const err = new Error('Invalid completion_status.');
    err.status = 400;
    throw err;
  }
  if (completionStatus === 'completed' && percentage !== 100) {
    const err = new Error('Completed lessons must have 100% progress.');
    err.status = 400;
    throw err;
  }

  const lessonCheck = await tx.get(
    'SELECT id FROM lessons WHERE id = $1 AND course_id = $2 AND is_active = 1',
    [lessonId, courseId]
  );
  if (!lessonCheck) {
    const err = new Error('The lesson does not belong to the selected active course.');
    err.status = 400;
    throw err;
  }

  const enrollment = await tx.get(
    'SELECT id FROM enrollments WHERE user_id = $1 AND course_id = $2',
    [userId, courseId]
  );
  if (!enrollment) {
    const err = new Error('You must be enrolled in this course to save progress.');
    err.status = 403;
    throw err;
  }

  // Idempotency protection: prevent duplicate time accumulation when retrying offline sync
  if (idempotencyKey) {
    const alreadyProcessed = await tx.get(
      'SELECT id FROM sync_events WHERE user_id = $1 AND idempotency_key = $2',
      [userId, idempotencyKey]
    );
    if (alreadyProcessed) {
      const currentProgress = await tx.get(
        'SELECT * FROM user_progress WHERE user_id = $1 AND lesson_id = $2',
        [userId, lessonId]
      );
      return { progress: currentProgress, duplicate: true };
    }
    await tx.query(
      "INSERT INTO sync_events (user_id, idempotency_key, event_type) VALUES ($1, $2, 'progress')",
      [userId, idempotencyKey]
    );
  }

  const previous = await tx.get(
    'SELECT * FROM user_progress WHERE user_id = $1 AND lesson_id = $2',
    [userId, lessonId]
  );

  // Monotonic conflict resolution
  const effectiveStatus = previous?.completion_status === 'completed'
    ? 'completed'
    : (previous?.completion_status === 'in_progress' && completionStatus === 'not_started'
      ? 'in_progress'
      : completionStatus);

  const effectivePercentage = effectiveStatus === 'completed'
    ? 100
    : Math.max(Number(previous?.progress_percentage || 0), percentage);

  const completedAt = effectiveStatus === 'completed'
    ? (previous?.completed_at || new Date().toISOString())
    : null;

  const effectivePosition = lastPositionSeconds > 0
    ? lastPositionSeconds
    : Number(previous?.last_position_seconds || 0);

  let result;
  if (previous) {
    result = await tx.query(
      `UPDATE user_progress
       SET completion_status = $1,
           progress_percentage = $2,
           time_spent_minutes = time_spent_minutes + $3,
           last_position_seconds = $4,
           last_accessed = CURRENT_TIMESTAMP,
           completed_at = $5,
           updated_at = CURRENT_TIMESTAMP
       WHERE user_id = $6 AND lesson_id = $7
       RETURNING *`,
      [effectiveStatus, effectivePercentage, minutes, effectivePosition, completedAt, userId, lessonId]
    );
  } else {
    result = await tx.query(
      `INSERT INTO user_progress (
         user_id, course_id, lesson_id, completion_status,
         progress_percentage, time_spent_minutes, last_position_seconds, completed_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [userId, courseId, lessonId, effectiveStatus, effectivePercentage, minutes, effectivePosition, completedAt]
    );
  }

  return { progress: result.rows[0], duplicate: false };
};

// Get user progress
router.get('/', auth, async (req, res) => {
  try {
    const { course_id, lesson_id } = req.query;
    let query = 'SELECT * FROM user_progress WHERE user_id = $1';
    const params = [req.user.id];
    let paramCount = 1;

    if (course_id) {
      paramCount += 1;
      query += ` AND course_id = $${paramCount}`;
      params.push(parseInt(course_id, 10));
    }

    if (lesson_id) {
      paramCount += 1;
      query += ` AND lesson_id = $${paramCount}`;
      params.push(parseInt(lesson_id, 10));
    }

    query += ' ORDER BY updated_at DESC';
    const result = await db.query(query, params);
    return res.json({ success: true, progress: result.rows });
  } catch (error) {
    logger.error('Get progress error', { error: error.message });
    return res.status(500).json({ success: false, message: 'Error fetching progress' });
  }
});

// Update or create progress
router.post('/', auth, async (req, res) => {
  try {
    if (req.user.role !== 'student') {
      return res.status(403).json({ success: false, message: 'Only students can update learning progress.' });
    }

    const outcome = await db.transaction((tx) => applyProgressUpdateTx(tx, req.user.id, req.body));
    return res.json({
      success: true,
      progress: outcome.progress,
      deduplicated: outcome.duplicate,
    });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ success: false, message: error.message });
    }
    logger.error('Update progress error', { error: error.message });
    return res.status(500).json({ success: false, message: 'Error updating progress' });
  }
});

// Batch sync queued offline progress updates with conflict resolution & idempotency
router.post('/sync', auth, async (req, res) => {
  try {
    if (req.user.role !== 'student') {
      return res.status(403).json({ success: false, message: 'Only students can sync learning progress.' });
    }

    const updates = Array.isArray(req.body.updates) ? req.body.updates : [];
    if (updates.length === 0) {
      return res.json({ success: true, synced: [], skipped_duplicates: [], failed: [] });
    }
    if (updates.length > 100) {
      return res.status(400).json({ success: false, message: 'Batch sync accepts up to 100 items at a time.' });
    }

    const synced = [];
    const skippedDuplicates = [];
    const failed = [];

    for (const item of updates) {
      try {
        const outcome = await db.transaction((tx) => applyProgressUpdateTx(tx, req.user.id, item));
        if (outcome.duplicate) {
          skippedDuplicates.push({
            idempotency_key: item.idempotency_key,
            lesson_id: item.lesson_id,
            progress: outcome.progress,
          });
        } else {
          synced.push({
            idempotency_key: item.idempotency_key || null,
            lesson_id: item.lesson_id,
            progress: outcome.progress,
          });
        }
      } catch (itemError) {
        failed.push({
          idempotency_key: item?.idempotency_key || null,
          lesson_id: item?.lesson_id || null,
          message: itemError.message || 'Validation failed',
          permanent: Boolean(itemError.status && itemError.status >= 400 && itemError.status < 500),
        });
      }
    }

    return res.json({
      success: true,
      synced,
      skipped_duplicates: skippedDuplicates,
      failed,
    });
  } catch (error) {
    logger.error('Batch progress sync error', { error: error.message });
    return res.status(500).json({ success: false, message: 'Error synchronizing offline progress' });
  }
});

// Get student progress (for teachers & admins)
router.get('/students', auth, async (req, res) => {
  try {
    if (req.user.role !== 'teacher' && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const { course_id, user_id, page, limit } = req.query;
    let query = `
      SELECT up.*, u.full_name, u.username, u.class_grade,
             l.title AS lesson_title, c.title AS course_title, c.category
      FROM user_progress up
      JOIN users u ON up.user_id = u.id
      JOIN lessons l ON up.lesson_id = l.id
      JOIN courses c ON up.course_id = c.id
      WHERE 1=1
    `;
    const params = [];
    let paramCount = 0;

    if (course_id) {
      paramCount += 1;
      query += ` AND up.course_id = $${paramCount}`;
      params.push(parseInt(course_id, 10));
    }

    if (user_id) {
      paramCount += 1;
      query += ` AND up.user_id = $${paramCount}`;
      params.push(parseInt(user_id, 10));
    }

    if (req.user.role === 'teacher') {
      paramCount += 1;
      query += ` AND c.created_by = $${paramCount}`;
      params.push(req.user.id);
    }

    query += ' ORDER BY up.updated_at DESC';

    if (page !== undefined || limit !== undefined) {
      const pageNum = Math.max(1, parseInt(page, 10) || 1);
      const limitNum = Math.min(200, Math.max(1, parseInt(limit, 10) || 50));
      paramCount += 1;
      const lIdx = paramCount;
      paramCount += 1;
      const oIdx = paramCount;
      query += ` LIMIT $${lIdx} OFFSET $${oIdx}`;
      params.push(limitNum, (pageNum - 1) * limitNum);
    }

    const result = await db.query(query, params);
    return res.json({ success: true, progress: result.rows });
  } catch (error) {
    logger.error('Get student progress error', { error: error.message });
    return res.status(500).json({ success: false, message: 'Error fetching student progress' });
  }
});

// Get course completion statistics for current user
router.get('/stats/:course_id', auth, async (req, res) => {
  try {
    const courseId = parseInt(req.params.course_id, 10);
    if (!Number.isInteger(courseId) || courseId <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid course ID' });
    }

    const enrollment = await db.get(
      'SELECT id FROM enrollments WHERE user_id = $1 AND course_id = $2',
      [req.user.id, courseId]
    );
    if (!enrollment && req.user.role === 'student') {
      return res.status(403).json({ success: false, message: 'You are not enrolled in this course.' });
    }

    const totalRow = await db.get(
      'SELECT COUNT(*) AS count FROM lessons WHERE course_id = $1 AND is_active = 1',
      [courseId]
    );
    const completedRow = await db.get(
      `SELECT COUNT(*) AS count
       FROM user_progress up
       JOIN lessons l ON l.id = up.lesson_id
       WHERE up.user_id = $1 AND up.course_id = $2 AND up.completion_status = 'completed' AND l.is_active = 1`,
      [req.user.id, courseId]
    );
    const timeRow = await db.get(
      'SELECT SUM(time_spent_minutes) AS total_time FROM user_progress WHERE user_id = $1 AND course_id = $2',
      [req.user.id, courseId]
    );

    const totalLessons = Number(totalRow?.count || 0);
    const completedLessons = Number(completedRow?.count || 0);

    return res.json({
      success: true,
      stats: {
        total_lessons: totalLessons,
        completed_lessons: completedLessons,
        total_time_minutes: Number(timeRow?.total_time || 0),
        completion_percentage: totalLessons > 0 ? Math.round((completedLessons / totalLessons) * 100) : 0,
      },
    });
  } catch (error) {
    logger.error('Get stats error', { error: error.message });
    return res.status(500).json({ success: false, message: 'Error fetching statistics' });
  }
});

module.exports = router;
