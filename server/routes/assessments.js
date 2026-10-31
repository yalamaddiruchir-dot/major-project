const express = require('express');
const { body, validationResult } = require('express-validator');
const db = require('../database/connection');
const { auth, authorize } = require('../middleware/auth');
const { sanitizeText } = require('../utils/security');
const logger = require('../utils/logger');

const router = express.Router();

const EXPIRY_GRACE_MS = 15 * 1000;

const parseJsonSafe = (value, fallback = null) => {
  if (value === null || value === undefined) return fallback;
  if (typeof value === 'object') return value;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch (_err) {
      return fallback;
    }
  }
  return fallback;
};

const normalizeShortAnswer = (text) => String(text ?? '')
  .trim()
  .toLowerCase()
  .replace(/\s+/g, ' ');

const validateAndPrepareQuestions = (questions) => {
  if (!Array.isArray(questions) || questions.length === 0 || questions.length > 100) {
    throw new Error('Assessment must include between 1 and 100 questions.');
  }

  let totalMarks = 0;
  const prepared = questions.map((q, index) => {
    const qType = q.question_type;
    if (!['mcq', 'true_false', 'short_answer'].includes(qType)) {
      throw new Error(`Question ${index + 1}: Invalid question_type '${qType}'.`);
    }

    const questionText = sanitizeText(q.question_text, 2000);
    if (!questionText) {
      throw new Error(`Question ${index + 1}: question_text is required.`);
    }

    const marks = parseInt(q.marks ?? 1, 10);
    if (!Number.isInteger(marks) || marks < 1 || marks > 100) {
      throw new Error(`Question ${index + 1}: marks must be an integer between 1 and 100.`);
    }
    totalMarks += marks;

    let optionsJson = null;
    let correctAnswerText = '';

    if (qType === 'mcq') {
      const opts = Array.isArray(q.options) ? q.options.map((o) => sanitizeText(o, 500)) : [];
      if (opts.length < 2 || opts.length > 6 || opts.some((o) => !o)) {
        throw new Error(`Question ${index + 1}: MCQ requires 2–6 non-empty options.`);
      }
      const correctIdx = Number(q.correct_answer);
      if (!Number.isInteger(correctIdx) || correctIdx < 0 || correctIdx >= opts.length) {
        throw new Error(`Question ${index + 1}: MCQ requires a valid zero-based correct_answer index.`);
      }
      optionsJson = JSON.stringify(opts);
      correctAnswerText = String(correctIdx);
    } else if (qType === 'true_false') {
      optionsJson = JSON.stringify(['True', 'False']);
      const raw = String(q.correct_answer).trim().toLowerCase();
      if (raw === '0' || raw === 'true') {
        correctAnswerText = '0';
      } else if (raw === '1' || raw === 'false') {
        correctAnswerText = '1';
      } else {
        throw new Error(`Question ${index + 1}: True/False correct_answer must be '0' (True) or '1' (False).`);
      }
    } else if (qType === 'short_answer') {
      const rawAns = sanitizeText(q.correct_answer, 500);
      if (!rawAns) {
        throw new Error(`Question ${index + 1}: Short-answer question requires an expected answer.`);
      }
      correctAnswerText = rawAns;
    }

    return {
      question_type: qType,
      question_text: questionText,
      options_json: optionsJson,
      correct_answer_text: correctAnswerText,
      explanation: q.explanation ? sanitizeText(q.explanation, 1000) : null,
      marks,
      order_index: q.order_index !== undefined ? Number(q.order_index) : index + 1,
    };
  });

  return { prepared, totalMarks };
};

const gradeQuestionAnswer = (question, submittedValue) => {
  if (submittedValue === undefined || submittedValue === null || String(submittedValue).trim() === '') {
    return { isCorrect: false, marksAwarded: 0, cleanValue: '' };
  }

  const rawStr = sanitizeText(submittedValue, 1000);

  if (question.question_type === 'mcq' || question.question_type === 'true_false') {
    let normalized = rawStr.toLowerCase();
    if (question.question_type === 'true_false') {
      if (normalized === 'true') normalized = '0';
      if (normalized === 'false') normalized = '1';
    }
    const isCorrect = normalized === String(question.correct_answer_text);
    return {
      isCorrect,
      marksAwarded: isCorrect ? Number(question.marks) : 0,
      cleanValue: normalized,
    };
  }

  // short_answer: compare against pipe-separated accepted variants
  const acceptedVariants = String(question.correct_answer_text)
    .split('|')
    .map(normalizeShortAnswer)
    .filter(Boolean);
  const candidate = normalizeShortAnswer(rawStr);
  const isCorrect = acceptedVariants.includes(candidate);

  return {
    isCorrect,
    marksAwarded: isCorrect ? Number(question.marks) : 0,
    cleanValue: rawStr,
  };
};

const canRevealAnswers = (exam, passed, isTeacherOrAdmin) => {
  if (isTeacherOrAdmin) return true;
  if (exam.show_correct_answers === 'after_submission') return true;
  if (exam.show_correct_answers === 'after_pass' && passed) return true;
  return false;
};

// ============================================================================
// PART 1: FULL COURSE & SCHEDULED ASSESSMENTS MODULE (/api/assessments/exams)
// ============================================================================

