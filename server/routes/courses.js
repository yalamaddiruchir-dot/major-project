const express = require('express');
const { body, validationResult } = require('express-validator');
const db = require('../database/connection');
const { auth, optionalAuth, authorize } = require('../middleware/auth');
const {
  sanitizeText,
  escapeLikePattern,
  normalizeLanguageCode,
  isAllowedMediaUrl,
  issueMediaToken,
} = require('../utils/security');
const logger = require('../utils/logger');

const router = express.Router();

const attachSignedUrl = (url, userId) => {
  if (!url || !userId || !url.startsWith('/uploads/') && !url.startsWith('/api/files/')) return url;
  if (url.startsWith('/uploads/thumbnails/')) return url;
  const canonical = url.replace(/^\/uploads\//, '/api/files/');
  const token = issueMediaToken(userId, canonical);
  return token ? `${canonical}?media_token=${encodeURIComponent(token)}` : canonical;
};

// Get all courses (supports search, category, language, pagination, and multilingual titles)
router.get('/', optionalAuth, async (req, res) => {
  try {
    const { category, language, search, page, limit, include_inactive } = req.query;
    const canViewInactive = include_inactive === 'true' && req.user && ['admin', 'teacher'].includes(req.user.role);

    let whereSql = canViewInactive
      ? (req.user.role === 'admin' ? 'WHERE 1=1' : 'WHERE (c.is_active = 1 OR c.created_by = $1)')
      : 'WHERE c.is_active = 1';
    const params = canViewInactive && req.user.role === 'teacher' ? [req.user.id] : [];
    let paramCount = params.length;

    if (category) {
      paramCount += 1;
      whereSql += ` AND c.category = $${paramCount}`;
      params.push(String(category));
    }

    if (language) {
      const norm = normalizeLanguageCode(language);
      const aliases = norm === 'en' ? ['en', 'english'] : norm === 'hi' ? ['hi', 'hindi'] : ['te', 'telugu', 'regional'];
      const placeholders = aliases.map((val) => {
        paramCount += 1;
        params.push(val);
        return `$${paramCount}`;
      });
      whereSql += ` AND (LOWER(c.language) IN (${placeholders.join(', ')}) OR EXISTS (
        SELECT 1 FROM content_translations ct WHERE ct.entity_type = 'course' AND ct.entity_id = c.id AND ct.language = $${placeholders[0].slice(1)}
      ))`;
    }

    if (search) {
      paramCount += 1;
      whereSql += ` AND (
        LOWER(c.title) LIKE LOWER($${paramCount}) ESCAPE '\\'
        OR LOWER(COALESCE(c.description, '')) LIKE LOWER($${paramCount}) ESCAPE '\\'
        OR EXISTS (
          SELECT 1 FROM content_translations ct
          WHERE ct.entity_type = 'course' AND ct.entity_id = c.id
            AND (LOWER(ct.title) LIKE LOWER($${paramCount}) ESCAPE '\\' OR LOWER(COALESCE(ct.description, '')) LIKE LOWER($${paramCount}) ESCAPE '\\')
        )
      )`;
      params.push(`%${escapeLikePattern(search)}%`);
    }

    const totalRow = await db.get(`SELECT COUNT(*) AS count FROM courses c ${whereSql}`, params);
    const total = Number(totalRow?.count || 0);

    let paginationSql = '';
    let paginationMeta = null;
    if (page !== undefined || limit !== undefined) {
      const pageNum = Math.max(1, parseInt(page, 10) || 1);
      const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 12));
      const offset = (pageNum - 1) * limitNum;
      paramCount += 1;
      const lIdx = paramCount;
      paramCount += 1;
      const oIdx = paramCount;
      paginationSql = ` LIMIT $${lIdx} OFFSET $${oIdx}`;
      params.push(limitNum, offset);
      paginationMeta = {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.max(1, Math.ceil(total / limitNum)),
      };
    }

    const result = await db.query(
      `SELECT c.*,
              u.full_name AS created_by_name,
              (SELECT COUNT(*) FROM lessons l WHERE l.course_id = c.id AND l.is_active = 1) AS lesson_count,
              (SELECT COUNT(*) FROM enrollments e WHERE e.course_id = c.id) AS enrolled_count
       FROM courses c
       LEFT JOIN users u ON c.created_by = u.id
       ${whereSql}
       ORDER BY c.created_at DESC${paginationSql}`,
      params
    );

    const courseIds = result.rows.map((r) => r.id);
    const translationsByCourse = {};
    if (courseIds.length > 0) {
      const placeholders = courseIds.map((_, idx) => `$${idx + 1}`).join(', ');
      const trRes = await db.query(
        `SELECT entity_id, language, title, description
         FROM content_translations
         WHERE entity_type = 'course' AND entity_id IN (${placeholders})`,
        courseIds
      );
      for (const row of trRes.rows) {
        if (!translationsByCourse[row.entity_id]) translationsByCourse[row.entity_id] = {};
        translationsByCourse[row.entity_id][row.language] = {
          title: row.title,
          description: row.description,
        };
      }
    }

    const courses = result.rows.map((course) => ({
      ...course,
      lesson_count: Number(course.lesson_count || 0),
      enrolled_count: Number(course.enrolled_count || 0),
      translations: translationsByCourse[course.id] || {},
    }));

    return res.json({
      success: true,
      courses,
      ...(paginationMeta ? { pagination: paginationMeta } : {}),
    });
  } catch (error) {
    logger.error('Get courses error', { error: error.message });
    return res.status(500).json({ success: false, message: 'Error fetching courses' });
  }
});

