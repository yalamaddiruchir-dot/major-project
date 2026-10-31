const fs = require('fs');
const os = require('os');
const path = require('path');

describe('Database Constraints, Non-Destructive Migrations, Concurrency & Backup/Restore', () => {
  let tmpDir;
  let dbPath;
  let backupDir;
  let db;
  let runMigrations;
  let seedSafe;
  let backupUtils;

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dlp-db-test-'));
    dbPath = path.join(tmpDir, 'test_platform.sqlite');
    backupDir = path.join(tmpDir, 'backups');

    process.env.NODE_ENV = 'test';
    process.env.DB_PATH = dbPath;
    process.env.BACKUP_DIR = backupDir;
    process.env.JWT_SECRET = 'db-test-jwt-secret-key-minimum-32-characters-long';
    process.env.BOOTSTRAP_ADMIN_PASSWORD = 'AdminPassword123!';
    process.env.BOOTSTRAP_TEACHER_PASSWORD = 'TeacherPassword123!';

    db = require('../../database/connection');
    await db.reopen(dbPath);
    ({ runMigrations } = require('../../database/migrate'));
    ({ seedSafe } = require('../../database/seed_safe'));
    backupUtils = require('../../utils/backup');
  });

  afterAll(async () => {
    if (db) await db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('runMigrations creates schema cleanly and preserves existing user & course data on repeated runs', async () => {
    await runMigrations({ includeBootstrap: true });
    await seedSafe();

    const beforeUsers = await db.get('SELECT COUNT(*) AS cnt FROM users');
    expect(Number(beforeUsers.cnt)).toBeGreaterThanOrEqual(2);

    // Insert a custom school student record and re-run migrations
    await db.query(
      "INSERT INTO users (username, email, password_hash, full_name, role, school_name) VALUES ($1, $2, $3, $4, 'student', $5)",
      ['preserve_me', 'preserve@school.edu', 'hashed_pw', 'Preserved Student', 'ZPHS Test']
    );

    await runMigrations({ silent: true });
    await seedSafe({ silent: true });

    const preserved = await db.get('SELECT * FROM users WHERE username = $1', ['preserve_me']);
    expect(preserved).toBeTruthy();
    expect(preserved.full_name).toBe('Preserved Student');
  });

  test('Relational constraints enforce foreign keys, role CHECKs, and unique enrollments', async () => {
    const student = await db.get("SELECT id FROM users WHERE username = 'preserve_me'");
    const course = await db.get('SELECT id FROM courses LIMIT 1');

    // Invalid role CHECK constraint rejected
    await expect(
      db.query(
        "INSERT INTO users (username, email, password_hash, full_name, role) VALUES ('badrole', 'bad@e.com', 'h', 'Bad', 'superadmin')"
      )
    ).rejects.toThrow();

    // Foreign key constraint on non-existent course rejected
    await expect(
      db.query('INSERT INTO enrollments (user_id, course_id) VALUES ($1, $2)', [student.id, 999999])
    ).rejects.toThrow();

    // Unique (user_id, course_id) enrollment enforced
    await db.query('INSERT INTO enrollments (user_id, course_id) VALUES ($1, $2)', [student.id, course.id]);
    await expect(
      db.query('INSERT INTO enrollments (user_id, course_id) VALUES ($1, $2)', [student.id, course.id])
    ).rejects.toThrow();
  });

  test('Transactions roll back atomically on mid-transaction failure and serialize concurrent writes safely', async () => {
    const beforeCount = await db.get('SELECT COUNT(*) AS cnt FROM courses');
    const teacher = await db.get("SELECT id FROM users WHERE role = 'teacher' LIMIT 1");

    await expect(
      db.transaction(async (tx) => {
        await tx.query(
          'INSERT INTO courses (title, description, category, language, created_by) VALUES ($1, $2, $3, $4, $5)',
          ['Transient Course', 'Should roll back', 'Science', 'en', teacher.id]
        );
        throw new Error('Simulated failure mid-transaction');
      })
    ).rejects.toThrow('Simulated failure mid-transaction');

    const afterRollback = await db.get('SELECT COUNT(*) AS cnt FROM courses');
    expect(Number(afterRollback.cnt)).toBe(Number(beforeCount.cnt));

    // Concurrent serialized transactions (15 parallel lesson progress writes)
    const student = await db.get("SELECT id FROM users WHERE username = 'preserve_me'");
    const course = await db.get('SELECT id FROM courses LIMIT 1');
    const lesson = await db.get('SELECT id FROM lessons WHERE course_id = $1 LIMIT 1', [course.id]);

    await Promise.all(
      Array.from({ length: 15 }, (_, idx) =>
        db.transaction(async (tx) => {
          const existing = await tx.get(
            'SELECT * FROM user_progress WHERE user_id = $1 AND lesson_id = $2',
            [student.id, lesson.id]
          );
          if (existing) {
            await tx.query(
              'UPDATE user_progress SET time_spent_minutes = time_spent_minutes + 1 WHERE id = $1',
              [existing.id]
            );
          } else {
            await tx.query(
              `INSERT INTO user_progress (user_id, course_id, lesson_id, completion_status, progress_percentage, time_spent_minutes)
               VALUES ($1, $2, $3, 'in_progress', $4, 1)`,
              [student.id, course.id, lesson.id, idx + 10]
            );
          }
        })
      )
    );

    const finalProg = await db.get(
      'SELECT time_spent_minutes FROM user_progress WHERE user_id = $1 AND lesson_id = $2',
      [student.id, lesson.id]
    );
    expect(Number(finalProg.time_spent_minutes)).toBe(15);
  });

  test('Backup, integrity validation, corruption detection, and full restore work end-to-end', async () => {
    const snap = await backupUtils.createBackup({ label: 'pre-change' });
    expect(snap.filename).toMatch(/\.sqlite$/);

    const checkValid = await backupUtils.validateBackup(snap.filename);
    expect(checkValid.valid).toBe(true);
    expect(checkValid.tableCount).toBeGreaterThanOrEqual(8);

    // Detect corrupted / non-SQLite backup file
    const corruptFile = path.join(backupDir, 'corrupt-test.sqlite');
    fs.writeFileSync(corruptFile, Buffer.alloc(8192, 0x41));
    const checkCorrupt = await backupUtils.validateBackup('corrupt-test.sqlite');
    expect(checkCorrupt.valid).toBe(false);

    // Mutate live DB after snapshot, then restore snapshot and confirm state reverted
    await db.query(
      "INSERT INTO users (username, email, password_hash, full_name, role) VALUES ('temp_after_snap', 'temp@s.edu', 'h', 'Temp', 'student')"
    );
    const existsBeforeRestore = await db.get("SELECT id FROM users WHERE username = 'temp_after_snap'");
    expect(existsBeforeRestore).toBeTruthy();

    const restoreResult = await backupUtils.restoreBackup(snap.filename);
    expect(restoreResult.restoredFrom).toBe(snap.filename);

    const existsAfterRestore = await db.get("SELECT id FROM users WHERE username = 'temp_after_snap'");
    expect(existsAfterRestore).toBeNull();

    const existedStillExists = await db.get("SELECT id FROM users WHERE username = 'preserve_me'");
    expect(existedStillExists).toBeTruthy();
  });

  test('Universal sql.js WebAssembly fallback driver supports Node < 22.5 without native C++ addons', async () => {
    const wasmDbPath = path.join(tmpDir, 'wasm_fallback.sqlite');
    await db.reopen(wasmDbPath, { forceWasm: true });
    expect(db.getDriverType()).toBe('sql.js');

    await runMigrations({ includeBootstrap: false });
    const ins = await db.query(
      "INSERT INTO users (username, email, password_hash, full_name, role) VALUES ($1, $2, $3, $4, 'student') RETURNING id",
      ['wasm_learner', 'wasm@school.edu', 'hash', 'WASM Learner']
    );
    expect(ins.rows[0].id).toBeGreaterThan(0);

    // Reopen from disk to prove atomic persistence
    await db.reopen(wasmDbPath, { forceWasm: true });
    const loaded = await db.get("SELECT full_name FROM users WHERE username = 'wasm_learner'");
    expect(loaded.full_name).toBe('WASM Learner');

    // Restore primary native driver
    await db.reopen(dbPath);
  });
});
