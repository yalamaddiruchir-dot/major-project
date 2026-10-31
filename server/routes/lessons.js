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

const ALLOWED_LESSON_TYPES = ['text', 'video', 'audio', 'pdf', 'image', 'interactive', 'quiz'];

const signProtectedUrl = (url, userId) => {
  if (!url || !userId || (!url.startsWith('/uploads/') && !url.startsWith('/api/files/'))) return url;
  if (url.startsWith('/uploads/thumbnails/')) return url;
  const canonical = url.replace(/^\/uploads\//, '/api/files/');
  const token = issueMediaToken(userId, canonical);
  return token ? `${canonical}?media_token=${encodeURIComponent(token)}` : canonical;
};

// Get lessons for a course
router.get('/', auth, async (req, res) => {
  try {
    const courseId = parseInt(req.query.course_id, 10);
    if (!Number.isInteger(courseId) || courseId <= 0) {
      return res.status(400).json({ success: false, message: 'course_id is required' });
    }

    const course = await db.get('SELECT id, created_by, is_active FROM courses WHERE id = $1', [courseId]);
    if (!course) {
      return res.status(404).json({ success: false, message: 'Course not found' });
    }

    const isOwnerOrAdmin = req.user.role === 'admin' || (req.user.role === 'teacher' && course.created_by === req.user.id);
    if (!course.is_active && !isOwnerOrAdmin) {
      return res.status(404).json({ success: false, message: 'Course not found' });
    }

    if (req.user.role === 'student') {
      const enrollment = await db.get(
        'SELECT id FROM enrollments WHERE user_id = $1 AND course_id = $2',
        [req.user.id, courseId]
      );
      if (!enrollment) {
        return res.status(403).json({ success: false, message: 'Enroll in this course to access its lessons.' });
      }
    } else if (req.user.role === 'teacher' && course.created_by !== req.user.id) {
      return res.status(403).json({ success: false, message: 'You can only view lessons in your own courses.' });
    }

    const result = await db.query(
      `SELECT id, course_id, title, description, lesson_type, video_url, audio_url, pdf_url, image_url,
              order_index, duration_minutes, file_size_bytes, is_active
       FROM lessons
       WHERE course_id = $1 ${isOwnerOrAdmin ? '' : 'AND is_active = 1'}
       ORDER BY order_index ASC, id ASC`,
      [courseId]
    );

    return res.json({ success: true, lessons: result.rows });
  } catch (error) {
    logger.error('Get lessons error', { error: error.message });
    return res.status(500).json({ success: false, message: 'Error fetching lessons' });
  }
});

// Get single lesson with translations, learning materials, and inline assessments
router.get('/:id', auth, async (req, res) => {
  try {
    const lessonId = parseInt(req.params.id, 10);
    if (!Number.isInteger(lessonId) || lessonId <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid lesson ID' });
    }

    const lesson = await db.get('SELECT * FROM lessons WHERE id = $1', [lessonId]);
    if (!lesson) {
      return res.status(404).json({ success: false, message: 'Lesson not found' });
    }

    const course = await db.get('SELECT id, created_by, is_active FROM courses WHERE id = $1', [lesson.course_id]);
    if (!course) {
      return res.status(404).json({ success: false, message: 'Course not found' });
    }

    const isOwnerOrAdmin = req.user.role === 'admin' || (req.user.role === 'teacher' && course.created_by === req.user.id);
    if ((!lesson.is_active || !course.is_active) && !isOwnerOrAdmin) {
      return res.status(404).json({ success: false, message: 'Lesson not found' });
    }

    if (req.user.role === 'student') {
      const enrollment = await db.get(
        'SELECT id FROM enrollments WHERE user_id = $1 AND course_id = $2',
        [req.user.id, lesson.course_id]
      );
      if (!enrollment) {
        return res.status(403).json({ success: false, message: 'Enroll in this course to access its lessons.' });
      }
    } else if (req.user.role === 'teacher' && course.created_by !== req.user.id) {
      return res.status(403).json({ success: false, message: 'You can only preview lessons in your own courses.' });
    }

    // Never expose correct_answer to students
    const assessmentCols = isOwnerOrAdmin
      ? 'id, lesson_id, question, options, correct_answer, points, order_index'
      : 'id, lesson_id, question, options, points, order_index';
    const assessments = await db.query(
      `SELECT ${assessmentCols} FROM assessments WHERE lesson_id = $1 ORDER BY order_index ASC`,
      [lessonId]
    );

    const translationsRes = await db.query(
      "SELECT language, title, description, content FROM content_translations WHERE entity_type = 'lesson' AND entity_id = $1",
      [lessonId]
    );
    const translations = {};
    for (const tr of translationsRes.rows) {
      translations[tr.language] = {
        title: tr.title,
        description: tr.description,
        content: tr.content,
      };
    }

    const materialsRes = await db.query(
      'SELECT * FROM learning_materials WHERE lesson_id = $1 ORDER BY id ASC',
      [lessonId]
    );

    const enrichedLesson = {
      ...lesson,
      video_url_signed: signProtectedUrl(lesson.video_url, req.user.id),
      low_bandwidth_video_url_signed: signProtectedUrl(lesson.low_bandwidth_video_url, req.user.id),
      audio_url_signed: signProtectedUrl(lesson.audio_url, req.user.id),
      pdf_url_signed: signProtectedUrl(lesson.pdf_url, req.user.id),
      image_url_signed: signProtectedUrl(lesson.image_url, req.user.id),
      assessments: assessments.rows,
      translations,
      materials: materialsRes.rows.map((m) => ({
        ...m,
        file_url_signed: signProtectedUrl(m.file_url, req.user.id),
        low_bandwidth_url_signed: signProtectedUrl(m.low_bandwidth_url, req.user.id),
      })),
    };

    return res.json({ success: true, lesson: enrichedLesson });
  } catch (error) {
    logger.error('Get lesson error', { error: error.message });
    return res.status(500).json({ success: false, message: 'Error fetching lesson' });
  }
});

// Create lesson (teacher/admin only)
router.post(
  '/',
  auth,
  authorize('teacher', 'admin'),
  [
    body('course_id').isInt({ min: 1 }).withMessage('Valid course_id is required'),
    body('title').trim().isLength({ min: 1, max: 200 }).withMessage('Title is required'),
    body('content').trim().isLength({ min: 1, max: 50000 }).withMessage('Content is required'),
    body('lesson_type').optional().isIn(ALLOWED_LESSON_TYPES).withMessage('Invalid lesson_type'),
    body('video_url')
      .optional({ checkFalsy: true })
      .custom((val) => isAllowedMediaUrl(val, { type: 'video' }))
      .withMessage('Use an uploaded video, HTTPS video file, or YouTube URL.'),
    body('low_bandwidth_video_url')
      .optional({ checkFalsy: true })
      .custom((val) => isAllowedMediaUrl(val, { type: 'video' }))
      .withMessage('Invalid low-bandwidth video URL.'),
    body('audio_url')
      .optional({ checkFalsy: true })
      .custom((val) => isAllowedMediaUrl(val, { type: 'audio' }))
      .withMessage('Use an uploaded audio file or valid HTTPS audio URL.'),
    body('pdf_url')
      .optional({ checkFalsy: true })
      .custom((val) => isAllowedMediaUrl(val, { type: 'pdf' }))
      .withMessage('Use an uploaded PDF or valid HTTPS PDF URL.'),
    body('image_url')
      .optional({ checkFalsy: true })
      .custom((val) => isAllowedMediaUrl(val, { type: 'image' }))
      .withMessage('Use an uploaded image or valid HTTPS image URL.'),
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
      const courseCheck = await db.get('SELECT id, created_by FROM courses WHERE id = $1', [courseId]);
      if (!courseCheck) {
        return res.status(404).json({ success: false, message: 'Course not found' });
      }
      if (req.user.role !== 'admin' && courseCheck.created_by !== req.user.id) {
        return res.status(403).json({ success: false, message: 'You can only add lessons to your own courses.' });
      }

      const title = sanitizeText(req.body.title, 200);
      const description = req.body.description ? sanitizeText(req.body.description, 2000) : null;
      const content = sanitizeText(req.body.content, 50000);
      const lessonType = req.body.lesson_type || 'text';
      const videoUrl = req.body.video_url ? String(req.body.video_url).trim() : null;
      const lowBwVideoUrl = req.body.low_bandwidth_video_url ? String(req.body.low_bandwidth_video_url).trim() : null;
      const audioUrl = req.body.audio_url ? String(req.body.audio_url).trim() : null;
      const pdfUrl = req.body.pdf_url ? String(req.body.pdf_url).trim() : null;
      const imageUrl = req.body.image_url ? String(req.body.image_url).trim() : null;
      const altText = req.body.alt_text ? sanitizeText(req.body.alt_text, 300) : null;
      const fileSizeBytes = Math.max(0, parseInt(req.body.file_size_bytes, 10) || 0);
      const orderIndex = parseInt(req.body.order_index, 10) || 0;
      const durationMinutes = req.body.duration_minutes !== undefined ? Math.max(1, parseInt(req.body.duration_minutes, 10) || 15) : 15;

      const result = await db.query(
        `INSERT INTO lessons (
          course_id, title, description, content, lesson_type,
          video_url, low_bandwidth_video_url, audio_url, pdf_url, image_url,
          alt_text, file_size_bytes, order_index, duration_minutes
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) RETURNING *`,
        [
          courseId, title, description, content, lessonType,
          videoUrl, lowBwVideoUrl, audioUrl, pdfUrl, imageUrl,
          altText, fileSizeBytes, orderIndex, durationMinutes,
        ]
      );

      const lesson = result.rows[0];

      if (req.body.translations && typeof req.body.translations === 'object') {
        for (const [langKey, tr] of Object.entries(req.body.translations)) {
          const normLang = normalizeLanguageCode(langKey);
          if (['en', 'te', 'hi'].includes(normLang) && tr?.title?.trim() && tr?.content?.trim()) {
            await db.query(
              `INSERT INTO content_translations (entity_type, entity_id, language, title, description, content, updated_by)
               VALUES ('lesson', $1, $2, $3, $4, $5, $6)
               ON CONFLICT(entity_type, entity_id, language) DO UPDATE SET
                 title = excluded.title, description = excluded.description, content = excluded.content, updated_at = CURRENT_TIMESTAMP`,
              [
                lesson.id,
                normLang,
                sanitizeText(tr.title, 200),
                tr.description ? sanitizeText(tr.description, 2000) : null,
                sanitizeText(tr.content, 50000),
                req.user.id,
              ]
            );
          }
        }
      }

      return res.status(201).json({ success: true, lesson });
    } catch (error) {
      logger.error('Create lesson error', { error: error.message });
      return res.status(500).json({ success: false, message: 'Error creating lesson' });
    }
  }
);