// List course assessments
router.get('/exams', auth, async (req, res) => {
  try {
    const courseId = req.query.course_id ? parseInt(req.query.course_id, 10) : null;
    const params = [];
    let paramCount = 0;

    let sql = `
      SELECT ca.*, c.title AS course_title, c.created_by AS course_owner_id,
             (SELECT COUNT(*) FROM assessment_questions aq WHERE aq.assessment_id = ca.id) AS question_count
      FROM course_assessments ca
      JOIN courses c ON c.id = ca.course_id
      WHERE ca.is_active = 1
    `;

    if (courseId) {
      paramCount += 1;
      sql += ` AND ca.course_id = $${paramCount}`;
      params.push(courseId);
    }

    if (req.user.role === 'teacher') {
      paramCount += 1;
      sql += ` AND c.created_by = $${paramCount}`;
      params.push(req.user.id);
    } else if (req.user.role === 'student') {
      paramCount += 1;
      sql += ` AND ca.is_published = 1 AND c.is_active = 1 AND EXISTS (
        SELECT 1 FROM enrollments e WHERE e.user_id = $${paramCount} AND e.course_id = ca.course_id
      )`;
      params.push(req.user.id);
    }

    sql += ' ORDER BY ca.created_at DESC, ca.id DESC';
    const result = await db.query(sql, params);

    const exams = [];
    for (const exam of result.rows) {
      if (req.user.role === 'student') {
        const attemptsRes = await db.query(
          `SELECT id, attempt_number, status, score, total_marks, percentage, passed, started_at, submitted_at, expires_at
           FROM assessment_attempts
           WHERE assessment_id = $1 AND user_id = $2
           ORDER BY attempt_number DESC`,
          [exam.id, req.user.id]
        );
        const submittedAttempts = attemptsRes.rows.filter((a) => a.status === 'submitted');
        const bestPercentage = submittedAttempts.length > 0
          ? Math.max(...submittedAttempts.map((a) => Number(a.percentage || 0)))
          : null;
        exams.push({
          ...exam,
          question_count: Number(exam.question_count || 0),
          my_attempts: attemptsRes.rows,
          attempts_used: attemptsRes.rows.filter((a) => a.status !== 'in_progress').length,
          best_percentage: bestPercentage,
          has_passed: submittedAttempts.some((a) => Boolean(a.passed)),
        });
      } else {
        const subCount = await db.get(
          "SELECT COUNT(*) AS count, AVG(percentage) AS avg_pct FROM assessment_attempts WHERE assessment_id = $1 AND status = 'submitted'",
          [exam.id]
        );
        exams.push({
          ...exam,
          question_count: Number(exam.question_count || 0),
          submission_count: Number(subCount?.count || 0),
          average_percentage: subCount?.avg_pct !== null && subCount?.avg_pct !== undefined
            ? Math.round(Number(subCount.avg_pct) * 10) / 10
            : null,
        });
      }
    }

    return res.json({ success: true, exams });
  } catch (error) {
    logger.error('List exams error', { error: error.message });
    return res.status(500).json({ success: false, message: 'Error fetching assessments' });
  }
});

