const express = require('express');
const db = require('../database/connection');
const { auth, authorize } = require('../middleware/auth');
const logger = require('../utils/logger');

const router = express.Router();

// Comprehensive teacher & administrator analytics derived 100% from live SQLite records
router.get('/overview', auth, authorize('teacher', 'admin'), async (req, res) => {
  try {
    const courseFilter = req.query.course_id ? parseInt(req.query.course_id, 10) : null;
    const categoryFilter = req.query.category ? String(req.query.category).trim() : null;
    const gradeFilter = req.query.class_grade ? String(req.query.class_grade).trim() : null;

    // 1. Scoped courses for teacher vs admin
    const courseParams = [];
    let courseParamIdx = 0;
    let courseWhere = 'WHERE c.is_active = 1';
    if (req.user.role === 'teacher') {
      courseParamIdx += 1;
      courseWhere += ` AND c.created_by = $${courseParamIdx}`;
      courseParams.push(req.user.id);
    }
    if (courseFilter) {
      courseParamIdx += 1;
      courseWhere += ` AND c.id = $${courseParamIdx}`;
      courseParams.push(courseFilter);
    }
    if (categoryFilter) {
      courseParamIdx += 1;
      courseWhere += ` AND c.category = $${courseParamIdx}`;
      courseParams.push(categoryFilter);
    }

    const coursesRes = await db.query(
      `SELECT c.id, c.title, c.category, c.language,
              (SELECT COUNT(*) FROM lessons l WHERE l.course_id = c.id AND l.is_active = 1) AS total_lessons
       FROM courses c
       ${courseWhere}
       ORDER BY c.title ASC`,
      courseParams
    );

    const scopedCourses = coursesRes.rows;
    const courseIds = scopedCourses.map((c) => c.id);

    if (courseIds.length === 0) {
      return res.json({
        success: true,
        summary: {
          total_enrolled_students: 0,
          total_enrollments: 0,
          active_learners_7d: 0,
          overall_completion_percentage: 0,
          average_assessment_percentage: 0,
          total_learning_minutes: 0,
          certificates_issued: 0,
        },
        course_performance: [],
        student_performance: [],
        weak_subjects: [],
        activity_timeline: [],
        filters: { categories: [], grades: [] },
      });
    }

    const inPlaceholders = courseIds.map((_, idx) => `$${idx + 1}`).join(', ');

    // 2. Course-wise performance
    const coursePerformance = [];
    let sumCourseAssignPairs = 0;
    let sumCourseCompletedPairs = 0;
    let totalLearningMinutes = 0;
    let totalEnrollments = 0;

    for (const c of scopedCourses) {
      const enrollParams = [c.id];
      let enrollSql = `
        SELECT COUNT(*) AS enrolled_count
        FROM enrollments e
        JOIN users u ON u.id = e.user_id
        WHERE e.course_id = $1
      `;
      if (gradeFilter) {
        enrollSql += ' AND u.class_grade = $2';
        enrollParams.push(gradeFilter);
      }
      const enrollRow = await db.get(enrollSql, enrollParams);
      const enrolledCount = Number(enrollRow?.enrolled_count || 0);
      totalEnrollments += enrolledCount;

      const progParams = [c.id];
      let progSql = `
        SELECT COUNT(CASE WHEN up.completion_status = 'completed' AND l.is_active = 1 THEN 1 END) AS completed_lessons,
               COALESCE(SUM(up.time_spent_minutes), 0) AS minutes_spent
        FROM user_progress up
        JOIN users u ON u.id = up.user_id
        JOIN lessons l ON l.id = up.lesson_id
        WHERE up.course_id = $1
      `;
      if (gradeFilter) {
        progSql += ' AND u.class_grade = $2';
        progParams.push(gradeFilter);
      }
      const progRow = await db.get(progSql, progParams);
      const completedLessonsCount = Number(progRow?.completed_lessons || 0);
      const minutesSpent = Number(progRow?.minutes_spent || 0);
      totalLearningMinutes += minutesSpent;

      const totalLessons = Number(c.total_lessons || 0);
      const possiblePairs = enrolledCount * totalLessons;
      sumCourseAssignPairs += possiblePairs;
      sumCourseCompletedPairs += Math.min(completedLessonsCount, possiblePairs);

      const completionPct = possiblePairs > 0
        ? Math.round((Math.min(completedLessonsCount, possiblePairs) / possiblePairs) * 1000) / 10
        : 0;

      const examRow = await db.get(
        `SELECT COUNT(aa.id) AS attempts_count,
                AVG(aa.percentage) AS avg_score
         FROM assessment_attempts aa
         JOIN course_assessments ca ON ca.id = aa.assessment_id
         JOIN users u ON u.id = aa.user_id
         WHERE ca.course_id = $1 AND aa.status = 'submitted'
         ${gradeFilter ? 'AND u.class_grade = $2' : ''}`,
        gradeFilter ? [c.id, gradeFilter] : [c.id]
      );

      // Also include inline lesson quiz accuracy if no formal exam attempts yet
      const inlineRow = await db.get(
        `SELECT COUNT(ar.id) AS cnt,
                AVG(CASE WHEN ar.is_correct = 1 THEN 100.0 ELSE 0.0 END) AS avg_inline
         FROM assessment_results ar
         JOIN assessments a ON a.id = ar.assessment_id
         JOIN lessons l ON l.id = a.lesson_id
         JOIN users u ON u.id = ar.user_id
         WHERE l.course_id = $1
         ${gradeFilter ? 'AND u.class_grade = $2' : ''}`,
        gradeFilter ? [c.id, gradeFilter] : [c.id]
      );

      let avgAssessmentPct = null;
      if (Number(examRow?.attempts_count || 0) > 0) {
        avgAssessmentPct = Math.round(Number(examRow.avg_score) * 10) / 10;
      } else if (Number(inlineRow?.cnt || 0) > 0) {
        avgAssessmentPct = Math.round(Number(inlineRow.avg_inline) * 10) / 10;
      }

      coursePerformance.push({
        course_id: c.id,
        title: c.title,
        category: c.category || 'Uncategorized',
        language: c.language || 'en',
        total_lessons: totalLessons,
        enrolled_students: enrolledCount,
        completed_lesson_records: completedLessonsCount,
        completion_percentage: completionPct,
        average_assessment_percentage: avgAssessmentPct,
        total_time_minutes: minutesSpent,
      });
    }

    // 3. Individual Student Performance & Comparison
    const studentParams = [...courseIds];
    let studentGradeClause = '';
    if (gradeFilter) {
      studentParams.push(gradeFilter);
      studentGradeClause = ` AND u.class_grade = $${studentParams.length}`;
    }

    const enrolledStudentsRes = await db.query(
      `SELECT DISTINCT u.id, u.full_name, u.username, u.class_grade, u.school_name
       FROM enrollments e
       JOIN users u ON u.id = e.user_id
       WHERE e.course_id IN (${inPlaceholders})${studentGradeClause}
       ORDER BY u.full_name ASC`,
      studentParams
    );

    const studentPerformance = [];
    const sevenDaysAgoMs = Date.now() - 7 * 24 * 3600 * 1000;
    let activeLearners7d = 0;
    const allStudentExamAverages = [];

    for (const st of enrolledStudentsRes.rows) {
      const stEnrollments = await db.query(
        `SELECT e.course_id, c.title, c.category,
                (SELECT COUNT(*) FROM lessons l WHERE l.course_id = c.id AND l.is_active = 1) AS lesson_count
         FROM enrollments e
         JOIN courses c ON c.id = e.course_id
         WHERE e.user_id = $1 AND e.course_id IN (${courseIds.map((_, i) => `$${i + 2}`).join(', ')})`,
        [st.id, ...courseIds]
      );

      const assignedLessons = stEnrollments.rows.reduce((sum, r) => sum + Number(r.lesson_count || 0), 0);

      const stProg = await db.get(
        `SELECT COUNT(CASE WHEN up.completion_status = 'completed' AND l.is_active = 1 THEN 1 END) AS completed,
                COALESCE(SUM(up.time_spent_minutes), 0) AS minutes,
                MAX(up.last_accessed) AS last_accessed
         FROM user_progress up
         JOIN lessons l ON l.id = up.lesson_id
         WHERE up.user_id = $1 AND up.course_id IN (${courseIds.map((_, i) => `$${i + 2}`).join(', ')})`,
        [st.id, ...courseIds]
      );

      const stExam = await db.get(
        `SELECT COUNT(aa.id) AS attempts,
                AVG(aa.percentage) AS avg_pct,
                MAX(aa.submitted_at) AS last_exam_at
         FROM assessment_attempts aa
         JOIN course_assessments ca ON ca.id = aa.assessment_id
         WHERE aa.user_id = $1 AND aa.status = 'submitted'
           AND ca.course_id IN (${courseIds.map((_, i) => `$${i + 2}`).join(', ')})`,
        [st.id, ...courseIds]
      );

      // Identify weak subjects for this student (score < 60% in a subject)
      const weakSubjRes = await db.query(
        `SELECT COALESCE(c.category, c.title) AS subject, AVG(aa.percentage) AS avg_pct
         FROM assessment_attempts aa
         JOIN course_assessments ca ON ca.id = aa.assessment_id
         JOIN courses c ON c.id = ca.course_id
         WHERE aa.user_id = $1 AND aa.status = 'submitted'
           AND ca.course_id IN (${courseIds.map((_, i) => `$${i + 2}`).join(', ')})
         GROUP BY COALESCE(c.category, c.title)
         HAVING AVG(aa.percentage) < 60`,
        [st.id, ...courseIds]
      );

      const completed = Number(stProg?.completed || 0);
      const completionPct = assignedLessons > 0
        ? Math.round((Math.min(completed, assignedLessons) / assignedLessons) * 1000) / 10
        : 0;
      const avgExamPct = Number(stExam?.attempts || 0) > 0
        ? Math.round(Number(stExam.avg_pct) * 10) / 10
        : null;
      if (avgExamPct !== null) allStudentExamAverages.push(avgExamPct);

      const lastActivity = [stProg?.last_accessed, stExam?.last_exam_at]
        .filter(Boolean)
        .sort()
        .pop() || null;

      if (lastActivity && new Date(lastActivity).getTime() >= sevenDaysAgoMs) {
        activeLearners7d += 1;
      }

      studentPerformance.push({
        user_id: st.id,
        full_name: st.full_name,
        username: st.username,
        class_grade: st.class_grade || 'N/A',
        school_name: st.school_name || 'N/A',
        enrolled_courses: stEnrollments.rows.length,
        completed_lessons: completed,
        assigned_lessons: assignedLessons,
        completion_percentage: completionPct,
        assessment_attempts: Number(stExam?.attempts || 0),
        average_marks_percentage: avgExamPct,
        time_spent_minutes: Number(stProg?.minutes || 0),
        last_activity_at: lastActivity,
        weak_subjects: weakSubjRes.rows.map((w) => w.subject),
      });
    }

    // 4. Platform/Class Weak Subject Identification across categories
    const byCategory = {};
    for (const cp of coursePerformance) {
      const cat = cp.category || 'Uncategorized';
      if (!byCategory[cat]) {
        byCategory[cat] = {
          subject: cat,
          courses_count: 0,
          enrolled_students: 0,
          completion_sum: 0,
          score_values: [],
        };
      }
      byCategory[cat].courses_count += 1;
      byCategory[cat].enrolled_students += cp.enrolled_students;
      byCategory[cat].completion_sum += cp.completion_percentage;
      if (cp.average_assessment_percentage !== null) {
        byCategory[cat].score_values.push(cp.average_assessment_percentage);
      }
    }

    const weakSubjects = Object.values(byCategory)
      .map((item) => {
        const avgCompletion = Math.round((item.completion_sum / item.courses_count) * 10) / 10;
        const avgScore = item.score_values.length > 0
          ? Math.round((item.score_values.reduce((a, b) => a + b, 0) / item.score_values.length) * 10) / 10
          : null;
        const needsAttention = (avgScore !== null && avgScore < 60)
          || (item.enrolled_students > 0 && avgCompletion < 50);
        return {
          subject: item.subject,
          courses_count: item.courses_count,
          enrolled_students: item.enrolled_students,
          average_completion_percentage: avgCompletion,
          average_score_percentage: avgScore,
          needs_attention: needsAttention,
          reason: avgScore !== null && avgScore < 60
            ? `Low average assessment score (${avgScore}%)`
            : (item.enrolled_students > 0 && avgCompletion < 50 ? `Low lesson completion (${avgCompletion}%)` : 'On track'),
        };
      })
      .filter((item) => item.needs_attention)
      .sort((a, b) => (a.average_score_percentage ?? 100) - (b.average_score_percentage ?? 100));

    // 5. Daily learning activity timeline (last 14 days)
    const activityRes = await db.query(
      `SELECT substr(up.last_accessed, 1, 10) AS activity_date,
              COUNT(DISTINCT up.user_id) AS active_students,
              COUNT(*) AS lesson_interactions,
              COALESCE(SUM(up.time_spent_minutes), 0) AS minutes_logged
       FROM user_progress up
       WHERE up.course_id IN (${inPlaceholders})
         AND up.last_accessed >= datetime('now', '-14 days')
       GROUP BY substr(up.last_accessed, 1, 10)
       ORDER BY activity_date ASC`,
      courseIds
    );

    // 6. Certificates count & filter metadata
    const certRow = await db.get(
      `SELECT COUNT(*) AS count FROM certificates WHERE course_id IN (${inPlaceholders})`,
      courseIds
    );
    const categoriesRes = await db.query(
      "SELECT DISTINCT category FROM courses WHERE category IS NOT NULL AND category != '' ORDER BY category ASC"
    );
    const gradesRes = await db.query(
      "SELECT DISTINCT class_grade FROM users WHERE role = 'student' AND class_grade IS NOT NULL AND class_grade != '' ORDER BY class_grade ASC"
    );

    const overallCompletionPct = sumCourseAssignPairs > 0
      ? Math.round((sumCourseCompletedPairs / sumCourseAssignPairs) * 1000) / 10
      : 0;
    const overallAvgScore = allStudentExamAverages.length > 0
      ? Math.round((allStudentExamAverages.reduce((a, b) => a + b, 0) / allStudentExamAverages.length) * 10) / 10
      : 0;

    return res.json({
      success: true,
      summary: {
        total_enrolled_students: enrolledStudentsRes.rows.length,
        total_enrollments: totalEnrollments,
        active_learners_7d: activeLearners7d,
        overall_completion_percentage: overallCompletionPct,
        average_assessment_percentage: overallAvgScore,
        total_learning_minutes: totalLearningMinutes,
        certificates_issued: Number(certRow?.count || 0),
      },
      course_performance: coursePerformance,
      student_performance: studentPerformance,
      weak_subjects: weakSubjects,
      activity_timeline: activityRes.rows.map((r) => ({
        date: r.activity_date,
        active_students: Number(r.active_students || 0),
        lesson_interactions: Number(r.lesson_interactions || 0),
        minutes_logged: Number(r.minutes_logged || 0),
      })),
      filters: {
        categories: categoriesRes.rows.map((r) => r.category),
        grades: gradesRes.rows.map((r) => r.class_grade),
      },
    });
  } catch (error) {
    logger.error('Analytics overview error', { error: error.message });
    return res.status(500).json({ success: false, message: 'Error generating analytics report' });
  }
});

