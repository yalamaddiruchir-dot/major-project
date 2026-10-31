const path = require('path');
const dotenv = require('dotenv');
const bcrypt = require('bcryptjs');
const db = require('./connection');
const { runMigrations } = require('./migrate');
const { seedSafe } = require('./seed_safe');

dotenv.config({ path: path.join(__dirname, '../.env') });

const seedData = async () => {
  try {
    if (process.env.CONFIRM_RESET !== 'YES') {
      throw new Error('This reset-and-seed script deletes existing learning data. Set CONFIRM_RESET=YES to proceed, or use `npm run seed:safe` to preserve existing data.');
    }

    const demoPasswords = [
      process.env.SEED_ADMIN_PASSWORD,
      process.env.SEED_TEACHER_PASSWORD,
      process.env.SEED_STUDENT_PASSWORD,
    ];
    if (demoPasswords.some((password) => !password || password.length < 12)) {
      throw new Error('Set SEED_ADMIN_PASSWORD, SEED_TEACHER_PASSWORD and SEED_STUDENT_PASSWORD to unique passwords of at least 12 characters in server/.env before resetting.');
    }

    await runMigrations({ includeBootstrap: false });

    console.log('Clearing existing data (explicit CONFIRM_RESET=YES confirmed)...');
    const tables = [
      'certificates',
      'assessment_attempt_answers',
      'assessment_attempts',
      'assessment_questions',
      'course_assessments',
      'assessment_results',
      'assessments',
      'sync_events',
      'learning_materials',
      'content_translations',
      'user_progress',
      'enrollments',
      'lessons',
      'courses',
      'revoked_tokens',
      'users',
    ];

    await db.transaction(async (tx) => {
      for (const table of tables) {
        await tx.query(`DELETE FROM ${table}`);
        try {
          await tx.query('DELETE FROM sqlite_sequence WHERE name = $1', [table]);
        } catch (_err) {
          // sqlite_sequence may not exist yet if no AUTOINCREMENT rows were inserted
        }
      }
    });

    const adminHash = await bcrypt.hash(process.env.SEED_ADMIN_PASSWORD, 12);
    const teacherHash = await bcrypt.hash(process.env.SEED_TEACHER_PASSWORD, 12);
    const studentHash = await bcrypt.hash(process.env.SEED_STUDENT_PASSWORD, 12);

    const users = [
      ['admin', 'admin@school.local', adminHash, 'System Administrator', 'admin', 'Rural High School', null],
      ['teacher_priya', 'priya@school.local', teacherHash, 'Priya Sharma', 'teacher', 'Rural High School', null],
      ['teacher_ravi', 'ravi@school.local', teacherHash, 'Ravi Kumar', 'teacher', 'Rural High School', null],
      ['student_rahul', 'rahul@school.local', studentHash, 'Rahul Singh', 'student', 'Rural High School', '10th Grade'],
      ['student_anita', 'anita@school.local', studentHash, 'Anita Desai', 'student', 'Rural High School', '9th Grade'],
      ['student_vikram', 'vikram@school.local', studentHash, 'Vikram Patel', 'student', 'Rural High School', '10th Grade'],
    ];

    for (const u of users) {
      await db.query(
        `INSERT INTO users (username, email, password_hash, full_name, role, school_name, class_grade)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        u
      );
    }

    await seedSafe();

    const rahul = await db.get("SELECT id FROM users WHERE username = 'student_rahul'");
    const firstCourse = await db.get('SELECT id FROM courses ORDER BY id ASC LIMIT 1');
    if (rahul && firstCourse) {
      await db.query(
        'INSERT INTO enrollments (user_id, course_id) VALUES ($1, $2)',
        [rahul.id, firstCourse.id]
      );
      const firstLesson = await db.get(
        'SELECT id FROM lessons WHERE course_id = $1 ORDER BY order_index ASC LIMIT 1',
        [firstCourse.id]
      );
      if (firstLesson) {
        await db.query(
          `INSERT INTO user_progress (user_id, course_id, lesson_id, completion_status, progress_percentage, time_spent_minutes, completed_at)
           VALUES ($1, $2, $3, 'completed', 100, 15, CURRENT_TIMESTAMP)`,
          [rahul.id, firstCourse.id, firstLesson.id]
        );
      }
    }

    console.log('Database reset and seeded successfully!');
  } catch (error) {
    console.error('Error seeding data:', error.message);
    process.exitCode = 1;
  } finally {
    await db.close();
  }
};

if (require.main === module) {
  seedData();
}

module.exports = { seedData };