// Create course assessment (owning teacher or admin)
router.post(
  '/exams',
  auth,
  authorize('teacher', 'admin'),
  [
    body('course_id').isInt({ min: 1 }).withMessage('Valid course_id is required'),
    body('title').trim().isLength({ min: 1, max: 200 }).withMessage('Assessment title is required'),
    body('passing_percentage').optional().isInt({ min: 0, max: 100 }),
    body('time_limit_minutes').optional({ nullable: true, checkFalsy: true }).isInt({ min: 1, max: 300 }),
    body('max_attempts').optional().isInt({ min: 0, max: 50 }),
    body('show_correct_answers').optional().isIn(['after_submission', 'after_pass', 'never']),
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
      const course = await db.get('SELECT id, created_by FROM courses WHERE id = $1', [courseId]);
      if (!course) {
        return res.status(404).json({ success: false, message: 'Course not found' });
      }
      if (req.user.role !== 'admin' && course.created_by !== req.user.id) {
        return res.status(403).json({ success: false, message: 'You can only create assessments for your own courses.' });
      }

      const lessonId = req.body.lesson_id ? parseInt(req.body.lesson_id, 10) : null;
      if (lessonId) {
        const lesson = await db.get('SELECT id FROM lessons WHERE id = $1 AND course_id = $2', [lessonId, courseId]);
        if (!lesson) {
          return res.status(400).json({ success: false, message: 'Selected lesson does not belong to this course.' });
        }
      }

      let validated;
      try {
        validated = validateAndPrepareQuestions(req.body.questions);
      } catch (validationErr) {
        return res.status(400).json({ success: false, message: validationErr.message });
      }

      const availableFrom = req.body.available_from ? new Date(req.body.available_from).toISOString() : null;
      const availableUntil = req.body.available_until ? new Date(req.body.available_until).toISOString() : null;
      if (availableFrom && availableUntil && new Date(availableFrom) >= new Date(availableUntil)) {
        return res.status(400).json({ success: false, message: 'available_until must be after available_from.' });
      }

      const createdExam = await db.transaction(async (tx) => {
        const ins = await tx.query(
          `INSERT INTO course_assessments (
             course_id, lesson_id, title, description, instructions,
             time_limit_minutes, passing_percentage, total_marks, max_attempts,
             show_correct_answers, available_from, available_until,
             is_required_for_certificate, is_published, created_by
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15) RETURNING *`,
          [
            courseId,
            lessonId,
            sanitizeText(req.body.title, 200),
            req.body.description ? sanitizeText(req.body.description, 2000) : null,
            req.body.instructions ? sanitizeText(req.body.instructions, 2000) : null,
            req.body.time_limit_minutes ? Number(req.body.time_limit_minutes) : null,
            req.body.passing_percentage !== undefined ? Number(req.body.passing_percentage) : 60,
            validated.totalMarks,
            req.body.max_attempts !== undefined ? Number(req.body.max_attempts) : 3,
            req.body.show_correct_answers || 'after_submission',
            availableFrom,
            availableUntil,
            req.body.is_required_for_certificate === undefined ? 1 : (req.body.is_required_for_certificate ? 1 : 0),
            req.body.is_published === undefined ? 1 : (req.body.is_published ? 1 : 0),
            req.user.id,
          ]
        );
        const exam = ins.rows[0];

        const insertedQuestions = [];
        for (const q of validated.prepared) {
          const qIns = await tx.query(
            `INSERT INTO assessment_questions (
               assessment_id, question_type, question_text, options_json,
               correct_answer_text, explanation, marks, order_index
             ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
            [
              exam.id,
              q.question_type,
              q.question_text,
              q.options_json,
              q.correct_answer_text,
              q.explanation,
              q.marks,
              q.order_index,
            ]
          );
          insertedQuestions.push({
            ...qIns.rows[0],
            options: parseJsonSafe(qIns.rows[0].options_json, []),
          });
        }

        return { ...exam, questions: insertedQuestions };
      });

      return res.status(201).json({ success: true, exam: createdExam });
    } catch (error) {
      logger.error('Create exam error', { error: error.message });
      return res.status(500).json({ success: false, message: 'Error creating assessment' });
    }
  }
);

// Get single course assessment (teacher/admin gets questions+keys; student gets safe metadata + own attempts)
router.get('/exams/:id', auth, async (req, res) => {
  try {
    const examId = parseInt(req.params.id, 10);
    if (!Number.isInteger(examId) || examId <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid assessment ID' });
    }

    const exam = await db.get(
      `SELECT ca.*, c.title AS course_title, c.created_by AS course_owner_id
       FROM course_assessments ca
       JOIN courses c ON c.id = ca.course_id
       WHERE ca.id = $1 AND ca.is_active = 1`,
      [examId]
    );
    if (!exam) {
      return res.status(404).json({ success: false, message: 'Assessment not found' });
    }

    const isOwnerOrAdmin = req.user.role === 'admin'
      || (req.user.role === 'teacher' && exam.course_owner_id === req.user.id);

    if (req.user.role === 'teacher' && !isOwnerOrAdmin) {
      return res.status(403).json({ success: false, message: 'You can only view assessments in your own courses.' });
    }

    if (req.user.role === 'student') {
      if (!exam.is_published) {
        return res.status(404).json({ success: false, message: 'Assessment not found' });
      }
      const enrolled = await db.get(
        'SELECT id FROM enrollments WHERE user_id = $1 AND course_id = $2',
        [req.user.id, exam.course_id]
      );
      if (!enrolled) {
        return res.status(403).json({ success: false, message: 'Enroll in this course to view its assessments.' });
      }

      const qCount = await db.get(
        'SELECT COUNT(*) AS count FROM assessment_questions WHERE assessment_id = $1',
        [examId]
      );
      const attempts = await db.query(
        `SELECT id, attempt_number, status, score, total_marks, percentage, passed,
                started_at, expires_at, submitted_at, teacher_feedback
         FROM assessment_attempts
         WHERE assessment_id = $1 AND user_id = $2
         ORDER BY attempt_number DESC`,
        [examId, req.user.id]
      );

      return res.json({
        success: true,
        exam: {
          ...exam,
          question_count: Number(qCount?.count || 0),
          my_attempts: attempts.rows,
        },
      });
    }

    // Teacher (owner) or Admin: include full question definitions for editing
    const questionsRes = await db.query(
      'SELECT * FROM assessment_questions WHERE assessment_id = $1 ORDER BY order_index ASC, id ASC',
      [examId]
    );
    const questions = questionsRes.rows.map((q) => ({
      ...q,
      options: parseJsonSafe(q.options_json, []),
      correct_answer: q.correct_answer_text,
    }));

    return res.json({ success: true, exam: { ...exam, questions } });
  } catch (error) {
    logger.error('Get exam error', { error: error.message });
    return res.status(500).json({ success: false, message: 'Error fetching assessment' });
  }
});

// Edit course assessment (owning teacher or admin)
router.put('/exams/:id', auth, authorize('teacher', 'admin'), async (req, res) => {
  try {
    const examId = parseInt(req.params.id, 10);
    if (!Number.isInteger(examId) || examId <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid assessment ID' });
    }

    const existing = await db.get(
      `SELECT ca.*, c.created_by AS course_owner_id
       FROM course_assessments ca
       JOIN courses c ON c.id = ca.course_id
       WHERE ca.id = $1 AND ca.is_active = 1`,
      [examId]
    );
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Assessment not found' });
    }
    if (req.user.role !== 'admin' && existing.course_owner_id !== req.user.id) {
      return res.status(403).json({ success: false, message: 'You can only edit assessments in your own courses.' });
    }

    let validatedQuestions = null;
    if (req.body.questions !== undefined) {
      try {
        validatedQuestions = validateAndPrepareQuestions(req.body.questions);
      } catch (validationErr) {
        return res.status(400).json({ success: false, message: validationErr.message });
      }
    }

    const title = req.body.title !== undefined ? sanitizeText(req.body.title, 200) : existing.title;
    if (!title) {
      return res.status(400).json({ success: false, message: 'Assessment title cannot be empty.' });
    }

    const availableFrom = req.body.available_from !== undefined
      ? (req.body.available_from ? new Date(req.body.available_from).toISOString() : null)
      : existing.available_from;
    const availableUntil = req.body.available_until !== undefined
      ? (req.body.available_until ? new Date(req.body.available_until).toISOString() : null)
      : existing.available_until;
    if (availableFrom && availableUntil && new Date(availableFrom) >= new Date(availableUntil)) {
      return res.status(400).json({ success: false, message: 'available_until must be after available_from.' });
    }

    const updatedExam = await db.transaction(async (tx) => {
      const totalMarks = validatedQuestions ? validatedQuestions.totalMarks : existing.total_marks;
      const upd = await tx.query(
        `UPDATE course_assessments SET
           title = $1,
           description = $2,
           instructions = $3,
           time_limit_minutes = $4,
           passing_percentage = $5,
           total_marks = $6,
           max_attempts = $7,
           show_correct_answers = $8,
           available_from = $9,
           available_until = $10,
           is_required_for_certificate = $11,
           is_published = $12,
           updated_at = CURRENT_TIMESTAMP
         WHERE id = $13 RETURNING *`,
        [
          title,
          req.body.description !== undefined ? (req.body.description ? sanitizeText(req.body.description, 2000) : null) : existing.description,
          req.body.instructions !== undefined ? (req.body.instructions ? sanitizeText(req.body.instructions, 2000) : null) : existing.instructions,
          req.body.time_limit_minutes !== undefined ? (req.body.time_limit_minutes ? Number(req.body.time_limit_minutes) : null) : existing.time_limit_minutes,
          req.body.passing_percentage !== undefined ? Math.min(100, Math.max(0, Number(req.body.passing_percentage))) : existing.passing_percentage,
          totalMarks,
          req.body.max_attempts !== undefined ? Math.max(0, Number(req.body.max_attempts)) : existing.max_attempts,
          req.body.show_correct_answers || existing.show_correct_answers,
          availableFrom,
          availableUntil,
          req.body.is_required_for_certificate !== undefined ? (req.body.is_required_for_certificate ? 1 : 0) : existing.is_required_for_certificate,
          req.body.is_published !== undefined ? (req.body.is_published ? 1 : 0) : existing.is_published,
          examId,
        ]
      );

      let questionsOut = null;
      if (validatedQuestions) {
        await tx.query('DELETE FROM assessment_questions WHERE assessment_id = $1', [examId]);
        questionsOut = [];
        for (const q of validatedQuestions.prepared) {
          const qIns = await tx.query(
            `INSERT INTO assessment_questions (
               assessment_id, question_type, question_text, options_json,
               correct_answer_text, explanation, marks, order_index
             ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
            [examId, q.question_type, q.question_text, q.options_json, q.correct_answer_text, q.explanation, q.marks, q.order_index]
          );
          questionsOut.push({
            ...qIns.rows[0],
            options: parseJsonSafe(qIns.rows[0].options_json, []),
          });
        }
      }

      return { ...upd.rows[0], ...(questionsOut ? { questions: questionsOut } : {}) };
    });

    return res.json({ success: true, exam: updatedExam });
  } catch (error) {
    logger.error('Update exam error', { error: error.message });
    return res.status(500).json({ success: false, message: 'Error updating assessment' });
  }
});