// Get single course with lessons, translations, and published assessments summary
router.get('/:id', optionalAuth, async (req, res) => {
  try {
    const courseId = parseInt(req.params.id, 10);
    if (!Number.isInteger(courseId) || courseId <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid course ID' });
    }

    const course = await db.get(
      `SELECT c.*, u.full_name AS created_by_name
       FROM courses c
       LEFT JOIN users u ON c.created_by = u.id
       WHERE c.id = $1`,
      [courseId]
    );

    if (!course) {
      return res.status(404).json({ success: false, message: 'Course not found' });
    }

    const isOwnerOrAdmin = req.user && (req.user.role === 'admin' || (req.user.role === 'teacher' && course.created_by === req.user.id));
    if (!course.is_active && !isOwnerOrAdmin) {
      return res.status(404).json({ success: false, message: 'Course not found' });
    }

    const lessonsResult = await db.query(
      `SELECT id, course_id, title, description, lesson_type, order_index, duration_minutes, file_size_bytes, is_active
       FROM lessons
       WHERE course_id = $1 ${isOwnerOrAdmin ? '' : 'AND is_active = 1'}
       ORDER BY order_index ASC, id ASC`,
      [courseId]
    );

    const translationsRes = await db.query(
      `SELECT language, title, description
       FROM content_translations
       WHERE entity_type = 'course' AND entity_id = $1`,
      [courseId]
    );
    const translations = {};
    for (const tr of translationsRes.rows) {
      translations[tr.language] = { title: tr.title, description: tr.description };
    }

    const examsRes = await db.query(
      `SELECT id, course_id, lesson_id, title, description, time_limit_minutes,
              passing_percentage, total_marks, max_attempts, available_from, available_until,
              is_required_for_certificate, is_published
       FROM course_assessments
       WHERE course_id = $1 AND is_active = 1 ${isOwnerOrAdmin ? '' : 'AND is_published = 1'}
       ORDER BY id ASC`,
      [courseId]
    );

    course.lessons = lessonsResult.rows;
    course.translations = translations;
    course.course_assessments = examsRes.rows;

    return res.json({ success: true, course });
  } catch (error) {
    logger.error('Get course error', { error: error.message });
    return res.status(500).json({ success: false, message: 'Error fetching course' });
  }
});

