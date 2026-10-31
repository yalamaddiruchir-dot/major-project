const db = require('./connection');
const { runMigrations } = require('./migrate');

const EXTRA_COURSES = [
  {
    title: 'Internet Basics',
    description: 'Learn how to use the internet safely and effectively.',
    category: 'Digital Literacy',
    language: 'en',
    lessons: [
      {
        title: 'What is the Internet?',
        content:
          'The Internet is a global network of computers connected together to share knowledge, educational resources, and communication tools.',
        content_type: 'text',
        order_index: 1,
        duration: 20,
      },
      {
        title: 'Using a Web Browser',
        content:
          'A web browser opens websites via URLs. Use the address bar, bookmarks, and navigation buttons safely.',
        content_type: 'text',
        order_index: 2,
        duration: 25,
      },
    ],
  },
  {
    title: 'Email Communication',
    description: 'Learn to compose, send, and manage emails responsibly.',
    category: 'Digital Communication',
    language: 'en',
    lessons: [
      {
        title: 'Composing Professional Emails',
        content:
          'Include a clear subject line, respectful salutation, concise body text, and proper sign-off.',
        content_type: 'text',
        order_index: 1,
        duration: 20,
      },
    ],
  },
];

async function addMoreCourses() {
  try {
    await runMigrations({ silent: true });
    const staff = await db.query(
      "SELECT id FROM users WHERE role IN ('teacher', 'admin') ORDER BY role DESC, id ASC LIMIT 1"
    );
    if (!staff.rows.length) {
      throw new Error('No teacher or admin account found. Run npm run seed in server/ first.');
    }
    const creatorId = staff.rows[0].id;

    for (const c of EXTRA_COURSES) {
      const exists = await db.query('SELECT id FROM courses WHERE title = ?', [c.title]);
      if (exists.rows.length) {
        console.log(`Skipping existing course: ${c.title}`);
        continue;
      }
      const inserted = await db.query(
        'INSERT INTO courses (title, description, category, language, created_by) VALUES (?, ?, ?, ?, ?)',
        [c.title, c.description, c.category, c.language, creatorId]
      );
      const courseId = inserted.lastID;
      for (const l of c.lessons) {
        await db.query(
          'INSERT INTO lessons (course_id, title, content, content_type, order_index, duration) VALUES (?, ?, ?, ?, ?, ?)',
          [courseId, l.title, l.content, l.content_type, l.order_index, l.duration]
        );
      }
      console.log(`Added course: ${c.title}`);
    }
  } catch (error) {
    console.error('Error adding extra courses:', error.message);
    process.exitCode = 1;
  } finally {
    await db.close();
  }
}

addMoreCourses();