// Delete course assessment (owning teacher or admin)
router.delete('/exams/:id', auth, authorize('teacher', 'admin'), async (req, res) => {
  try {
    const examId = parseInt(req.params.id, 10);
    if (!Number.isInteger(examId) || examId <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid assessment ID' });
    }

    const existing = await db.get(
      `SELECT ca.id, c.created_by AS course_owner_id
       FROM course_assessments ca
       JOIN courses c ON c.id = ca.course_id
       WHERE ca.id = $1`,
      [examId]
    );
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Assessment not found' });
    }
    if (req.user.role !== 'admin' && existing.course_owner_id !== req.user.id) {
      return res.status(403).json({ success: false, message: 'You can only delete assessments in your own courses.' });
    }

    await db.query('DELETE FROM course_assessments WHERE id = $1', [examId]);
    return res.json({ success: true, message: 'Assessment deleted successfully' });
  } catch (error) {
    logger.error('Delete exam error', { error: error.message });
    return res.status(500).json({ success: false, message: 'Error deleting assessment' });
  }
});

// Start or resume an assessment attempt (students only)
router.post('/exams/:id/start', auth, async (req, res) => {
  try {
    if (req.user.role !== 'student') {
      return res.status(403).json({ success: false, message: 'Only students can start assessment attempts.' });
    }

    const examId = parseInt(req.params.id, 10);
    if (!Number.isInteger(examId) || examId <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid assessment ID' });
    }

    const exam = await db.get(
      `SELECT ca.*, c.is_active AS course_active
       FROM course_assessments ca
       JOIN courses c ON c.id = ca.course_id
       WHERE ca.id = $1 AND ca.is_active = 1 AND ca.is_published = 1 AND c.is_active = 1`,
      [examId]
    );
    if (!exam) {
      return res.status(404).json({ success: false, message: 'Assessment not found or not published.' });
    }

    const enrolled = await db.get(
      'SELECT id FROM enrollments WHERE user_id = $1 AND course_id = $2',
      [req.user.id, exam.course_id]
    );
    if (!enrolled) {
      return res.status(403).json({ success: false, message: 'Enroll in this course before starting its assessment.' });
    }

    const nowMs = Date.now();
    if (exam.available_from && nowMs < new Date(exam.available_from).getTime()) {
      return res.status(403).json({
        success: false,
        message: `This assessment opens on ${new Date(exam.available_from).toISOString()}.`,
      });
    }
    if (exam.available_until && nowMs > new Date(exam.available_until).getTime()) {
      return res.status(403).json({
        success: false,
        message: 'The submission window for this assessment has closed.',
      });
    }

    const questionsRes = await db.query(
      `SELECT id, assessment_id, question_type, question_text, options_json, marks, order_index
       FROM assessment_questions
       WHERE assessment_id = $1
       ORDER BY order_index ASC, id ASC`,
      [examId]
    );
    if (questionsRes.rows.length === 0) {
      return res.status(400).json({ success: false, message: 'This assessment has no questions configured yet.' });
    }

    // Never include correct_answer_text or explanation when sending questions for an active attempt
    const safeQuestions = questionsRes.rows.map((q) => ({
      id: q.id,
      assessment_id: q.assessment_id,
      question_type: q.question_type,
      question_text: q.question_text,
      options: parseJsonSafe(q.options_json, []),
      marks: q.marks,
      order_index: q.order_index,
    }));

    const attemptPayload = await db.transaction(async (tx) => {
      // Expire any stale in_progress attempts past their time limit
      const openAttempts = await tx.query(
        "SELECT * FROM assessment_attempts WHERE assessment_id = $1 AND user_id = $2 AND status = 'in_progress' ORDER BY id DESC",
        [examId, req.user.id]
      );

      for (const open of openAttempts.rows) {
        if (open.expires_at && Date.now() > new Date(open.expires_at).getTime()) {
          await tx.query(
            "UPDATE assessment_attempts SET status = 'expired', submitted_at = CURRENT_TIMESTAMP WHERE id = $1",
            [open.id]
          );
        } else {
          // Resume active attempt
          return {
            resumed: true,
            attempt: {
              ...open,
              draft_answers: parseJsonSafe(open.draft_answers_json, {}),
            },
          };
        }
      }

      const usedAttempts = await tx.get(
        'SELECT COUNT(*) AS count FROM assessment_attempts WHERE assessment_id = $1 AND user_id = $2',
        [examId, req.user.id]
      );
      const countUsed = Number(usedAttempts?.count || 0);
      if (Number(exam.max_attempts) > 0 && countUsed >= Number(exam.max_attempts)) {
        const err = new Error(`Maximum allowed attempts (${exam.max_attempts}) reached for this assessment.`);
        err.status = 403;
        throw err;
      }

      const startedAt = new Date().toISOString();
      const expiresAt = exam.time_limit_minutes
        ? new Date(Date.now() + Number(exam.time_limit_minutes) * 60 * 1000).toISOString()
        : null;

      const created = await tx.query(
        `INSERT INTO assessment_attempts (
           assessment_id, user_id, attempt_number, status,
           draft_answers_json, started_at, expires_at, total_marks
         ) VALUES ($1, $2, $3, 'in_progress', '{}', $4, $5, $6) RETURNING *`,
        [examId, req.user.id, countUsed + 1, startedAt, expiresAt, exam.total_marks]
      );

      return {
        resumed: false,
        attempt: {
          ...created.rows[0],
          draft_answers: {},
        },
      };
    });

    return res.status(attemptPayload.resumed ? 200 : 201).json({
      success: true,
      resumed: attemptPayload.resumed,
      attempt: attemptPayload.attempt,
      exam: {
        id: exam.id,
        course_id: exam.course_id,
        title: exam.title,
        description: exam.description,
        instructions: exam.instructions,
        time_limit_minutes: exam.time_limit_minutes,
        passing_percentage: exam.passing_percentage,
        total_marks: exam.total_marks,
        max_attempts: exam.max_attempts,
      },
      questions: safeQuestions,
    });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ success: false, message: error.message });
    }
    logger.error('Start exam error', { error: error.message });
    return res.status(500).json({ success: false, message: 'Error starting assessment' });
  }
});