// Student personal learning analytics
router.get('/student/me', auth, async (req, res) => {
  try {
    const enrollments = await db.query(
      `SELECT e.course_id, c.title, c.category,
              (SELECT COUNT(*) FROM lessons l WHERE l.course_id = c.id AND l.is_active = 1) AS total_lessons,
              (SELECT COUNT(*) FROM user_progress up JOIN lessons l2 ON l2.id = up.lesson_id
               WHERE up.user_id = e.user_id AND up.course_id = c.id AND up.completion_status = 'completed' AND l2.is_active = 1) AS completed_lessons,
              (SELECT COALESCE(SUM(time_spent_minutes), 0) FROM user_progress up WHERE up.user_id = e.user_id AND up.course_id = c.id) AS minutes_spent
       FROM enrollments e
       JOIN courses c ON c.id = e.course_id
       WHERE e.user_id = $1 AND c.is_active = 1`,
      [req.user.id]
    );

    const attempts = await db.query(
      `SELECT aa.id, aa.assessment_id, aa.score, aa.total_marks, aa.percentage, aa.passed, aa.submitted_at,
              ca.title AS exam_title, c.title AS course_title, c.category
       FROM assessment_attempts aa
       JOIN course_assessments ca ON ca.id = aa.assessment_id
       JOIN courses c ON c.id = ca.course_id
       WHERE aa.user_id = $1 AND aa.status = 'submitted'
       ORDER BY aa.submitted_at DESC`,
      [req.user.id]
    );

    const certs = await db.query(
      'SELECT * FROM certificates WHERE user_id = $1 ORDER BY issued_at DESC',
      [req.user.id]
    );

    return res.json({
      success: true,
      courses: enrollments.rows.map((c) => {
        const total = Number(c.total_lessons || 0);
        const done = Number(c.completed_lessons || 0);
        return {
          ...c,
          total_lessons: total,
          completed_lessons: done,
          minutes_spent: Number(c.minutes_spent || 0),
          completion_percentage: total > 0 ? Math.round((done / total) * 100) : 0,
        };
      }),
      assessment_history: attempts.rows.map((a) => ({ ...a, passed: Boolean(a.passed) })),
      certificates: certs.rows,
    });
  } catch (error) {
    logger.error('Student personal analytics error', { error: error.message });
    return res.status(500).json({ success: false, message: 'Error fetching personal analytics' });
  }
});