// Update lesson (owning teacher or admin)
router.put('/:id', auth, authorize('teacher', 'admin'), async (req, res) => {
  try {
    const lessonId = parseInt(req.params.id, 10);
    if (!Number.isInteger(lessonId) || lessonId <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid lesson ID' });
    }

    const existing = await db.get(
      'SELECT l.*, c.created_by FROM lessons l JOIN courses c ON c.id = l.course_id WHERE l.id = $1',
      [lessonId]
    );
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Lesson not found' });
    }
    if (req.user.role !== 'admin' && existing.created_by !== req.user.id) {
      return res.status(403).json({ success: false, message: 'You can only edit lessons in your own courses.' });
    }

    if (req.body.lesson_type !== undefined && !ALLOWED_LESSON_TYPES.includes(req.body.lesson_type)) {
      return res.status(400).json({ success: false, message: 'Invalid lesson_type.' });
    }
    if (req.body.video_url && !isAllowedMediaUrl(req.body.video_url, { type: 'video' })) {
      return res.status(400).json({ success: false, message: 'Use an uploaded video, HTTPS video file, or YouTube URL.' });
    }
    if (req.body.low_bandwidth_video_url && !isAllowedMediaUrl(req.body.low_bandwidth_video_url, { type: 'video' })) {
      return res.status(400).json({ success: false, message: 'Invalid low-bandwidth video URL.' });
    }
    if (req.body.audio_url && !isAllowedMediaUrl(req.body.audio_url, { type: 'audio' })) {
      return res.status(400).json({ success: false, message: 'Invalid audio URL.' });
    }
    if (req.body.pdf_url && !isAllowedMediaUrl(req.body.pdf_url, { type: 'pdf' })) {
      return res.status(400).json({ success: false, message: 'Invalid PDF URL.' });
    }
    if (req.body.image_url && !isAllowedMediaUrl(req.body.image_url, { type: 'image' })) {
      return res.status(400).json({ success: false, message: 'Invalid image URL.' });
    }

    const title = req.body.title !== undefined ? sanitizeText(req.body.title, 200) : existing.title;
    const description = req.body.description !== undefined
      ? (req.body.description ? sanitizeText(req.body.description, 2000) : null)
      : existing.description;
    const content = req.body.content !== undefined ? sanitizeText(req.body.content, 50000) : existing.content;
    if (!title || !content) {
      return res.status(400).json({ success: false, message: 'Title and content are required.' });
    }

    const lessonType = req.body.lesson_type !== undefined ? req.body.lesson_type : existing.lesson_type;
    const videoUrl = req.body.video_url !== undefined ? (req.body.video_url || null) : existing.video_url;
    const lowBwVideoUrl = req.body.low_bandwidth_video_url !== undefined ? (req.body.low_bandwidth_video_url || null) : existing.low_bandwidth_video_url;
    const audioUrl = req.body.audio_url !== undefined ? (req.body.audio_url || null) : existing.audio_url;
    const pdfUrl = req.body.pdf_url !== undefined ? (req.body.pdf_url || null) : existing.pdf_url;
    const imageUrl = req.body.image_url !== undefined ? (req.body.image_url || null) : existing.image_url;
    const altText = req.body.alt_text !== undefined ? (req.body.alt_text ? sanitizeText(req.body.alt_text, 300) : null) : existing.alt_text;
    const fileSizeBytes = req.body.file_size_bytes !== undefined ? Math.max(0, parseInt(req.body.file_size_bytes, 10) || 0) : existing.file_size_bytes;
    const orderIndex = req.body.order_index !== undefined ? (parseInt(req.body.order_index, 10) || 0) : existing.order_index;
    const durationMinutes = req.body.duration_minutes !== undefined ? (parseInt(req.body.duration_minutes, 10) || 15) : existing.duration_minutes;
    const isActive = req.body.is_active !== undefined ? (req.body.is_active ? 1 : 0) : existing.is_active;

    const result = await db.query(
      `UPDATE lessons SET
         title = $1, description = $2, content = $3, lesson_type = $4,
         video_url = $5, low_bandwidth_video_url = $6, audio_url = $7, pdf_url = $8, image_url = $9,
         alt_text = $10, file_size_bytes = $11, order_index = $12, duration_minutes = $13, is_active = $14,
         updated_at = CURRENT_TIMESTAMP
       WHERE id = $15 RETURNING *`,
      [
        title, description, content, lessonType,
        videoUrl, lowBwVideoUrl, audioUrl, pdfUrl, imageUrl,
        altText, fileSizeBytes, orderIndex, durationMinutes, isActive, lessonId,
      ]
    );

    if (req.body.translations && typeof req.body.translations === 'object') {
      for (const [langKey, tr] of Object.entries(req.body.translations)) {
        const normLang = normalizeLanguageCode(langKey);
        if (['en', 'te', 'hi'].includes(normLang)) {
          if (tr?.title?.trim() && tr?.content?.trim()) {
            await db.query(
              `INSERT INTO content_translations (entity_type, entity_id, language, title, description, content, updated_by)
               VALUES ('lesson', $1, $2, $3, $4, $5, $6)
               ON CONFLICT(entity_type, entity_id, language) DO UPDATE SET
                 title = excluded.title, description = excluded.description, content = excluded.content, updated_at = CURRENT_TIMESTAMP`,
              [
                lessonId,
                normLang,
                sanitizeText(tr.title, 200),
                tr.description ? sanitizeText(tr.description, 2000) : null,
                sanitizeText(tr.content, 50000),
                req.user.id,
              ]
            );
          } else if (tr && tr.remove) {
            await db.query(
              "DELETE FROM content_translations WHERE entity_type = 'lesson' AND entity_id = $1 AND language = $2",
              [lessonId, normLang]
            );
          }
        }
      }
    }

    return res.json({ success: true, lesson: result.rows[0] });
  } catch (error) {
    logger.error('Update lesson error', { error: error.message });
    return res.status(500).json({ success: false, message: 'Error updating lesson' });
  }
});

// Delete lesson (admin or owning teacher)
router.delete('/:id', auth, authorize('teacher', 'admin'), async (req, res) => {
  try {
    const lessonId = parseInt(req.params.id, 10);
    if (!Number.isInteger(lessonId) || lessonId <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid lesson ID' });
    }

    const existing = await db.get(
      'SELECT l.id, c.created_by FROM lessons l JOIN courses c ON c.id = l.course_id WHERE l.id = $1',
      [lessonId]
    );
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Lesson not found' });
    }
    if (req.user.role !== 'admin' && existing.created_by !== req.user.id) {
      return res.status(403).json({ success: false, message: 'You can only delete lessons in your own courses.' });
    }

    await db.query('DELETE FROM lessons WHERE id = $1', [lessonId]);
    return res.json({ success: true, message: 'Lesson deleted successfully' });
  } catch (error) {
    logger.error('Delete lesson error', { error: error.message });
    return res.status(500).json({ success: false, message: 'Error deleting lesson' });
  }
});

module.exports = router;