// Download full offline course bundle (enrolled student, course teacher, or admin)
router.get('/:id/offline-bundle', auth, async (req, res) => {
  try {
    const courseId = parseInt(req.params.id, 10);
    if (!Number.isInteger(courseId) || courseId <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid course ID' });
    }

    const course = await db.get(
      `SELECT c.*, u.full_name AS created_by_name
       FROM courses c LEFT JOIN users u ON c.created_by = u.id
       WHERE c.id = $1 AND c.is_active = 1`,
      [courseId]
    );
    if (!course) {
      return res.status(404).json({ success: false, message: 'Course not found' });
    }

    if (req.user.role === 'student') {
      const enrolled = await db.get(
        'SELECT id FROM enrollments WHERE user_id = $1 AND course_id = $2',
        [req.user.id, courseId]
      );
      if (!enrolled) {
        return res.status(403).json({ success: false, message: 'Enroll in this course before downloading it for offline use.' });
      }
    } else if (req.user.role === 'teacher' && course.created_by !== req.user.id) {
      return res.status(403).json({ success: false, message: 'You can only download offline bundles for your own courses.' });
    }

    const courseTrRes = await db.query(
      "SELECT language, title, description FROM content_translations WHERE entity_type = 'course' AND entity_id = $1",
      [courseId]
    );
    const courseTranslations = {};
    for (const tr of courseTrRes.rows) {
      courseTranslations[tr.language] = { title: tr.title, description: tr.description };
    }
    course.translations = courseTranslations;

    const lessonsRes = await db.query(
      'SELECT * FROM lessons WHERE course_id = $1 AND is_active = 1 ORDER BY order_index ASC, id ASC',
      [courseId]
    );

    const materialsRes = await db.query(
      'SELECT * FROM learning_materials WHERE course_id = $1 ORDER BY id ASC',
      [courseId]
    );

    const lessons = [];
    for (const rawLesson of lessonsRes.rows) {
      const trRes = await db.query(
        "SELECT language, title, description, content FROM content_translations WHERE entity_type = 'lesson' AND entity_id = $1",
        [rawLesson.id]
      );
      const lessonTranslations = {};
      for (const tr of trRes.rows) {
        lessonTranslations[tr.language] = {
          title: tr.title,
          description: tr.description,
          content: tr.content,
        };
      }

      // Never include correct_answer in student offline bundles
      const inlineQuizRes = await db.query(
        'SELECT id, lesson_id, question, options, points, order_index FROM assessments WHERE lesson_id = $1 ORDER BY order_index ASC',
        [rawLesson.id]
      );

      lessons.push({
        ...rawLesson,
        video_url_signed: attachSignedUrl(rawLesson.video_url, req.user.id),
        low_bandwidth_video_url_signed: attachSignedUrl(rawLesson.low_bandwidth_video_url, req.user.id),
        audio_url_signed: attachSignedUrl(rawLesson.audio_url, req.user.id),
        pdf_url_signed: attachSignedUrl(rawLesson.pdf_url, req.user.id),
        image_url_signed: attachSignedUrl(rawLesson.image_url, req.user.id),
        translations: lessonTranslations,
        assessments: inlineQuizRes.rows,
        materials: materialsRes.rows
          .filter((m) => m.lesson_id === rawLesson.id)
          .map((m) => ({
            ...m,
            file_url_signed: attachSignedUrl(m.file_url, req.user.id),
            low_bandwidth_url_signed: attachSignedUrl(m.low_bandwidth_url, req.user.id),
          })),
      });
    }

    const courseMaterials = materialsRes.rows
      .filter((m) => !m.lesson_id)
      .map((m) => ({
        ...m,
        file_url_signed: attachSignedUrl(m.file_url, req.user.id),
        low_bandwidth_url_signed: attachSignedUrl(m.low_bandwidth_url, req.user.id),
      }));

    return res.json({
      success: true,
      bundle: {
        course: { ...course, lessons: lessons.map(({ id, course_id, title, description, lesson_type, order_index, duration_minutes }) => ({ id, course_id, title, description, lesson_type, order_index, duration_minutes })) },
        lessons,
        courseMaterials,
        downloadedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    logger.error('Offline bundle error', { error: error.message });
    return res.status(500).json({ success: false, message: 'Error preparing offline bundle' });
  }
});

// Create course (teacher/admin only)
router.post(
  '/',
  auth,
  authorize('teacher', 'admin'),
  [
    body('title').trim().isLength({ min: 1, max: 200 }).withMessage('Title is required (max 200 characters)'),
    body('description').optional({ nullable: true }).isLength({ max: 5000 }),
    body('category').optional({ nullable: true }).isLength({ max: 100 }),
    body('language').optional({ nullable: true }).isLength({ max: 30 }),
    body('passing_percentage').optional().isInt({ min: 0, max: 100 }),
    body('thumbnail_url')
      .optional({ checkFalsy: true })
      .custom((val) => isAllowedMediaUrl(val, { type: 'thumbnail' }))
      .withMessage('Thumbnail URL must be a valid HTTPS image or uploaded thumbnail path.'),
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

      const title = sanitizeText(req.body.title, 200);
      const description = req.body.description ? sanitizeText(req.body.description, 5000) : null;
      const category = req.body.category ? sanitizeText(req.body.category, 100) : null;
      const language = normalizeLanguageCode(req.body.language);
      const level = ['beginner', 'intermediate', 'advanced'].includes(req.body.level) ? req.body.level : 'beginner';
      const passingPercentage = req.body.passing_percentage !== undefined ? Number(req.body.passing_percentage) : 60;
      const thumbnailUrl = req.body.thumbnail_url ? String(req.body.thumbnail_url).trim() : null;

      const result = await db.query(
        `INSERT INTO courses (title, description, category, language, level, passing_percentage, thumbnail_url, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
        [title, description, category, language, level, passingPercentage, thumbnailUrl, req.user.id]
      );

      const course = result.rows[0];
      if (req.body.translations && typeof req.body.translations === 'object') {
        for (const [langKey, tr] of Object.entries(req.body.translations)) {
          const normLang = normalizeLanguageCode(langKey);
          if (['en', 'te', 'hi'].includes(normLang) && tr?.title?.trim()) {
            await db.query(
              `INSERT INTO content_translations (entity_type, entity_id, language, title, description, updated_by)
               VALUES ('course', $1, $2, $3, $4, $5)
               ON CONFLICT(entity_type, entity_id, language) DO UPDATE SET
                 title = excluded.title, description = excluded.description, updated_at = CURRENT_TIMESTAMP`,
              [course.id, normLang, sanitizeText(tr.title, 200), tr.description ? sanitizeText(tr.description, 5000) : null, req.user.id]
            );
          }
        }
      }

      return res.status(201).json({ success: true, course });
    } catch (error) {
      logger.error('Create course error', { error: error.message });
      return res.status(500).json({ success: false, message: 'Error creating course' });
    }
  }
);

// Update course (owning teacher or admin)
router.put('/:id', auth, authorize('teacher', 'admin'), async (req, res) => {
  try {
    const courseId = parseInt(req.params.id, 10);
    if (!Number.isInteger(courseId) || courseId <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid course ID' });
    }

    const courseCheck = await db.get('SELECT * FROM courses WHERE id = $1', [courseId]);
    if (!courseCheck) {
      return res.status(404).json({ success: false, message: 'Course not found' });
    }

    if (req.user.role !== 'admin' && courseCheck.created_by !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Permission denied' });
    }

    if (req.body.thumbnail_url && !isAllowedMediaUrl(req.body.thumbnail_url, { type: 'thumbnail' })) {
      return res.status(400).json({
        success: false,
        message: 'Thumbnail URL must be a valid HTTPS image or uploaded thumbnail path.',
      });
    }

    const title = req.body.title !== undefined ? sanitizeText(req.body.title, 200) : courseCheck.title;
    if (!title) {
      return res.status(400).json({ success: false, message: 'Title cannot be empty' });
    }
    const description = req.body.description !== undefined
      ? (req.body.description ? sanitizeText(req.body.description, 5000) : null)
      : courseCheck.description;
    const category = req.body.category !== undefined
      ? (req.body.category ? sanitizeText(req.body.category, 100) : null)
      : courseCheck.category;
    const language = req.body.language !== undefined
      ? normalizeLanguageCode(req.body.language)
      : courseCheck.language;
    const thumbnailUrl = req.body.thumbnail_url !== undefined
      ? (req.body.thumbnail_url ? String(req.body.thumbnail_url).trim() : null)
      : courseCheck.thumbnail_url;
    const isActive = req.body.is_active !== undefined ? (req.body.is_active ? 1 : 0) : courseCheck.is_active;
    const passingPercentage = req.body.passing_percentage !== undefined
      ? Math.min(100, Math.max(0, Number(req.body.passing_percentage) || 60))
      : (courseCheck.passing_percentage ?? 60);

    const result = await db.query(
      `UPDATE courses
       SET title = $1, description = $2, category = $3, language = $4,
           thumbnail_url = $5, is_active = $6, passing_percentage = $7,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $8 RETURNING *`,
      [title, description, category, language, thumbnailUrl, isActive, passingPercentage, courseId]
    );

    if (req.body.translations && typeof req.body.translations === 'object') {
      for (const [langKey, tr] of Object.entries(req.body.translations)) {
        const normLang = normalizeLanguageCode(langKey);
        if (['en', 'te', 'hi'].includes(normLang) && tr?.title?.trim()) {
          await db.query(
            `INSERT INTO content_translations (entity_type, entity_id, language, title, description, updated_by)
             VALUES ('course', $1, $2, $3, $4, $5)
             ON CONFLICT(entity_type, entity_id, language) DO UPDATE SET
               title = excluded.title, description = excluded.description, updated_at = CURRENT_TIMESTAMP`,
            [courseId, normLang, sanitizeText(tr.title, 200), tr.description ? sanitizeText(tr.description, 5000) : null, req.user.id]
          );
        }
      }
    }

    return res.json({ success: true, course: result.rows[0] });
  } catch (error) {
    logger.error('Update course error', { error: error.message });
    return res.status(500).json({ success: false, message: 'Error updating course' });
  }
});

// Delete course (admin or owning teacher)
router.delete('/:id', auth, authorize('teacher', 'admin'), async (req, res) => {
  try {
    const courseId = parseInt(req.params.id, 10);
    if (!Number.isInteger(courseId) || courseId <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid course ID' });
    }

    const existing = await db.get('SELECT id, created_by FROM courses WHERE id = $1', [courseId]);
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Course not found' });
    }

    if (req.user.role !== 'admin' && existing.created_by !== req.user.id) {
      return res.status(403).json({ success: false, message: 'You can only delete courses you created.' });
    }

    await db.query('DELETE FROM courses WHERE id = $1', [courseId]);
    return res.json({ success: true, message: 'Course deleted successfully' });
  } catch (error) {
    logger.error('Delete course error', { error: error.message });
    return res.status(500).json({ success: false, message: 'Error deleting course' });
  }
});

module.exports = router;