// Save draft answers during an active attempt
router.put('/attempts/:attemptId/save', auth, async (req, res) => {
  try {
    const attemptId = parseInt(req.params.attemptId, 10);
    if (!Number.isInteger(attemptId) || attemptId <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid attempt ID' });
    }

    const attempt = await db.get('SELECT * FROM assessment_attempts WHERE id = $1', [attemptId]);
    if (!attempt) {
      return res.status(404).json({ success: false, message: 'Assessment attempt not found' });
    }
    if (attempt.user_id !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }
    if (attempt.status !== 'in_progress') {
      return res.status(409).json({ success: false, message: 'Cannot modify a completed or expired attempt.' });
    }
    if (attempt.expires_at && Date.now() > new Date(attempt.expires_at).getTime()) {
      await db.query("UPDATE assessment_attempts SET status = 'expired' WHERE id = $1", [attemptId]);
      return res.status(400).json({ success: false, code: 'ATTEMPT_EXPIRED', message: 'Assessment time limit has expired.' });
    }

    const incoming = req.body.answers && typeof req.body.answers === 'object' ? req.body.answers : {};
    const sanitizedAnswers = {};
    for (const [qId, val] of Object.entries(incoming)) {
      if (/^\d+$/.test(String(qId))) {
        sanitizedAnswers[String(qId)] = sanitizeText(val, 1000);
      }
    }

    await db.query(
      'UPDATE assessment_attempts SET draft_answers_json = $1 WHERE id = $2',
      [JSON.stringify(sanitizedAnswers), attemptId]
    );

    return res.json({ success: true, saved_at: new Date().toISOString(), answers: sanitizedAnswers });
  } catch (error) {
    logger.error('Save attempt draft error', { error: error.message });
    return res.status(500).json({ success: false, message: 'Error saving answers' });
  }
});

