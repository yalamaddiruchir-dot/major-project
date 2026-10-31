const express = require('express');
const { body, validationResult } = require('express-validator');
const db = require('../database/connection');
const { auth, authorize } = require('../middleware/auth');
const {
  sanitizeText,
  normalizeLanguageCode,
  isAllowedMediaUrl,
  issueMediaToken,
} = require('../utils/security');
const logger = require('../utils/logger');

const router = express.Router();

const signUrl = (url, userId) => {
  if (!url || !userId || (!url.startsWith('/uploads/') && !url.startsWith('/api/files/'))) return url;
  if (url.startsWith('/uploads/thumbnails/')) return url;
  const canonical = url.replace(/^\/uploads\//, '/api/files/');
  const token = issueMediaToken(userId, canonical);
  return token ? `${canonical}?media_token=${encodeURIComponent(token)}` : canonical;
};

// Get learning materials for a course or lesson
router.get('/', auth, async (req, res) => {
  try {
    const courseId = req.query.course_id ? parseInt(req.query.course_id, 10) : null;
    const lessonId = req.query.lesson_id ? parseInt(req.query.lesson_id, 10) : null;

    if (!courseId && !lessonId) {
      return res.status(400).json({ success: false, message: 'course_id or lesson_id is required' });
    }

    let resolvedCourseId = courseId;
    if (!resolvedCourseId && lessonId) {
      const lesson = await db.get('SELECT course_id FROM lessons WHERE id = $1', [lessonId]);
      if (!lesson) return res.status(404).json({ success: false, message: 'Lesson not found' });
      resolvedCourseId = lesson.course_id;
    }

    const course = await db.get('SELECT id, created_by, is_active FROM courses WHERE id = $1', [resolvedCourseId]);
    if (!course) {
      return res.status(404).json({ success: false, message: 'Course not found' });
    }

    if (req.user.role === 'student') {
      const enrollment = await db.get(
        'SELECT id FROM enrollments WHERE user_id = $1 AND course_id = $2',
        [req.user.id, resolvedCourseId]
      );
      if (!enrollment) {
        return res.status(403).json({ success: false, message: 'Enroll in this course to access its learning materials.' });
      }
    } else if (req.user.role === 'teacher' && course.created_by !== req.user.id) {
      return res.status(403).json({ success: false, message: 'You can only view materials in your own courses.' });
    }

    const params = [resolvedCourseId];
    let sql = 'SELECT * FROM learning_materials WHERE course_id = $1';
    if (lessonId) {
      sql += ' AND lesson_id = $2';
      params.push(lessonId);
    }
    sql += ' ORDER BY created_at DESC, id DESC';

    const result = await db.query(sql, params);
    const materials = result.rows.map((m) => ({
      ...m,
      file_url_signed: signUrl(m.file_url, req.user.id),
      low_bandwidth_url_signed: signUrl(m.low_bandwidth_url, req.user.id),
    }));

    return res.json({ success: true, materials });
  } catch (error) {
    logger.error('Get materials error', { error: error.message });
    return res.status(500).json({ success: false, message: 'Error fetching learning materials' });
  }
});

// Create learning material (owning teacher or admin)
router.post(
  '/',
  auth,
  authorize('teacher', 'admin'),
  [
    body('course_id').isInt({ min: 1 }).withMessage('Valid course_id is required'),
    body('lesson_id').optional({ nullable: true, checkFalsy: true }).isInt({ min: 1 }),
    body('title').trim().isLength({ min: 1, max: 200 }).withMessage('Title is required'),
    body('material_type').isIn(['pdf', 'image', 'audio', 'video', 'document']).withMessage('Invalid material_type'),
    body('file_url')
      .trim()
      .notEmpty()
      .custom((val) => isAllowedMediaUrl(val, { type: 'any' }))
      .withMessage('Valid uploaded file path or HTTPS resource URL is required.'),
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

      const courseId = Number(req.body.course_id);
      const lessonId = req.body.lesson_id ? Number(req.body.lesson_id) : null;

      const course = await db.get('SELECT id, created_by FROM courses WHERE id = $1', [courseId]);
      if (!course) {
        return res.status(404).json({ success: false, message: 'Course not found' });
      }
      if (req.user.role !== 'admin' && course.created_by !== req.user.id) {
        return res.status(403).json({ success: false, message: 'You can only add materials to your own courses.' });
      }

      if (lessonId) {
        const lesson = await db.get('SELECT id FROM lessons WHERE id = $1 AND course_id = $2', [lessonId, courseId]);
        if (!lesson) {
          return res.status(400).json({ success: false, message: 'Lesson does not belong to the specified course.' });
        }
      }

      if (req.body.low_bandwidth_url && !isAllowedMediaUrl(req.body.low_bandwidth_url, { type: 'any' })) {
        return res.status(400).json({ success: false, message: 'Invalid low_bandwidth_url.' });
      }

      const created = await db.query(
        `INSERT INTO learning_materials (
           course_id, lesson_id, title, description, material_type,
           file_url, low_bandwidth_url, file_name, mime_type, file_size_bytes,
           alt_text, language, is_downloadable, uploaded_by
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) RETURNING *`,
        [
          courseId,
          lessonId,
          sanitizeText(req.body.title, 200),
          req.body.description ? sanitizeText(req.body.description, 2000) : null,
          req.body.material_type,
          String(req.body.file_url).trim(),
          req.body.low_bandwidth_url ? String(req.body.low_bandwidth_url).trim() : null,
          req.body.file_name ? sanitizeText(req.body.file_name, 200) : null,
          req.body.mime_type ? sanitizeText(req.body.mime_type, 100) : null,
          Math.max(0, parseInt(req.body.file_size_bytes, 10) || 0),
          req.body.alt_text ? sanitizeText(req.body.alt_text, 300) : null,
          normalizeLanguageCode(req.body.language),
          req.body.is_downloadable === undefined ? 1 : (req.body.is_downloadable ? 1 : 0),
          req.user.id,
        ]
      );

      const m = created.rows[0];
      return res.status(201).json({
        success: true,
        material: {
          ...m,
          file_url_signed: signUrl(m.file_url, req.user.id),
        },
      });
    } catch (error) {
      logger.error('Create material error', { error: error.message });
      return res.status(500).json({ success: false, message: 'Error creating learning material' });
    }
  }
);

// Delete learning material
router.delete('/:id', auth, authorize('teacher', 'admin'), async (req, res) => {
  try {
    const materialId = parseInt(req.params.id, 10);
    if (!Number.isInteger(materialId) || materialId <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid material ID' });
    }

    const existing = await db.get(
      `SELECT m.*, c.created_by
       FROM learning_materials m
       JOIN courses c ON c.id = m.course_id
       WHERE m.id = $1`,
      [materialId]
    );
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Material not found' });
    }
    if (req.user.role !== 'admin' && existing.created_by !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Permission denied' });
    }

    await db.query('DELETE FROM learning_materials WHERE id = $1', [materialId]);
    return res.json({ success: true, message: 'Learning material deleted successfully' });
  } catch (error) {
    logger.error('Delete material error', { error: error.message });
    return res.status(500).json({ success: false, message: 'Error deleting learning material' });
  }
});

module.exports = router;
