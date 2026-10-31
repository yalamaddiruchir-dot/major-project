const express = require('express');
const crypto = require('crypto');
const PDFDocument = require('pdfkit');
const db = require('../database/connection');
const { auth } = require('../middleware/auth');
const logger = require('../utils/logger');

const router = express.Router();

const generateCertificateCode = () => {
  const year = new Date().getUTCFullYear();
  const suffix = crypto.randomBytes(5).toString('hex').toUpperCase();
  return `DLP-${year}-${suffix}`;
};

// Public certificate verification endpoint
router.get('/verify/:code', async (req, res) => {
  try {
    const code = String(req.params.code || '').trim().toUpperCase();
    if (!/^DLP-\d{4}-[A-F0-9]{8,16}$/.test(code)) {
      return res.status(404).json({
        success: false,
        valid: false,
        message: 'Invalid certificate ID format.',
      });
    }

    const cert = await db.get(
      `SELECT certificate_code, verification_hash, student_name, course_title,
              institution_name, completion_percentage, final_score_percentage, issued_at
       FROM certificates
       WHERE UPPER(certificate_code) = $1`,
      [code]
    );

    if (!cert) {
      return res.status(404).json({
        success: false,
        valid: false,
        message: 'Certificate could not be verified. No matching record exists.',
      });
    }

    return res.json({
      success: true,
      valid: true,
      certificate: {
        certificate_code: cert.certificate_code,
        student_name: cert.student_name,
        course_title: cert.course_title,
        institution_name: cert.institution_name,
        completion_percentage: cert.completion_percentage,
        final_score_percentage: cert.final_score_percentage,
        issued_at: cert.issued_at,
        verification_signature: String(cert.verification_hash).slice(0, 16).toUpperCase(),
      },
    });
  } catch (error) {
    logger.error('Verify certificate error', { error: error.message });
    return res.status(500).json({ success: false, valid: false, message: 'Error verifying certificate' });
  }
});

// List certificates (student: own; teacher: own courses; admin: all)
router.get('/', auth, async (req, res) => {
  try {
    const courseId = req.query.course_id ? parseInt(req.query.course_id, 10) : null;
    const params = [];
    let paramCount = 0;

    let sql = `
      SELECT cert.*, c.category
      FROM certificates cert
      JOIN courses c ON c.id = cert.course_id
      WHERE 1=1
    `;

    if (req.user.role === 'student') {
      paramCount += 1;
      sql += ` AND cert.user_id = $${paramCount}`;
      params.push(req.user.id);
    } else if (req.user.role === 'teacher') {
      paramCount += 1;
      sql += ` AND c.created_by = $${paramCount}`;
      params.push(req.user.id);
    }

    if (courseId) {
      paramCount += 1;
      sql += ` AND cert.course_id = $${paramCount}`;
      params.push(courseId);
    }

    sql += ' ORDER BY cert.issued_at DESC';
    const result = await db.query(sql, params);
    return res.json({ success: true, certificates: result.rows });
  } catch (error) {
    logger.error('List certificates error', { error: error.message });
    return res.status(500).json({ success: false, message: 'Error fetching certificates' });
  }
});

