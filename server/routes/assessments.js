const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const db = require('../database/connection');
const { auth, authorize } = require('../middleware/auth');

const parseOptions = (value) => {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try { return JSON.parse(value); } catch (_error) { return null; }
  }
  return null;
};

// Teachers can add questions only to lessons in courses they own; admins can add to any course.
router.post('/', auth, authorize('teacher', 'admin'), [
  body('lesson_id').isInt({ min: 1 }),
  body('question').trim().notEmpty().isLength({ max: 2000 }),
  body('correct_answer').isInt({ min: 0 }),
  body('points').optional().isInt({ min: 1, max: 100 }),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

    const options = parseOptions(req.body.options);
    const correctAnswer = Number(req.body.correct_answer);
    if (!Array.isArray(options) || options.length < 2 || options.length > 6 || options.some((option) => typeof option !== 'string' || !option.trim()) || correctAnswer >= options.length) {
      return res.status(400).json({ success: false, message: 'Provide 2–6 non-empty answer options and a valid zero-based correct_answer index.' });
    }

    const lesson = await db.query('SELECT c.created_by FROM lessons l JOIN courses c ON c.id = l.course_id WHERE l.id = $1 AND l.is_active = 1 AND c.is_active = 1', [req.body.lesson_id]);
    if (!lesson.rows.length) return res.status(404).json({ success: false, message: 'Active lesson not found.' });
    if (req.user.role !== 'admin' && lesson.rows[0].created_by !== req.user.id) return res.status(403).json({ success: false, message: 'You can only add questions to your own courses.' });

    const result = await db.query(
      'INSERT INTO assessments (lesson_id, question, options, correct_answer, points, order_index) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, lesson_id, question, options, correct_answer, points, order_index',
      [req.body.lesson_id, req.body.question.trim(), JSON.stringify(options), correctAnswer, Number(req.body.points || 1), Number(req.body.order_index || 0)]
    );
    return res.status(201).json({ success: true, assessment: result.rows[0] });
  } catch (error) {
    console.error('Create assessment error:', error);
    return res.status(500).json({ success: false, message: 'Error creating assessment.' });
  }
});

// Students submit only an option index. Correctness and score are calculated on the server.
router.post('/:id/submit', auth, async (req, res) => {
  try {
    if (req.user.role !== 'student') return res.status(403).json({ success: false, message: 'Only students can submit assessment answers.' });
    const selectedAnswer = Number(req.body.selected_answer);
    if (!Number.isInteger(selectedAnswer) || selectedAnswer < 0) return res.status(400).json({ success: false, message: 'A valid selected_answer index is required.' });

    const result = await db.query(
      `SELECT a.id, a.correct_answer, a.points, a.options, l.course_id
       FROM assessments a JOIN lessons l ON l.id = a.lesson_id
       WHERE a.id = $1 AND l.is_active = 1`,
      [req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ success: false, message: 'Assessment not found.' });
    const assessment = result.rows[0];
    const options = parseOptions(assessment.options);
    if (!Array.isArray(options) || selectedAnswer >= options.length) return res.status(400).json({ success: false, message: 'Selected answer is outside the available options.' });

    const enrollment = await db.query('SELECT id FROM enrollments WHERE user_id = $1 AND course_id = $2', [req.user.id, assessment.course_id]);
    if (!enrollment.rows.length) return res.status(403).json({ success: false, message: 'Enroll in this course before submitting answers.' });

    const isCorrect = selectedAnswer === assessment.correct_answer;
    const score = isCorrect ? assessment.points : 0;
    await db.query(
      'INSERT INTO assessment_results (user_id, assessment_id, selected_answer, is_correct, score) VALUES ($1, $2, $3, $4, $5)',
      [req.user.id, assessment.id, selectedAnswer, isCorrect ? 1 : 0, score]
    );
    return res.json({ success: true, is_correct: isCorrect, score, message: isCorrect ? 'Correct answer!' : 'Not quite. Review the lesson and try again.' });
  } catch (error) {
    console.error('Submit assessment error:', error);
    return res.status(500).json({ success: false, message: 'Error submitting assessment.' });
  }
});

module.exports = router;
