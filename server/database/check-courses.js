const db = require('./connection');
const { seedSafe } = require('./seed_safe');

async function checkAndCreateCourses() {
  try {
    const result = await db.query('SELECT COUNT(*) AS count FROM courses');
    const courseCount = Number(result.rows[0]?.count || 0);
    console.log(`Found ${courseCount} courses in database.`);

    if (courseCount === 0) {
      console.log('No courses found. Running safe non-destructive seeder...');
      await seedSafe();
    } else {
      const courses = await db.query('SELECT id, title, category, language FROM courses ORDER BY id');
      courses.rows.forEach((course) => {
        console.log(`  - [${course.id}] ${course.title} (${course.category || 'General'}, ${course.language})`);
      });
    }
  } catch (error) {
    console.error('Error checking courses:', error.message);
    process.exitCode = 1;
  } finally {
    await db.close();
  }
}

checkAndCreateCourses();