// Submit and grade assessment attempt strictly on the server
router.post('/attempts/:attemptId/submit', auth, async (req, res) => {
  try {
    if (req.user.role !== 'student') {
      return res.status(403).json({ success: false, message: 'Only students can submit assessment attempts.' });
    }

    const attemptId = parseInt(req.params.attemptId, 10);
    if (!Number.isInteger(attemptId) || attemptId <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid attempt ID' });
    }

    const submissionOutcome = await db.transaction(async (tx) => {
      const attempt = await tx.get('SELECT * FROM assessment_attempts WHERE id = $1', [attemptId]);
      if (!attempt) {
        const err = new Error('Assessment attempt not found.');
        err.status = 404;
        throw err;
      }
      if (attempt.user_id !== req.user.id) {
        const err = new Error('Access denied: you do not own this assessment attempt.');
        err.status = 403;
        throw err;
      }
      if (attempt.status !== 'in_progress') {
        const err = new Error('This assessment attempt has already been submitted or expired.');
        err.status = 409;
        throw err;
      }

      const exam = await tx.get('SELECT * FROM course_assessments WHERE id = $1', [attempt.assessment_id]);
      if (!exam) {
        const err = new Error('Assessment definition not found.');
        err.status = 404;
        throw err;
      }

      const enrolled = await tx.get(
        'SELECT id FROM enrollments WHERE user_id = $1 AND course_id = $2',
        [req.user.id, exam.course_id]
      );
      if (!enrolled) {
        const err = new Error('You must be enrolled in the course to submit this assessment.');
        err.status = 403;
        throw err;
      }

      if (attempt.expires_at && Date.now() > new Date(attempt.expires_at).getTime() + EXPIRY_GRACE_MS) {
        await tx.query(
          "UPDATE assessment_attempts SET status = 'expired', submitted_at = CURRENT_TIMESTAMP WHERE id = $1",
          [attemptId]
        );
        const err = new Error('Assessment time limit has expired.');
        err.status = 400;
        err.code = 'ATTEMPT_EXPIRED';
        throw err;
      }

      const draftAnswers = parseJsonSafe(attempt.draft_answers_json, {});
      const incomingAnswers = req.body.answers && typeof req.body.answers === 'object'
        ? req.body.answers
        : {};
      const mergedAnswers = { ...draftAnswers, ...incomingAnswers };

      const questionsRes = await tx.query(
        'SELECT * FROM assessment_questions WHERE assessment_id = $1 ORDER BY order_index ASC, id ASC',
        [exam.id]
      );
      const questions = questionsRes.rows;

      let totalAwarded = 0;
      let computedTotalMarks = 0;
      const gradedItems = [];

      for (const q of questions) {
        computedTotalMarks += Number(q.marks);
        const rawAns = mergedAnswers[String(q.id)] ?? mergedAnswers[q.id];
        const graded = gradeQuestionAnswer(q, rawAns);
        totalAwarded += graded.marksAwarded;

        const feedbackText = graded.isCorrect
          ? 'Correct!'
          : (q.explanation || 'Review this topic in the course lessons.');

        await tx.query(
          `INSERT INTO assessment_attempt_answers (attempt_id, question_id, answer_value, is_correct, marks_awarded, feedback)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT(attempt_id, question_id) DO UPDATE SET
             answer_value = excluded.answer_value,
             is_correct = excluded.is_correct,
             marks_awarded = excluded.marks_awarded,
             feedback = excluded.feedback`,
          [attemptId, q.id, graded.cleanValue, graded.isCorrect ? 1 : 0, graded.marksAwarded, feedbackText]
        );

        gradedItems.push({
          question_id: q.id,
          question_type: q.question_type,
          question_text: q.question_text,
          options: parseJsonSafe(q.options_json, []),
          marks: Number(q.marks),
          submitted_answer: graded.cleanValue,
          is_correct: graded.isCorrect,
          marks_awarded: graded.marksAwarded,
          feedback: feedbackText,
          correct_answer: q.correct_answer_text,
          explanation: q.explanation,
        });
      }

      const finalTotalMarks = computedTotalMarks || Number(exam.total_marks) || 1;
      const percentage = Math.round((totalAwarded / finalTotalMarks) * 1000) / 10;
      const passed = percentage >= Number(exam.passing_percentage);
      const overallFeedback = passed
        ? `Congratulations! You passed with ${percentage}%.`
        : `You scored ${percentage}%. The passing score is ${exam.passing_percentage}%. Review the course lessons and try again if attempts remain.`;

      const updatedAttemptRes = await tx.query(
        `UPDATE assessment_attempts SET
           status = 'submitted',
           draft_answers_json = $1,
           submitted_at = CURRENT_TIMESTAMP,
           score = $2,
           total_marks = $3,
           percentage = $4,
           passed = $5,
           teacher_feedback = COALESCE(teacher_feedback, $6)
         WHERE id = $7 AND status = 'in_progress'
         RETURNING *`,
        [JSON.stringify(mergedAnswers), totalAwarded, finalTotalMarks, percentage, passed ? 1 : 0, overallFeedback, attemptId]
      );

      if (updatedAttemptRes.rows.length === 0) {
        const err = new Error('Duplicate submission prevented.');
        err.status = 409;
        throw err;
      }

      const reveal = canRevealAnswers(exam, passed, false);
      const sanitizedBreakdown = gradedItems.map((item) => {
        const out = {
          question_id: item.question_id,
          question_type: item.question_type,
          question_text: item.question_text,
          options: item.options,
          marks: item.marks,
          submitted_answer: item.submitted_answer,
          is_correct: item.is_correct,
          marks_awarded: item.marks_awarded,
          feedback: item.feedback,
        };
        if (reveal) {
          out.correct_answer = item.correct_answer;
          out.explanation = item.explanation;
        }
        return out;
      });

      return {
        attempt: {
          ...updatedAttemptRes.rows[0],
          passed: Boolean(updatedAttemptRes.rows[0].passed),
        },
        answers_revealed: reveal,
        questions_review: sanitizedBreakdown,
      };
    });

    return res.json({
      success: true,
      message: 'Assessment submitted and graded successfully.',
      ...submissionOutcome,
    });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({
        success: false,
        ...(error.code ? { code: error.code } : {}),
        message: error.message,
      });
    }
    logger.error('Submit attempt error', { error: error.message });
    return res.status(500).json({ success: false, message: 'Error submitting assessment' });
  }
});

