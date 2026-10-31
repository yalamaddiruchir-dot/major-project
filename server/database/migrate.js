const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const db = require('./connection');
const logger = require('../utils/logger');

const ensureColumn = async (tableName, columnName, definitionSql) => {
  const info = await db.query(`PRAGMA table_info(${tableName})`);
  const exists = info.rows.some((col) => col.name === columnName);
  if (!exists) {
    await db.query(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definitionSql}`);
  }
};

const upgradeLegacyLessonsCheckConstraintIfNeeded = async () => {
  const tableRow = await db.get(
    "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'lessons'"
  );
  if (!tableRow || !tableRow.sql) return;
  if (tableRow.sql.includes("'audio'") && tableRow.sql.includes("'pdf'")) return;

  await db.exec('PRAGMA foreign_keys = OFF;');
  try {
    await db.transaction(async (tx) => {
      await tx.query(`
        CREATE TABLE lessons_upgraded (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
          title TEXT NOT NULL,
          description TEXT,
          content TEXT NOT NULL,
          lesson_type TEXT DEFAULT 'text' CHECK (lesson_type IN ('text', 'video', 'audio', 'pdf', 'image', 'interactive', 'quiz')),
          video_url TEXT,
          low_bandwidth_video_url TEXT,
          audio_url TEXT,
          pdf_url TEXT,
          image_url TEXT,
          alt_text TEXT,
          file_size_bytes INTEGER DEFAULT 0,
          order_index INTEGER DEFAULT 0,
          duration_minutes INTEGER DEFAULT 15,
          is_active BOOLEAN DEFAULT 1,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      await tx.query(`
        INSERT INTO lessons_upgraded (
          id, course_id, title, description, content, lesson_type, video_url,
          low_bandwidth_video_url, audio_url, pdf_url, image_url, alt_text,
          file_size_bytes, order_index, duration_minutes, is_active, created_at, updated_at
        )
        SELECT
          id, course_id, title, description, content, COALESCE(lesson_type, 'text'), video_url,
          low_bandwidth_video_url, audio_url, pdf_url, image_url, alt_text,
          COALESCE(file_size_bytes, 0), COALESCE(order_index, 0), duration_minutes,
          COALESCE(is_active, 1), created_at, updated_at
        FROM lessons
      `);
      await tx.query('DROP TABLE lessons');
      await tx.query('ALTER TABLE lessons_upgraded RENAME TO lessons');
      await tx.query('CREATE INDEX IF NOT EXISTS idx_lessons_course ON lessons(course_id)');
    });
  } finally {
    await db.exec('PRAGMA foreign_keys = ON;');
  }
};

const recordMigration = async (version, description) => {
  const existing = await db.get('SELECT version FROM schema_migrations WHERE version = $1', [version]);
  if (!existing) {
    await db.query(
      'INSERT INTO schema_migrations (version, description) VALUES ($1, $2)',
      [version, description]
    );
  }
};