// Check student certificate eligibility for a specific course
router.get('/eligibility/:courseId', auth, async (req, res) => {
  try {
    const courseId = parseInt(req.params.courseId, 10);
    if (!Number.isInteger(courseId) || courseId <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid course ID' });
    }

    const existing = await db.get(
      'SELECT * FROM certificates WHERE user_id = $1 AND course_id = $2',
      [req.user.id, courseId]
    );

    const enrolled = await db.get(
      'SELECT id FROM enrollments WHERE user_id = $1 AND course_id = $2',
      [req.user.id, courseId]
    );

    const totalLessonsRow = await db.get(
      'SELECT COUNT(*) AS count FROM lessons WHERE course_id = $1 AND is_active = 1',
      [courseId]
    );
    const completedLessonsRow = await db.get(
      `SELECT COUNT(*) AS count
       FROM user_progress up
       JOIN lessons l ON l.id = up.lesson_id
       WHERE up.user_id = $1 AND up.course_id = $2 AND up.completion_status = 'completed' AND l.is_active = 1`,
      [req.user.id, courseId]
    );

    const requiredExamsRes = await db.query(
      `SELECT id, title, passing_percentage
       FROM course_assessments
       WHERE course_id = $1 AND is_active = 1 AND is_published = 1 AND is_required_for_certificate = 1`,
      [courseId]
    );

    let passedExamsCount = 0;
    for (const exam of requiredExamsRes.rows) {
      const passedAttempt = await db.get(
        `SELECT id FROM assessment_attempts
         WHERE assessment_id = $1 AND user_id = $2 AND status = 'submitted' AND passed = 1
         LIMIT 1`,
        [exam.id, req.user.id]
      );
      if (passedAttempt) passedExamsCount += 1;
    }

    const totalLessons = Number(totalLessonsRow?.count || 0);
    const completedLessons = Number(completedLessonsRow?.count || 0);
    const requiredAssessments = requiredExamsRes.rows.length;
    const eligible =
      Boolean(enrolled) &&
      totalLessons > 0 &&
      completedLessons >= totalLessons &&
      passedExamsCount >= requiredAssessments;

    return res.json({
      success: true,
      eligible,
      enrolled: Boolean(enrolled),
      total_lessons: totalLessons,
      completed_lessons: completedLessons,
      required_assessments: requiredAssessments,
      passed_assessments: passedExamsCount,
      existing_certificate: existing || null,
    });
  } catch (error) {
    logger.error('Eligibility check error', { error: error.message });
    return res.status(500).json({ success: false, message: 'Error checking eligibility' });
  }
});

