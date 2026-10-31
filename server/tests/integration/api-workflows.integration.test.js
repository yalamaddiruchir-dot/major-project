const fs = require('fs');
const os = require('os');
const path = require('path');
const request = require('supertest');

describe('Full Backend API Integration Suite (Student, Teacher, Admin, Offline Sync, Exams, Certificates)', () => {
  let tmpDir;
  let app;
  let db;
  let adminToken;
  let teacherToken;
  let studentToken;
  let studentId;
  let courseId;
  let lesson1Id;
  let lesson2Id;
  let uploadedPdfUrl;
  let examId;
  let certId;
  let certCode;

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dlp-api-int-'));
    process.env.NODE_ENV = 'test';
    process.env.DB_PATH = path.join(tmpDir, 'api_integration.sqlite');
    process.env.BACKUP_DIR = path.join(tmpDir, 'backups');
    process.env.JWT_SECRET = 'integration-test-jwt-secret-minimum-32-chars-2026';
    process.env.BOOTSTRAP_ADMIN_PASSWORD = 'AdminPassword123!';
    process.env.BOOTSTRAP_TEACHER_PASSWORD = 'TeacherPassword123!';

    db = require('../../database/connection');
    await db.reopen(process.env.DB_PATH);
    const { runMigrations } = require('../../database/migrate');
    const { seedSafe } = require('../../database/seed_safe');
    await runMigrations({ includeBootstrap: true });
    await seedSafe();

    app = require('../../index');
  });

  afterAll(async () => {
    if (db) await db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('GET /api/health returns healthy database and server status', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status.toLowerCase()).toBe('ok');
  });

  test('Admin logs in, creates a verified Teacher account, and lists users', async () => {
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'AdminPassword123!' });
    expect(loginRes.status).toBe(200);
    adminToken = loginRes.body.token;
    expect(loginRes.body.user.role).toBe('admin');

    const createTeacher = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        username: 'ramesh_teacher',
        email: 'ramesh@ruralgovschool.edu',
        password: 'TeacherPass123!',
        full_name: 'Ramesh Rao',
        role: 'teacher',
        school_name: 'ZPHS Nalgonda',
        preferred_language: 'te',
      });
    expect(createTeacher.status).toBe(201);
    expect(createTeacher.body.user.role).toBe('teacher');

    const teacherLogin = await request(app)
      .post('/api/auth/login')
      .send({ username: 'ramesh_teacher', password: 'TeacherPass123!' });
    expect(teacherLogin.status).toBe(200);
    teacherToken = teacherLogin.body.token;
  });

  test('Public student registration succeeds and upgrades profile preferences', async () => {
    const regRes = await request(app)
      .post('/api/auth/register')
      .send({
        username: 'ananya_8th',
        email: 'ananya@student.edu',
        password: 'StudentPass123!',
        full_name: 'Ananya Kumari',
        school_name: 'ZPHS Nalgonda',
        class_grade: '8th Grade',
        preferred_language: 'te',
      });
    expect(regRes.status).toBe(201);
    expect(regRes.body.user.role).toBe('student');
    studentToken = regRes.body.token;
    studentId = regRes.body.user.id;

    const profRes = await request(app)
      .put('/api/auth/profile')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ low_bandwidth_mode: true, preferred_language: 'hi' });
    expect(profRes.status).toBe(200);
    expect(profRes.body.user.preferred_language).toBe('hi');
    expect(profRes.body.user.low_bandwidth_mode).toBe(true);
  });

  test('Teacher uploads magic-byte verified PDF & MP3, creates multilingual Course, Lessons, and Learning Material', async () => {
    // Valid PDF header (%PDF-1.4...)
    const validPdfBuffer = Buffer.from(
      '%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n',
      'utf8'
    );
    const pdfUpload = await request(app)
      .post('/api/upload')
      .set('Authorization', `Bearer ${teacherToken}`)
      .attach('file', validPdfBuffer, { filename: 'solar-notes.pdf', contentType: 'application/pdf' });
    expect(pdfUpload.status).toBe(201);
    uploadedPdfUrl = pdfUpload.body.url;

    // Valid WAV header (RIFF....WAVE)
    const wavHeader = Buffer.alloc(44);
    wavHeader.write('RIFF', 0);
    wavHeader.writeUInt32LE(36, 4);
    wavHeader.write('WAVEfmt ', 8);
    const audioUpload = await request(app)
      .post('/api/upload')
      .set('Authorization', `Bearer ${teacherToken}`)
      .attach('file', wavHeader, { filename: 'narration.wav', contentType: 'audio/wav' });
    expect(audioUpload.status).toBe(201);
    const uploadedAudioUrl = audioUpload.body.url;

    const courseRes = await request(app)
      .post('/api/courses')
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({
        title: 'Rural Solar & Science Lab',
        description: 'Practical solar electricity and rural energy science.',
        category: 'Science',
        language: 'en',
        translations: {
          te: {
            title: 'గ్రామీణ సౌర విజ్ఞాన ప్రయోగశాల',
            description: 'సౌర విద్యుత్ మరియు విజ్ఞాన పాఠాలు.',
          },
          hi: {
            title: 'ग्रामीण सौर विज्ञान प्रयोगशाला',
            description: 'व्यावहारिक सौर ऊर्जा और विज्ञान पाठ।',
          },
        },
      });
    expect(courseRes.status).toBe(201);
    courseId = courseRes.body.course.id;

    const l1 = await request(app)
      .post('/api/lessons')
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({
        course_id: courseId,
        title: 'How Solar Cells Work',
        content: 'Photovoltaic cells convert sunlight directly into DC electricity.',
        lesson_type: 'audio',
        audio_url: uploadedAudioUrl,
        pdf_url: uploadedPdfUrl,
        order_index: 1,
        duration_minutes: 15,
        translations: {
          te: {
            title: 'సౌర ఘటాలు ఎలా పనిచేస్తాయి',
            content: 'ఫోటోవోల్టాయిక్ కణాలు సూర్యరశ్మిని నేరుగా విద్యుత్తుగా మారుస్తాయి.',
          },
        },
      });
    expect(l1.status).toBe(201);
    lesson1Id = l1.body.lesson.id;

    const l2 = await request(app)
      .post('/api/lessons')
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({
        course_id: courseId,
        title: 'Battery Storage Safety',
        content: 'Proper fuse protection and ventilation keep solar batteries safe.',
        lesson_type: 'text',
        order_index: 2,
        duration_minutes: 10,
      });
    expect(l2.status).toBe(201);
    lesson2Id = l2.body.lesson.id;

    const matRes = await request(app)
      .post('/api/materials')
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({
        course_id: courseId,
        title: 'Solar Wiring Diagram PDF',
        description: 'Printable classroom reference chart',
        material_type: 'pdf',
        file_url: uploadedPdfUrl,
        file_size_bytes: validPdfBuffer.length,
        mime_type: 'application/pdf',
      });
    expect(matRes.status).toBe(201);
  });

  test('Unenrolled student is blocked from protected files & offline bundle; enrolled student gets full access + Range streaming', async () => {
    const blockedBundle = await request(app)
      .get(`/api/courses/${courseId}/offline-bundle`)
      .set('Authorization', `Bearer ${studentToken}`);
    expect(blockedBundle.status).toBe(403);

    const blockedFile = await request(app)
      .get(uploadedPdfUrl.replace('/uploads/', '/api/files/'))
      .set('Authorization', `Bearer ${studentToken}`);
    expect(blockedFile.status).toBe(403);

    // Enroll student
    const enrollRes = await request(app)
      .post(`/api/users/${studentId}/enrollments`)
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ course_id: courseId });
    expect(enrollRes.status).toBe(201);

    // Download offline bundle
    const bundleRes = await request(app)
      .get(`/api/courses/${courseId}/offline-bundle`)
      .set('Authorization', `Bearer ${studentToken}`);
    expect(bundleRes.status).toBe(200);
    expect(bundleRes.body.bundle.lessons.length).toBe(2);
    expect(bundleRes.body.bundle.course.translations.te.title).toContain('గ్రామీణ');

    // Authorized HTTP Range request on protected file via signed media_token (simulating HTML5 <audio>/<video> streaming)
    const signedUrl = bundleRes.body.bundle.lessons[0].pdf_url_signed;
    const rangeRes = await request(app)
      .get(signedUrl)
      .set('Range', 'bytes=0-7');
    expect(rangeRes.status).toBe(206);
    expect(rangeRes.headers['content-range']).toMatch(/^bytes 0-7\//);
  });

  test('Offline progress batch sync enforces idempotency & monotonic conflict resolution', async () => {
    const idemKey = 'offline-sync-key-ananya-l1';
    const sync1 = await request(app)
      .post('/api/progress/sync')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({
        updates: [
          {
            course_id: courseId,
            lesson_id: lesson1Id,
            completion_status: 'completed',
            progress_percentage: 100,
            time_spent_minutes: 12,
            last_position_seconds: 180,
            idempotency_key: idemKey,
          },
        ],
      });
    expect(sync1.status).toBe(200);
    expect(sync1.body.synced.length).toBe(1);

    // Replay same idempotency_key -> deduplicated without double-counting minutes!
    const syncDuplicate = await request(app)
      .post('/api/progress/sync')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({
        updates: [
          {
            course_id: courseId,
            lesson_id: lesson1Id,
            completion_status: 'completed',
            progress_percentage: 100,
            time_spent_minutes: 12,
            idempotency_key: idemKey,
          },
        ],
      });
    expect(syncDuplicate.status).toBe(200);
    expect(syncDuplicate.body.skipped_duplicates.length).toBe(1);
    expect(syncDuplicate.body.skipped_duplicates[0].progress.time_spent_minutes).toBe(12);

    // Out-of-order stale offline update ('in_progress', 40%) must NOT downgrade 'completed'
    const staleUpdate = await request(app)
      .post('/api/progress/sync')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({
        updates: [
          {
            course_id: courseId,
            lesson_id: lesson1Id,
            completion_status: 'in_progress',
            progress_percentage: 40,
            time_spent_minutes: 3,
            idempotency_key: 'stale-offline-event-2',
          },
        ],
      });
    expect(staleUpdate.body.synced[0].progress.completion_status).toBe('completed');
    expect(staleUpdate.body.synced[0].progress.progress_percentage).toBe(100);
    expect(staleUpdate.body.synced[0].progress.time_spent_minutes).toBe(15);
  });

  test('Timed Assessment lifecycle: Teacher authors MCQ+TF+ShortAnswer -> Student takes exam without answer leakage -> Server grades & enforces max attempts', async () => {
    const createExam = await request(app)
      .post('/api/assessments/exams')
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({
        course_id: courseId,
        title: 'Solar Energy Final Exam',
        description: 'Covers PV cells and battery safety',
        time_limit_minutes: 20,
        passing_percentage: 60,
        max_attempts: 1,
        show_correct_answers: 'after_submission',
        is_required_for_certificate: true,
        is_published: true,
        questions: [
          {
            question_type: 'mcq',
            question_text: 'What type of current does a solar panel produce directly?',
            options: ['Alternating Current (AC)', 'Direct Current (DC)', 'Three-phase AC', 'None'],
            correct_answer: '1',
            marks: 5,
            explanation: 'PV cells generate DC electricity.',
          },
          {
            question_type: 'true_false',
            question_text: 'Fuses protect solar battery circuits from overcurrent.',
            correct_answer: '0',
            marks: 3,
          },
          {
            question_type: 'short_answer',
            question_text: 'What device converts DC power to AC power?',
            correct_answer: 'inverter|solar inverter',
            marks: 2,
          },
        ],
      });
    expect(createExam.status).toBe(201);
    examId = createExam.body.exam.id;

    // Premature certificate claim MUST fail before lesson 2 & exam are completed
    const prematureCert = await request(app)
      .post('/api/certificates/generate')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ course_id: courseId });
    expect(prematureCert.status).toBe(400);

    // Start exam attempt — verify correct_answer is NEVER sent to student!
    const startRes = await request(app)
      .post(`/api/assessments/exams/${examId}/start`)
      .set('Authorization', `Bearer ${studentToken}`);
    expect(startRes.status).toBe(201);
    const attemptId = startRes.body.attempt.id;
    const qs = startRes.body.questions;
    expect(qs.length).toBe(3);
    qs.forEach((q) => {
      expect(q.correct_answer).toBeUndefined();
      expect(q.correct_answer_text).toBeUndefined();
    });

    // Save draft answers
    const draftPayload = {
      [qs[0].id]: '1',
      [qs[1].id]: '0',
      [qs[2].id]: 'Solar Inverter',
    };
    const saveRes = await request(app)
      .put(`/api/assessments/attempts/${attemptId}/save`)
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ answers: draftPayload });
    expect(saveRes.status).toBe(200);

    // Submit attempt
    const submitRes = await request(app)
      .post(`/api/assessments/attempts/${attemptId}/submit`)
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ answers: draftPayload });
    expect(submitRes.status).toBe(200);
    expect(submitRes.body.attempt.score).toBe(10);
    expect(submitRes.body.attempt.percentage).toBe(100);
    expect(submitRes.body.attempt.passed).toBe(true);

    // Duplicate submit on same attempt rejected with 409
    const dupSubmit = await request(app)
      .post(`/api/assessments/attempts/${attemptId}/submit`)
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ answers: draftPayload });
    expect(dupSubmit.status).toBe(409);

    // Retake beyond max_attempts (1) rejected with 403
    const retakeBlocked = await request(app)
      .post(`/api/assessments/exams/${examId}/start`)
      .set('Authorization', `Bearer ${studentToken}`);
    expect(retakeBlocked.status).toBe(403);

    // Teacher inspects submissions & class performance
    const teacherSubs = await request(app)
      .get(`/api/assessments/exams/${examId}/submissions`)
      .set('Authorization', `Bearer ${teacherToken}`);
    expect(teacherSubs.status).toBe(200);
    expect(teacherSubs.body.class_performance.total_submissions).toBe(1);
    expect(teacherSubs.body.class_performance.average_percentage).toBe(100);
  });

  test('Completing final lesson unlocks verifiable PDF Certificate + accurate Teacher/Admin Analytics', async () => {
    // Complete lesson 2
    const compL2 = await request(app)
      .post('/api/progress')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({
        course_id: courseId,
        lesson_id: lesson2Id,
        completion_status: 'completed',
        progress_percentage: 100,
        time_spent_minutes: 10,
      });
    expect(compL2.status).toBe(200);

    // Generate certificate
    const genCert = await request(app)
      .post('/api/certificates/generate')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ course_id: courseId });
    expect(genCert.status).toBe(201);
    certId = genCert.body.certificate.id;
    certCode = genCert.body.certificate.certificate_code;
    expect(certCode).toMatch(/^DLP-\d{4}-[A-F0-9]+$/);

    // Download PDF binary and check %PDF- header
    const pdfRes = await request(app)
      .get(`/api/certificates/${certId}/download`)
      .set('Authorization', `Bearer ${studentToken}`)
      .buffer(true)
      .parse((res, cb) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => cb(null, Buffer.concat(chunks)));
      });
    expect(pdfRes.status).toBe(200);
    expect(pdfRes.headers['content-type']).toContain('application/pdf');
    expect(pdfRes.body.subarray(0, 5).toString('ascii')).toBe('%PDF-');

    // Public verification endpoint works without auth
    const verifyRes = await request(app).get(`/api/certificates/verify/${certCode}`);
    expect(verifyRes.status).toBe(200);
    expect(verifyRes.body.valid).toBe(true);
    expect(verifyRes.body.certificate.student_name).toBe('Ananya Kumari');

    // Teacher analytics reflect real DB completion, marks, and certificate count
    const analyticsRes = await request(app)
      .get('/api/analytics/overview')
      .query({ course_id: courseId })
      .set('Authorization', `Bearer ${teacherToken}`);
    expect(analyticsRes.status).toBe(200);
    expect(analyticsRes.body.summary.total_enrolled_students).toBe(1);
    expect(analyticsRes.body.summary.overall_completion_percentage).toBe(100);
    expect(analyticsRes.body.summary.average_assessment_percentage).toBe(100);
    expect(analyticsRes.body.summary.certificates_issued).toBe(1);
  });

  test('Admin backup API creates and validates database snapshot', async () => {
    const createSnap = await request(app)
      .post('/api/admin/backups')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ label: 'ci-test' });
    expect(createSnap.status).toBe(201);
    const filename = createSnap.body.backup.filename;

    const verifySnap = await request(app)
      .post(`/api/admin/backups/${filename}/verify`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(verifySnap.status).toBe(200);
    expect(verifySnap.body.validation.valid).toBe(true);
  });

  test('Video upload automatically transcodes 360p low-bandwidth MP4 & adaptive HLS (.m3u8/.ts) via FFmpeg, and /import-remote enforces SSRF & YouTube ToS rules', async () => {
    const { runFfmpeg } = require('../../utils/transcoder');
    const sampleVideoPath = path.join(tmpDir, 'sample-lecture.mp4');
    await runFfmpeg([
      '-y',
      '-f', 'lavfi', '-i', 'color=c=navy:s=640x360:d=1',
      '-f', 'lavfi', '-i', 'anullsrc=r=22050:cl=mono',
      '-t', '1',
      '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p',
      '-c:a', 'aac', '-b:a', '48k',
      sampleVideoPath,
    ]);

    const videoRes = await request(app)
      .post('/api/upload')
      .set('Authorization', `Bearer ${teacherToken}`)
      .attach('file', sampleVideoPath, { contentType: 'video/mp4' });

    expect(videoRes.status).toBe(201);
    expect(videoRes.body.transcoded).toBe(true);
    expect(videoRes.body.low_bandwidth_url).toMatch(/-360p\.mp4$/);
    expect(videoRes.body.hls_url).toMatch(/-master\.m3u8$/);

    // Fetch signed HLS master playlist and verify variant playlists carry per-segment HMAC media_tokens
    const hlsPlaylistRes = await request(app).get(videoRes.body.hls_signed_url);
    expect(hlsPlaylistRes.status).toBe(200);
    expect(hlsPlaylistRes.text).toContain('#EXTM3U');
    expect(hlsPlaylistRes.text).toContain('media_token=');

    // SSRF guard blocks loopback/internal hosts on /api/upload/import-remote
    const ssrfRes = await request(app)
      .post('/api/upload/import-remote')
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({ url: 'https://127.0.0.1/secret.mp4' });
    expect(ssrfRes.status).toBe(403);

    // YouTube ToS guard returns explicit 422 guidance
    const ytRes = await request(app)
      .post('/api/upload/import-remote')
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({ url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' });
    expect(ytRes.status).toBe(422);
    expect(ytRes.body.code).toBe('YOUTUBE_TOS_PROTECTED');
  });
});
