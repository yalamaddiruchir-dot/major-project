const fs = require('fs');
const path = require('path');
const db = require('./connection');

async function migrate() {
  try {
    console.log('Starting database migration...');

    const schemaPath = path.join(__dirname, 'schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf8');

    // Split by semicolon and execute each statement
    const statements = schema
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0);

    for (const statement of statements) {
      try {
        await db.query(statement);
      } catch (error) {
        // Ignore "already exists" errors
        if (!error.message.includes('already exists') && !error.message.includes('duplicate column')) {
          throw error;
        }
      }
    }

    console.log('Database migration completed successfully!');

    // Insert sample data
    await insertSampleData();

    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

async function insertSampleData() {
  try {
    console.log('Inserting sample data...');

    // Check if data already exists
    const userCheck = await db.query('SELECT COUNT(*) as count FROM users');
    if (userCheck.rows[0].count > 0) {
      console.log('Sample data already exists, skipping...');
      return;
    }

    const bcrypt = require('bcryptjs');
    const adminPassword = process.env.BOOTSTRAP_ADMIN_PASSWORD;
    if (!adminPassword || adminPassword.length < 12) {
      console.warn('No admin account was created. Set BOOTSTRAP_ADMIN_PASSWORD (12+ characters) in server/.env and run the migration again, or use database/create-admin.js.');
      return;
    }
    const adminUsername = process.env.BOOTSTRAP_ADMIN_USERNAME || 'admin';
    const adminEmail = process.env.BOOTSTRAP_ADMIN_EMAIL || 'admin@school.local';
    const adminName = process.env.BOOTSTRAP_ADMIN_NAME || 'Platform Administrator';
    const adminHash = await bcrypt.hash(adminPassword, 12);
    const adminResult = await db.query(
      `INSERT INTO users (username, email, password_hash, full_name, role, school_name)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [adminUsername, adminEmail, adminHash, adminName, 'admin', 'Rural School']
    );
    const adminId = adminResult.lastID;
    const teacherPassword = process.env.BOOTSTRAP_TEACHER_PASSWORD;
    let teacherId = adminId;
    if (teacherPassword && teacherPassword.length >= 12) {
      const teacherHash = await bcrypt.hash(teacherPassword, 12);
      const teacherResult = await db.query(
        `INSERT INTO users (username, email, password_hash, full_name, role, school_name)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [process.env.BOOTSTRAP_TEACHER_USERNAME || 'teacher1', process.env.BOOTSTRAP_TEACHER_EMAIL || 'teacher@school.local', teacherHash, process.env.BOOTSTRAP_TEACHER_NAME || 'Demo Teacher', 'teacher', 'Rural School']
      );
      teacherId = teacherResult.lastID;
    }

    // Insert sample courses
    const course1 = await db.query(
      `INSERT INTO courses (title, description, category, language, created_by) 
       VALUES (?, ?, ?, ?, ?)`,
      [
        'Digital Literacy Basics',
        'Learn the fundamentals of using computers and digital devices',
        'Digital Literacy',
        'en',
        adminId
      ]
    );
    const course1Id = course1.lastID; // Accessing lastID from the result object

    const course2 = await db.query(
      `INSERT INTO courses (title, description, category, language, created_by) 
       VALUES (?, ?, ?, ?, ?)`,
      [
        'Computer Fundamentals',
        'Introduction to computer hardware and software',
        'Computer Science',
        'en',
        teacherId
      ]
    );
    const course2Id = course2.lastID; // Accessing lastID from the result object

    // Insert sample lessons
    await db.query(
      `INSERT INTO lessons (course_id, title, description, content, lesson_type, order_index, duration_minutes) 
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        course1Id,
        'Introduction to Computers',
        'Learn what computers are and how they work',
        'Computers are electronic devices that process data. They consist of hardware (physical components) and software (programs).',
        'text',
        1,
        15
      ]
    );

    await db.query(
      `INSERT INTO lessons (course_id, title, description, content, lesson_type, order_index, duration_minutes) 
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        course1Id,
        'Using a Mouse and Keyboard',
        'Master the basic input devices',
        'The mouse and keyboard are primary input devices. Practice clicking, typing, and navigating.',
        'interactive',
        2,
        20
      ]
    );

    await db.query(
      `INSERT INTO lessons (course_id, title, description, content, lesson_type, order_index, duration_minutes) 
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        course2Id,
        'Computer Hardware',
        'Understanding computer components',
        'Learn about CPU, RAM, storage, and other hardware components.',
        'text',
        1,
        15
      ]
    );

    console.log('Sample data inserted successfully!');
  } catch (error) {
    console.error('Error inserting sample data:', error.message);
    throw error;
  }
}

if (require.main === module) {
  migrate();
}

module.exports = { migrate };