async function runMigrations({ includeBootstrap = false } = {}) {
  const schemaPath = path.join(__dirname, 'schema.sql');
  const schema = fs.readFileSync(schemaPath, 'utf8');

  const statements = schema
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  for (const statement of statements) {
    try {
      await db.query(statement);
    } catch (error) {
      if (!error.message.includes('already exists') && !error.message.includes('duplicate column')) {
        throw error;
      }
    }
  }

  // Non-destructive column upgrades for existing databases
  await ensureColumn('users', 'preferred_language', "TEXT DEFAULT 'en'");
  await ensureColumn('users', 'low_bandwidth_mode', 'BOOLEAN DEFAULT 0');
  await ensureColumn('users', 'is_active', 'BOOLEAN DEFAULT 1');
  await ensureColumn('users', 'token_version', 'INTEGER DEFAULT 0');
  await ensureColumn('users', 'failed_login_attempts', 'INTEGER DEFAULT 0');
  await ensureColumn('users', 'locked_until', 'TIMESTAMP');
  await ensureColumn('users', 'last_login_at', 'TIMESTAMP');

  await ensureColumn('courses', 'level', "TEXT DEFAULT 'beginner'");
  await ensureColumn('courses', 'passing_percentage', 'INTEGER DEFAULT 60');

  await ensureColumn('lessons', 'low_bandwidth_video_url', 'TEXT');
  await ensureColumn('lessons', 'audio_url', 'TEXT');
  await ensureColumn('lessons', 'pdf_url', 'TEXT');
  await ensureColumn('lessons', 'image_url', 'TEXT');
  await ensureColumn('lessons', 'alt_text', 'TEXT');
  await ensureColumn('lessons', 'file_size_bytes', 'INTEGER DEFAULT 0');

  await ensureColumn('user_progress', 'last_position_seconds', 'INTEGER DEFAULT 0');

  await upgradeLegacyLessonsCheckConstraintIfNeeded();

  // Re-ensure indexes after any table upgrades
  await db.query('CREATE INDEX IF NOT EXISTS idx_lessons_course ON lessons(course_id)');
  await db.query('CREATE INDEX IF NOT EXISTS idx_courses_category ON courses(category)');
  await db.query('CREATE INDEX IF NOT EXISTS idx_courses_language ON courses(language)');

  await recordMigration('001_initial_schema', 'Base users, courses, lessons, progress, assessments, enrollments');
  await recordMigration('002_security_and_offline_sync', 'Token revocation, lockout tracking, sync idempotency events');
  await recordMigration('003_learning_features_and_multilingual', 'Course assessments, certificates, materials, translations, audio/PDF lessons');

  if (includeBootstrap) {
    await insertBootstrapIfEmpty();
  }
}

async function insertBootstrapIfEmpty() {
  const userCheck = await db.query('SELECT COUNT(*) as count FROM users');
  if (Number(userCheck.rows[0].count) > 0) {
    logger.info('Existing users detected; preserving all existing data without changes.');
    return;
  }

  const adminPassword = process.env.BOOTSTRAP_ADMIN_PASSWORD;
  if (!adminPassword || adminPassword.length < 12) {
    logger.info('Database schema initialized. Configure server/.env and run create-admin or seed:safe to populate initial accounts/courses.');
    return;
  }

  const adminUsername = process.env.BOOTSTRAP_ADMIN_USERNAME || 'admin';
  const adminEmail = (process.env.BOOTSTRAP_ADMIN_EMAIL || 'admin@school.local').toLowerCase();
  const adminName = process.env.BOOTSTRAP_ADMIN_NAME || 'Platform Administrator';
  const adminHash = await bcrypt.hash(adminPassword, 12);

  const adminResult = await db.query(
    `INSERT INTO users (username, email, password_hash, full_name, role, school_name)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [adminUsername, adminEmail, adminHash, adminName, 'admin', process.env.SCHOOL_NAME || 'Rural School']
  );
  const adminId = adminResult.lastID;

  let teacherId = adminId;
  const teacherPassword = process.env.BOOTSTRAP_TEACHER_PASSWORD;
  if (teacherPassword && teacherPassword.length >= 12) {
    const teacherHash = await bcrypt.hash(teacherPassword, 12);
    const teacherResult = await db.query(
      `INSERT INTO users (username, email, password_hash, full_name, role, school_name)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        process.env.BOOTSTRAP_TEACHER_USERNAME || 'teacher1',
        (process.env.BOOTSTRAP_TEACHER_EMAIL || 'teacher@school.local').toLowerCase(),
        teacherHash,
        process.env.BOOTSTRAP_TEACHER_NAME || 'Demo Teacher',
        'teacher',
        process.env.SCHOOL_NAME || 'Rural School',
      ]
    );
    teacherId = teacherResult.lastID;
  }

  logger.info('Bootstrap administrator/teacher accounts initialized.', { adminId, teacherId });
}

async function migrate() {
  try {
    logger.info('Starting non-destructive database migration...');
    await runMigrations({ includeBootstrap: true });
    logger.info('Database migration completed successfully.');
    await db.close();
    process.exit(0);
  } catch (error) {
    logger.error('Migration failed', { error: error.message });
    await db.close();
    process.exit(1);
  }
}

if (require.main === module) {
  migrate();
}

module.exports = { migrate, runMigrations };