// Check eligibility & generate certificate once completion criteria are satisfied
router.post('/generate', auth, async (req, res) => {
  try {
    if (req.user.role !== 'student') {
      return res.status(403).json({ success: false, message: 'Only students earn course completion certificates.' });
    }

    const courseId = parseInt(req.body.course_id, 10);
    if (!Number.isInteger(courseId) || courseId <= 0) {
      return res.status(400).json({ success: false, message: 'Valid course_id is required' });
    }

    const existing = await db.get(
      'SELECT * FROM certificates WHERE user_id = $1 AND course_id = $2',
      [req.user.id, courseId]
    );
    if (existing) {
      return res.status(200).json({ success: true, certificate: existing, already_issued: true });
    }

    const course = await db.get('SELECT * FROM courses WHERE id = $1 AND is_active = 1', [courseId]);
    if (!course) {
      return res.status(404).json({ success: false, message: 'Course not found' });
    }

    const enrolled = await db.get(
      'SELECT id FROM enrollments WHERE user_id = $1 AND course_id = $2',
      [req.user.id, courseId]
    );
    if (!enrolled) {
      return res.status(403).json({ success: false, message: 'You are not enrolled in this course.' });
    }

    // Criterion 1: Course must have at least 1 active lesson and 100% must be completed
    const totalLessonsRow = await db.get(
      'SELECT COUNT(*) AS count FROM lessons WHERE course_id = $1 AND is_active = 1',
      [courseId]
    );
    const totalLessons = Number(totalLessonsRow?.count || 0);
    if (totalLessons === 0) {
      return res.status(400).json({
        success: false,
        message: 'This course has no active lessons yet and cannot issue a certificate.',
      });
    }

    const completedLessonsRow = await db.get(
      `SELECT COUNT(*) AS count
       FROM user_progress up
       JOIN lessons l ON l.id = up.lesson_id
       WHERE up.user_id = $1 AND up.course_id = $2 AND up.completion_status = 'completed' AND l.is_active = 1`,
      [req.user.id, courseId]
    );
    const completedLessons = Number(completedLessonsRow?.count || 0);
    if (completedLessons < totalLessons) {
      return res.status(400).json({
        success: false,
        message: `Complete all course lessons before claiming your certificate (${completedLessons}/${totalLessons} lessons completed).`,
      });
    }

    // Criterion 2: Any published required course assessments must be passed
    const requiredExamsRes = await db.query(
      `SELECT id, title, passing_percentage
       FROM course_assessments
       WHERE course_id = $1 AND is_active = 1 AND is_published = 1 AND is_required_for_certificate = 1`,
      [courseId]
    );

    const bestExamScores = [];
    for (const exam of requiredExamsRes.rows) {
      const passedAttempt = await db.get(
        `SELECT MAX(percentage) AS best_pct
         FROM assessment_attempts
         WHERE assessment_id = $1 AND user_id = $2 AND status = 'submitted' AND passed = 1`,
        [exam.id, req.user.id]
      );
      if (!passedAttempt || passedAttempt.best_pct === null) {
        return res.status(400).json({
          success: false,
          message: `Pass required assessment "${exam.title}" (minimum ${exam.passing_percentage}%) before generating your certificate.`,
        });
      }
      bestExamScores.push(Number(passedAttempt.best_pct));
    }

    const finalScorePct = bestExamScores.length > 0
      ? Math.round((bestExamScores.reduce((a, b) => a + b, 0) / bestExamScores.length) * 10) / 10
      : null;

    const certificateCode = generateCertificateCode();
    const institutionName = req.user.school_name
      || process.env.SCHOOL_NAME
      || 'Rural Digital Learning Institution';
    const issuedAt = new Date().toISOString();

    const verificationHash = crypto
      .createHmac('sha256', process.env.JWT_SECRET || 'certificate-verification')
      .update(`${certificateCode}|${req.user.id}|${courseId}|${issuedAt}`)
      .digest('hex');

    const created = await db.query(
      `INSERT INTO certificates (
         certificate_code, verification_hash, user_id, course_id,
         student_name, course_title, institution_name,
         completion_percentage, final_score_percentage, issued_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, 100, $8, $9) RETURNING *`,
      [
        certificateCode,
        verificationHash,
        req.user.id,
        courseId,
        req.user.full_name,
        course.title,
        institutionName,
        finalScorePct,
        issuedAt,
      ]
    );

    return res.status(201).json({
      success: true,
      message: 'Course completion certificate issued!',
      certificate: created.rows[0],
    });
  } catch (error) {
    logger.error('Generate certificate error', { error: error.message });
    return res.status(500).json({ success: false, message: 'Error generating certificate' });
  }
});