// Review a submitted attempt (student owner, owning teacher, or admin)
router.get('/attempts/:attemptId', auth, async (req, res) => {
  try {
    const attemptId = parseInt(req.params.attemptId, 10);
    if (!Number.isInteger(attemptId) || attemptId <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid attempt ID' });
    }

    const attempt = await db.get(
      `SELECT aa.*, u.full_name AS student_name, u.username AS student_username,
              ca.title AS exam_title, ca.passing_percentage, ca.show_correct_answers,
              ca.course_id, c.created_by AS course_owner_id, c.title AS course_title
       FROM assessment_attempts aa
       JOIN users u ON u.id = aa.user_id
       JOIN course_assessments ca ON ca.id = aa.assessment_id
       JOIN courses c ON c.id = ca.course_id
       WHERE aa.id = $1`,
      [attemptId]
    );
    if (!attempt) {
      return res.status(404).json({ success: false, message: 'Attempt not found' });
    }

    const isOwnerOrAdmin = req.user.role === 'admin'
      || (req.user.role === 'teacher' && attempt.course_owner_id === req.user.id);

    if (!isOwnerOrAdmin && attempt.user_id !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    if (attempt.status === 'in_progress' && !isOwnerOrAdmin) {
      return res.status(400).json({ success: false, message: 'Submit the attempt before viewing results.' });
    }

    const rows = await db.query(
      `SELECT aq.id AS question_id, aq.question_type, aq.question_text, aq.options_json,
              aq.correct_answer_text, aq.explanation, aq.marks, aq.order_index,
              aaa.answer_value, aaa.is_correct, aaa.marks_awarded, aaa.feedback
       FROM assessment_questions aq
       LEFT JOIN assessment_attempt_answers aaa
         ON aaa.question_id = aq.id AND aaa.attempt_id = $1
       WHERE aq.assessment_id = $2
       ORDER BY aq.order_index ASC, aq.id ASC`,
      [attemptId, attempt.assessment_id]
    );

    const reveal = canRevealAnswers(attempt, Boolean(attempt.passed), isOwnerOrAdmin);
    const questionsReview = rows.rows.map((r) => {
      const item = {
        question_id: r.question_id,
        question_type: r.question_type,
        question_text: r.question_text,
        options: parseJsonSafe(r.options_json, []),
        marks: Number(r.marks),
        submitted_answer: r.answer_value ?? '',
        is_correct: Boolean(r.is_correct),
        marks_awarded: Number(r.marks_awarded || 0),
        feedback: r.feedback || '',
      };
      if (reveal) {
        item.correct_answer = r.correct_answer_text;
        item.explanation = r.explanation;
      }
      return item;
    });

    return res.json({
      success: true,
      attempt: {
        ...attempt,
        passed: Boolean(attempt.passed),
      },
      answers_revealed: reveal,
      questions_review: questionsReview,
    });
  } catch (error) {
    logger.error('Get attempt error', { error: error.message });
    return res.status(500).json({ success: false, message: 'Error fetching attempt details' });
  }
});

// Teacher/Admin: view all student submissions & class performance for an assessment
router.get('/exams/:id/submissions', auth, authorize('teacher', 'admin'), async (req, res) => {
  try {
    const examId = parseInt(req.params.id, 10);
    if (!Number.isInteger(examId) || examId <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid assessment ID' });
    }

    const exam = await db.get(
      `SELECT ca.*, c.title AS course_title, c.created_by AS course_owner_id
       FROM course_assessments ca
       JOIN courses c ON c.id = ca.course_id
       WHERE ca.id = $1`,
      [examId]
    );
    if (!exam) {
      return res.status(404).json({ success: false, message: 'Assessment not found' });
    }
    if (req.user.role !== 'admin' && exam.course_owner_id !== req.user.id) {
      return res.status(403).json({ success: false, message: 'You can only view submissions for your own courses.' });
    }

    const submissionsRes = await db.query(
      `SELECT aa.*, u.full_name, u.username, u.email, u.class_grade, u.school_name
       FROM assessment_attempts aa
       JOIN users u ON u.id = aa.user_id
       WHERE aa.assessment_id = $1 AND aa.status IN ('submitted', 'expired')
       ORDER BY aa.submitted_at DESC, aa.id DESC`,
      [examId]
    );

    const submittedOnly = submissionsRes.rows.filter((s) => s.status === 'submitted');
    const uniqueStudentIds = new Set(submittedOnly.map((s) => s.user_id));
    const percentages = submittedOnly.map((s) => Number(s.percentage || 0));
    const passCount = submittedOnly.filter((s) => Boolean(s.passed)).length;

    const questionStatsRes = await db.query(
      `SELECT aq.id AS question_id, aq.question_text, aq.question_type, aq.marks,
              COUNT(aaa.id) AS responses_count,
              SUM(CASE WHEN aaa.is_correct = 1 THEN 1 ELSE 0 END) AS correct_count
       FROM assessment_questions aq
       LEFT JOIN assessment_attempt_answers aaa ON aaa.question_id = aq.id
       WHERE aq.assessment_id = $1
       GROUP BY aq.id
       ORDER BY aq.order_index ASC`,
      [examId]
    );

    const classPerformance = {
      total_submissions: submittedOnly.length,
      unique_students: uniqueStudentIds.size,
      average_percentage: percentages.length > 0
        ? Math.round((percentages.reduce((a, b) => a + b, 0) / percentages.length) * 10) / 10
        : 0,
      highest_percentage: percentages.length > 0 ? Math.max(...percentages) : 0,
      lowest_percentage: percentages.length > 0 ? Math.min(...percentages) : 0,
      pass_rate_percentage: submittedOnly.length > 0
        ? Math.round((passCount / submittedOnly.length) * 1000) / 10
        : 0,
      question_accuracy: questionStatsRes.rows.map((q) => ({
        question_id: q.question_id,
        question_text: q.question_text,
        question_type: q.question_type,
        marks: Number(q.marks),
        responses_count: Number(q.responses_count || 0),
        correct_count: Number(q.correct_count || 0),
        accuracy_percentage: Number(q.responses_count || 0) > 0
          ? Math.round((Number(q.correct_count || 0) / Number(q.responses_count)) * 100)
          : 0,
      })),
    };

    return res.json({
      success: true,
      exam,
      submissions: submissionsRes.rows.map((s) => ({ ...s, passed: Boolean(s.passed) })),
      class_performance: classPerformance,
    });
  } catch (error) {
    logger.error('Get exam submissions error', { error: error.message });
    return res.status(500).json({ success: false, message: 'Error fetching submissions' });
  }
});

// Teacher/Admin: add feedback or adjust short-answer grading on a student attempt
router.put('/attempts/:attemptId/feedback', auth, authorize('teacher', 'admin'), async (req, res) => {
  try {
    const attemptId = parseInt(req.params.attemptId, 10);
    if (!Number.isInteger(attemptId) || attemptId <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid attempt ID' });
    }

    const attempt = await db.get(
      `SELECT aa.*, ca.passing_percentage, c.created_by AS course_owner_id
       FROM assessment_attempts aa
       JOIN course_assessments ca ON ca.id = aa.assessment_id
       JOIN courses c ON c.id = ca.course_id
       WHERE aa.id = $1`,
      [attemptId]
    );
    if (!attempt) {
      return res.status(404).json({ success: false, message: 'Attempt not found' });
    }
    if (req.user.role !== 'admin' && attempt.course_owner_id !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Permission denied' });
    }

    const feedback = req.body.teacher_feedback !== undefined
      ? sanitizeText(req.body.teacher_feedback, 2000)
      : attempt.teacher_feedback;

    const updated = await db.query(
      `UPDATE assessment_attempts
       SET teacher_feedback = $1, graded_by = $2
       WHERE id = $3 RETURNING *`,
      [feedback, req.user.id, attemptId]
    );

    return res.json({ success: true, attempt: updated.rows[0] });
  } catch (error) {
    logger.error('Update attempt feedback error', { error: error.message });
    return res.status(500).json({ success: false, message: 'Error saving feedback' });
  }
});

// ============================================================================
// PART 2: INLINE LESSON QUICK ASSESSMENTS (Backward-compatible endpoints)
// ============================================================================

router.post(
  '/',
  auth,
  authorize('teacher', 'admin'),
  [
    body('lesson_id').isInt({ min: 1 }),
    body('question').trim().notEmpty().isLength({ max: 2000 }),
    body('correct_answer').isInt({ min: 0 }),
    body('points').optional().isInt({ min: 1, max: 100 }),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, errors: errors.array() });
      }

      const options = parseJsonSafe(req.body.options, null);
      const correctAnswer = Number(req.body.correct_answer);
      if (
        !Array.isArray(options)
        || options.length < 2
        || options.length > 6
        || options.some((option) => typeof option !== 'string' || !option.trim())
        || correctAnswer >= options.length
      ) {
        return res.status(400).json({
          success: false,
          message: 'Provide 2–6 non-empty answer options and a valid zero-based correct_answer index.',
        });
      }

      const lesson = await db.get(
        'SELECT c.created_by FROM lessons l JOIN courses c ON c.id = l.course_id WHERE l.id = $1 AND l.is_active = 1 AND c.is_active = 1',
        [req.body.lesson_id]
      );
      if (!lesson) {
        return res.status(404).json({ success: false, message: 'Active lesson not found.' });
      }
      if (req.user.role !== 'admin' && lesson.created_by !== req.user.id) {
        return res.status(403).json({ success: false, message: 'You can only add questions to your own courses.' });
      }

      const cleanOptions = options.map((o) => sanitizeText(o, 500));
      const result = await db.query(
        'INSERT INTO assessments (lesson_id, question, options, correct_answer, points, order_index) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, lesson_id, question, options, correct_answer, points, order_index',
        [
          req.body.lesson_id,
          sanitizeText(req.body.question, 2000),
          JSON.stringify(cleanOptions),
          correctAnswer,
          Number(req.body.points || 1),
          Number(req.body.order_index || 0),
        ]
      );
      return res.status(201).json({ success: true, assessment: result.rows[0] });
    } catch (error) {
      logger.error('Create inline assessment error', { error: error.message });
      return res.status(500).json({ success: false, message: 'Error creating assessment.' });
    }
  }
);