// Individual student analytics drilldown for teachers & admins
router.get('/student/:id', auth, authorize('teacher', 'admin'), async (req, res) => {
  try {
    const studentId = parseInt(req.params.id, 10);
    if (!Number.isInteger(studentId) || studentId <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid student ID' });
    }

    const student = await db.get(
      "SELECT id, username, full_name, email, school_name, class_grade FROM users WHERE id = $1 AND role = 'student'",
      [studentId]
    );
    if (!student) {
      return res.status(404).json({ success: false, message: 'Student not found' });
    }

    const teacherClause = req.user.role === 'teacher' ? 'AND c.created_by = $2' : '';
    const params = req.user.role === 'teacher' ? [studentId, req.user.id] : [studentId];

    const enrollments = await db.query(
      `SELECT e.course_id, c.title, c.category,
              (SELECT COUNT(*) FROM lessons l WHERE l.course_id = c.id AND l.is_active = 1) AS total_lessons,
              (SELECT COUNT(*) FROM user_progress up JOIN lessons l2 ON l2.id = up.lesson_id
               WHERE up.user_id = e.user_id AND up.course_id = c.id AND up.completion_status = 'completed' AND l2.is_active = 1) AS completed_lessons,
              (SELECT COALESCE(SUM(time_spent_minutes), 0) FROM user_progress up WHERE up.user_id = e.user_id AND up.course_id = c.id) AS minutes_spent
       FROM enrollments e
       JOIN courses c ON c.id = e.course_id
       WHERE e.user_id = $1 AND c.is_active = 1 ${teacherClause}`,
      params
    );

    const attempts = await db.query(
      `SELECT aa.id, aa.assessment_id, aa.score, aa.total_marks, aa.percentage, aa.passed, aa.submitted_at,
              ca.title AS assessment_title, c.title AS course_title, c.category
       FROM assessment_attempts aa
       JOIN course_assessments ca ON ca.id = aa.assessment_id
       JOIN courses c ON c.id = ca.course_id
       WHERE aa.user_id = $1 AND aa.status = 'submitted' ${teacherClause}
       ORDER BY aa.submitted_at DESC`,
      params
    );

    return res.json({
      success: true,
      student,
      courses: enrollments.rows.map((c) => {
        const total = Number(c.total_lessons || 0);
        const done = Number(c.completed_lessons || 0);
        return {
          ...c,
          total_lessons: total,
          completed_lessons: done,
          minutes_spent: Number(c.minutes_spent || 0),
          completion_percentage: total > 0 ? Math.round((done / total) * 100) : 0,
        };
      }),
      assessments: attempts.rows.map((a) => ({ ...a, passed: Boolean(a.passed) })),
    });
  } catch (error) {
    logger.error('Student drilldown analytics error', { error: error.message });
    return res.status(500).json({ success: false, message: 'Error fetching student analytics' });
  }
});

module.exports = router;
