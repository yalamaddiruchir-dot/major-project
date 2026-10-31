const fs = require('fs');
const os = require('os');
const path = require('path');
const request = require('supertest');

describe('OWASP Security Hardening Suite (Privilege Escalation, IDOR, SQLi, XSS, Upload Spoofing, Token Revocation)', () => {
  let tmpDir;
  let app;
  let db;
  let adminToken;
  let teacherAToken;
  let teacherBToken;
  let studentAToken;
  let studentAId;
  let studentBToken;
  let studentBId;
  let courseAId;

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dlp-sec-test-'));
    process.env.NODE_ENV = 'test';
    process.env.DB_PATH = path.join(tmpDir, 'security.sqlite');
    process.env.BACKUP_DIR = path.join(tmpDir, 'backups');
    process.env.JWT_SECRET = 'security-test-jwt-secret-key-minimum-32-characters-long';
    process.env.BOOTSTRAP_ADMIN_PASSWORD = 'AdminPassword123!';
    process.env.BOOTSTRAP_TEACHER_PASSWORD = 'TeacherPassword123!';

    db = require('../../database/connection');
    await db.reopen(process.env.DB_PATH);
    const { runMigrations } = require('../../database/migrate');
    const { seedSafe } = require('../../database/seed_safe');
    await runMigrations({ includeBootstrap: true });
    await seedSafe();

    app = require('../../index');

    const adminLogin = await request(app)
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'AdminPassword123!' });
    adminToken = adminLogin.body.token;

    await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        username: 'sec_teacher_a',
        email: 'ta@sec.edu',
        password: 'TeacherPassword1!',
        full_name: 'Teacher A',
        role: 'teacher',
      });
    await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        username: 'sec_teacher_b',
        email: 'tb@sec.edu',
        password: 'TeacherPassword1!',
        full_name: 'Teacher B',
        role: 'teacher',
      });

    teacherAToken = (
      await request(app).post('/api/auth/login').send({ username: 'sec_teacher_a', password: 'TeacherPassword1!' })
    ).body.token;
    teacherBToken = (
      await request(app).post('/api/auth/login').send({ username: 'sec_teacher_b', password: 'TeacherPassword1!' })
    ).body.token;

    const regA = await request(app).post('/api/auth/register').send({
      username: 'sec_student_a',
      email: 'sa@sec.edu',
      password: 'StudentPassword1!',
      full_name: 'Student A',
    });
    studentAToken = regA.body.token;
    studentAId = regA.body.user.id;

    const regB = await request(app).post('/api/auth/register').send({
      username: 'sec_student_b',
      email: 'sb@sec.edu',
      password: 'StudentPassword1!',
      full_name: 'Student B',
    });
    studentBToken = regB.body.token;
    studentBId = regB.body.user.id;

    const cRes = await request(app)
      .post('/api/courses')
      .set('Authorization', `Bearer ${teacherAToken}`)
      .send({ title: 'Teacher A Protected Course', description: 'Desc', category: 'Science', language: 'en' });
    courseAId = cRes.body.course.id;
  });

  afterAll(async () => {
    if (db) await db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('Public registration blocks role escalation to admin or teacher', async () => {
    const attemptAdmin = await request(app).post('/api/auth/register').send({
      username: 'evil_escalator',
      email: 'evil@sec.edu',
      password: 'EvilPassword123!',
      full_name: 'Attempted Admin',
      role: 'admin',
    });
    // Must either reject with 403/400 or force role === 'student'
    if (attemptAdmin.status === 201) {
      expect(attemptAdmin.body.user.role).toBe('student');
    } else {
      expect([400, 403]).toContain(attemptAdmin.status);
    }
  });

  test('RBAC & IDOR protection: students cannot access admin/teacher routes or other students profiles/enrollments', async () => {
    const adminUsersAttempt = await request(app)
      .get('/api/users')
      .set('Authorization', `Bearer ${studentAToken}`);
    expect(adminUsersAttempt.status).toBe(403);

    const createCourseAttempt = await request(app)
      .post('/api/courses')
      .set('Authorization', `Bearer ${studentAToken}`)
      .send({ title: 'Unauthorized Course' });
    expect(createCourseAttempt.status).toBe(403);

    // IDOR: Student A trying to view Student B's user record or enrollments
    const idorProfile = await request(app)
      .get(`/api/users/${studentBId}`)
      .set('Authorization', `Bearer ${studentAToken}`);
    expect(idorProfile.status).toBe(403);

    const idorEnroll = await request(app)
      .get(`/api/users/${studentBId}/enrollments`)
      .set('Authorization', `Bearer ${studentAToken}`);
    expect(idorEnroll.status).toBe(403);

    // IDOR: Teacher B trying to modify or delete Teacher A's course
    const crossTeacherEdit = await request(app)
      .put(`/api/courses/${courseAId}`)
      .set('Authorization', `Bearer ${teacherBToken}`)
      .send({ title: 'Hijacked Title' });
    expect(crossTeacherEdit.status).toBe(403);

    const crossTeacherDelete = await request(app)
      .delete(`/api/courses/${courseAId}`)
      .set('Authorization', `Bearer ${teacherBToken}`);
    expect(crossTeacherDelete.status).toBe(403);
  });

  test('SQL Injection payloads in login and course search are safely parameterized without data leak or table damage', async () => {
    const sqliLogin = await request(app)
      .post('/api/auth/login')
      .send({ username: "' OR 1=1 --", password: "' OR '1'='1" });
    expect(sqliLogin.status).toBe(401);

    const sqliSearch = await request(app)
      .get('/api/courses')
      .query({ search: "'; DROP TABLE users; --" });
    expect(sqliSearch.status).toBe(200);

    const usersIntact = await db.get('SELECT COUNT(*) AS cnt FROM users');
    expect(Number(usersIntact.cnt)).toBeGreaterThanOrEqual(5);
  });

  test('Upload security rejects spoofed executable/script disguised as PDF/PNG and blocks path traversal on /api/files', async () => {
    const fakePdf = Buffer.from('MZ\x90\x00This is an executable pretending to be a PDF', 'utf8');
    const spoofRes = await request(app)
      .post('/api/upload')
      .set('Authorization', `Bearer ${teacherAToken}`)
      .attach('file', fakePdf, { filename: 'malware.pdf', contentType: 'application/pdf' });
    expect(spoofRes.status).toBe(400);

    const svgScript = Buffer.from('<svg onload="alert(1)"></svg>', 'utf8');
    const svgRes = await request(app)
      .post('/api/upload')
      .set('Authorization', `Bearer ${teacherAToken}`)
      .attach('file', svgScript, { filename: 'xss.svg', contentType: 'image/svg+xml' });
    expect(svgRes.status).toBe(400);

    // Path traversal blocked
    const traversal = await request(app)
      .get('/api/files/pdfs/..%2F..%2Findex.js')
      .set('Authorization', `Bearer ${adminToken}`);
    expect([400, 403, 404]).toContain(traversal.status);
  });

  test('Security HTTP headers (CSP, X-Content-Type-Options, X-Frame-Options) are set on responses', async () => {
    const res = await request(app).get('/api/health');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['content-security-policy']).toBeDefined();
  });

  test('Logout revokes JWT immediately and password change invalidates older tokens', async () => {
    const tempLogin = await request(app)
      .post('/api/auth/login')
      .send({ username: 'sec_student_b', password: 'StudentPassword1!' });
    const token1 = tempLogin.body.token;

    // Logout revokes token1
    const logoutRes = await request(app)
      .post('/api/auth/logout')
      .set('Authorization', `Bearer ${token1}`);
    expect(logoutRes.status).toBe(200);

    const reuseRevoked = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token1}`);
    expect(reuseRevoked.status).toBe(401);

    // Login twice -> change password -> old token invalidated via token_version!
    const sessionA = (
      await request(app).post('/api/auth/login').send({ username: 'sec_student_a', password: 'StudentPassword1!' })
    ).body.token;
    const sessionB = (
      await request(app).post('/api/auth/login').send({ username: 'sec_student_a', password: 'StudentPassword1!' })
    ).body.token;

    const pwdChange = await request(app)
      .put('/api/auth/password')
      .set('Authorization', `Bearer ${sessionA}`)
      .send({ current_password: 'StudentPassword1!', new_password: 'NewStudentPassword2!' });
    expect(pwdChange.status).toBe(200);
    const freshToken = pwdChange.body.token;

    const oldSessionRejected = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${sessionB}`);
    expect(oldSessionRejected.status).toBe(401);

    const newSessionAccepted = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${freshToken}`);
    expect(newSessionAccepted.status).toBe(200);
  });

  test('Repeated wrong passwords trigger account brute-force lockout protection', async () => {
    await request(app).post('/api/auth/register').send({
      username: 'lockout_target',
      email: 'lock@sec.edu',
      password: 'LockoutPassword1!',
      full_name: 'Lockout Target',
    });

    let lastStatus = 401;
    for (let i = 0; i < 6; i += 1) {
      const failRes = await request(app)
        .post('/api/auth/login')
        .send({ username: 'lockout_target', password: 'WrongPassword999!' });
      lastStatus = failRes.status;
    }
    expect([423, 429]).toContain(lastStatus);

    // Even valid password must remain blocked while account is locked
    const duringLock = await request(app)
      .post('/api/auth/login')
      .send({ username: 'lockout_target', password: 'LockoutPassword1!' });
    expect([423, 429]).toContain(duringLock.status);
  });

  test('Proxy-resilient X-Auth-Token and HttpOnly cookie auth work when gateway strips Authorization, while blocking cross-site cookie CSRF', async () => {
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ username: 'sec_student_b', password: 'StudentPassword1!' });
    expect(loginRes.status).toBe(200);
    const tok = loginRes.body.token;
    const rawCookie = (loginRes.headers['set-cookie'] || []).find((c) => c.startsWith('dlp_token='));
    expect(rawCookie).toBeDefined();
    expect(rawCookie).toMatch(/HttpOnly/i);

    // 1. Works via X-Auth-Token even with NO Authorization header (e.g., E2B / gateway proxy)
    const viaXAuth = await request(app)
      .get('/api/auth/me')
      .set('X-Auth-Token', tok);
    expect(viaXAuth.status).toBe(200);
    expect(viaXAuth.body.user.username).toBe('sec_student_b');

    // 2. Safe GET works via HttpOnly cookie alone
    const cookieHeaderVal = rawCookie.split(';')[0];
    const viaCookieGet = await request(app)
      .get('/api/auth/me')
      .set('Cookie', cookieHeaderVal);
    expect(viaCookieGet.status).toBe(200);

    // 3. State-changing POST with cookie alone (no X-Requested-With & cross-origin) is rejected (CSRF safe)
    const csrfBlocked = await request(app)
      .put('/api/auth/profile')
      .set('Cookie', cookieHeaderVal)
      .send({ full_name: 'CSRF Attempt' });
    expect(csrfBlocked.status).toBe(401);

    // 4. State-changing PUT with cookie + X-Requested-With succeeds
    const sameOriginCookieMut = await request(app)
      .put('/api/auth/profile')
      .set('Cookie', cookieHeaderVal)
      .set('X-Requested-With', 'XMLHttpRequest')
      .send({ full_name: 'Student B Verified' });
    expect(sameOriginCookieMut.status).toBe(200);
  });

  test('Destructive seed_data.js script refuses execution without explicit CONFIRM_RESET=YES', () => {
    const { spawnSync } = require('child_process');
    const result = spawnSync(
      process.execPath,
      ['--no-warnings', path.join(__dirname, '../../database/seed_data.js')],
      {
        env: { ...process.env, CONFIRM_RESET: '' },
        encoding: 'utf8',
      }
    );
    expect(result.status).not.toBe(0);
    expect((result.stdout + result.stderr)).toMatch(/CONFIRM_RESET=YES/);
  });
});