router.delete('/:id', auth, authorize('teacher', 'admin'), async (req, res) => {
  try {
    const assessmentId = parseInt(req.params.id, 10);
    if (!Number.isInteger(assessmentId) || assessmentId <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid assessment ID' });
    }

    const existing = await db.get(
      `SELECT a.id, c.created_by
       FROM assessments a
       JOIN lessons l ON l.id = a.lesson_id
       JOIN courses c ON c.id = l.course_id
       WHERE a.id = $1`,
      [assessmentId]
    );
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Assessment not found.' });
    }
    if (req.user.role !== 'admin' && existing.created_by !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Permission denied.' });
    }

    await db.query('DELETE FROM assessments WHERE id = $1', [assessmentId]);
    return res.json({ success: true, message: 'Question deleted successfully.' });
  } catch (error) {
    logger.error('Delete inline assessment error', { error: error.message });
    return res.status(500).json({ success: false, message: 'Error deleting assessment.' });
  }
});

router.post('/:id/submit', auth, async (req, res) => {
  try {
    if (req.user.role !== 'student') {
      return res.status(403).json({ success: false, message: 'Only students can submit assessment answers.' });
    }
    const selectedAnswer = Number(req.body.selected_answer);
    if (!Number.isInteger(selectedAnswer) || selectedAnswer < 0) {
      return res.status(400).json({ success: false, message: 'A valid selected_answer index is required.' });
    }

    const assessment = await db.get(
      `SELECT a.id, a.correct_answer, a.points, a.options, l.course_id
       FROM assessments a
       JOIN lessons l ON l.id = a.lesson_id
       WHERE a.id = $1 AND l.is_active = 1`,
      [req.params.id]
    );
    if (!assessment) {
      return res.status(404).json({ success: false, message: 'Assessment not found.' });
    }

    const options = parseJsonSafe(assessment.options, null);
    if (!Array.isArray(options) || selectedAnswer >= options.length) {
      return res.status(400).json({ success: false, message: 'Selected answer is outside the available options.' });
    }

    const enrollment = await db.get(
      'SELECT id FROM enrollments WHERE user_id = $1 AND course_id = $2',
      [req.user.id, assessment.course_id]
    );
    if (!enrollment) {
      return res.status(403).json({ success: false, message: 'Enroll in this course before submitting answers.' });
    }

    const isCorrect = selectedAnswer === Number(assessment.correct_answer);
    const score = isCorrect ? Number(assessment.points) : 0;
    await db.query(
      'INSERT INTO assessment_results (user_id, assessment_id, selected_answer, is_correct, score) VALUES ($1, $2, $3, $4, $5)',
      [req.user.id, assessment.id, selectedAnswer, isCorrect ? 1 : 0, score]
    );

    return res.json({
      success: true,
      is_correct: isCorrect,
      score,
      message: isCorrect ? 'Correct answer!' : 'Not quite. Review the lesson and try again.',
    });
  } catch (error) {
    logger.error('Submit inline assessment error', { error: error.message });
    return res.status(500).json({ success: false, message: 'Error submitting assessment.' });
  }
});

module.exports = router;