// Download certificate as PDF
router.get('/:id/download', auth, async (req, res) => {
  try {
    const certId = parseInt(req.params.id, 10);
    if (!Number.isInteger(certId) || certId <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid certificate ID' });
    }

    const cert = await db.get(
      `SELECT cert.*, c.created_by AS course_owner_id
       FROM certificates cert
       JOIN courses c ON c.id = cert.course_id
       WHERE cert.id = $1`,
      [certId]
    );
    if (!cert) {
      return res.status(404).json({ success: false, message: 'Certificate not found' });
    }

    const isAllowed = req.user.role === 'admin'
      || cert.user_id === req.user.id
      || (req.user.role === 'teacher' && cert.course_owner_id === req.user.id);
    if (!isAllowed) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const formattedDate = new Date(cert.issued_at).toLocaleDateString('en-IN', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="Certificate-${cert.certificate_code}.pdf"`
    );
    res.setHeader('X-Content-Type-Options', 'nosniff');

    const doc = new PDFDocument({
      size: 'A4',
      layout: 'landscape',
      margins: { top: 40, bottom: 40, left: 50, right: 50 },
      info: {
        Title: `Certificate of Completion - ${cert.course_title}`,
        Author: cert.institution_name,
        Subject: `Certificate ID: ${cert.certificate_code}`,
      },
    });

    doc.pipe(res);

    const pageWidth = doc.page.width;
    const pageHeight = doc.page.height;

    // Decorative outer & inner border
    doc.save();
    doc.rect(22, 22, pageWidth - 44, pageHeight - 44).lineWidth(3).stroke('#1e3c72');
    doc.rect(30, 30, pageWidth - 60, pageHeight - 60).lineWidth(1).stroke('#4facfe');
    doc.restore();

    // Institution Header
    doc
      .fillColor('#1e3c72')
      .font('Helvetica-Bold')
      .fontSize(18)
      .text(String(cert.institution_name).toUpperCase(), 60, 68, {
        width: pageWidth - 120,
        align: 'center',
      });

    doc
      .fillColor('#4a5568')
      .font('Helvetica')
      .fontSize(11)
      .text('Digital Learning Platform for Rural Schools', 60, 94, {
        width: pageWidth - 120,
        align: 'center',
      });

    // Main Title
    doc
      .fillColor('#1a202c')
      .font('Helvetica-Bold')
      .fontSize(32)
      .text('CERTIFICATE OF COMPLETION', 60, 140, {
        width: pageWidth - 120,
        align: 'center',
      });

    doc
      .fillColor('#4a5568')
      .font('Helvetica')
      .fontSize(14)
      .text('This is to certify that', 60, 195, {
        width: pageWidth - 120,
        align: 'center',
      });

    // Student Name
    doc
      .fillColor('#1e3c72')
      .font('Helvetica-Bold')
      .fontSize(28)
      .text(cert.student_name, 60, 225, {
        width: pageWidth - 120,
        align: 'center',
      });

    doc
      .moveTo(pageWidth / 2 - 170, 263)
      .lineTo(pageWidth / 2 + 170, 263)
      .lineWidth(1)
      .stroke('#cbd5e0');

    doc
      .fillColor('#4a5568')
      .font('Helvetica')
      .fontSize(14)
      .text('has successfully completed all required lessons and assessments for the course', 60, 280, {
        width: pageWidth - 120,
        align: 'center',
      });

    // Course Name
    doc
      .fillColor('#1a202c')
      .font('Helvetica-Bold')
      .fontSize(22)
      .text(cert.course_title, 60, 312, {
        width: pageWidth - 120,
        align: 'center',
      });

    if (cert.final_score_percentage !== null && cert.final_score_percentage !== undefined) {
      doc
        .fillColor('#2b6cb0')
        .font('Helvetica-Bold')
        .fontSize(13)
        .text(`Assessment Score Achieved: ${cert.final_score_percentage}%`, 60, 350, {
          width: pageWidth - 120,
          align: 'center',
        });
    }

    // Footer metadata: Date, Certificate ID, Verification Signature
    const footerY = 430;
    doc
      .fillColor('#2d3748')
      .font('Helvetica-Bold')
      .fontSize(11)
      .text(`Completion Date: ${formattedDate}`, 70, footerY);

    doc
      .font('Helvetica-Bold')
      .fontSize(11)
      .text(`Certificate ID: ${cert.certificate_code}`, 70, footerY + 20);

    doc
      .font('Helvetica')
      .fontSize(9)
      .fillColor('#4a5568')
      .text(
        `Verification Code: ${String(cert.verification_hash).slice(0, 16).toUpperCase()}  |  Verify online at /verify-certificate/${cert.certificate_code}`,
        70,
        footerY + 40
      );

    // Signature block on right
    doc
      .moveTo(pageWidth - 260, footerY + 25)
      .lineTo(pageWidth - 80, footerY + 25)
      .lineWidth(1)
      .stroke('#2d3748');

    doc
      .fillColor('#2d3748')
      .font('Helvetica-Bold')
      .fontSize(11)
      .text('Authorized Academic Seal', pageWidth - 260, footerY + 32, {
        width: 180,
        align: 'center',
      });

    doc.end();
    return undefined;
  } catch (error) {
    logger.error('Download certificate PDF error', { error: error.message });
    if (!res.headersSent) {
      return res.status(500).json({ success: false, message: 'Error generating certificate PDF' });
    }
    return undefined;
  }
});

module.exports = router;
