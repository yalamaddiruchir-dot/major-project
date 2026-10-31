const db = require('./connection');
const { runMigrations } = require('./migrate');

async function checkAdmin() {
  try {
    await runMigrations({ silent: true });
    const result = await db.query(
      "SELECT id, username, email, role FROM users WHERE role = 'admin' ORDER BY id LIMIT 1"
    );
    if (!result.rows.length) {
      console.log('No administrator account exists. Create one with create-admin.js or seed_safe.js.');
    } else {
      console.log('Administrator account found:', result.rows[0]);
      console.log('This diagnostic does not read, print, or reset passwords.');
    }
  } catch (error) {
    console.error('Unable to check administrator account:', error.message);
    process.exitCode = 1;
  } finally {
    await db.close();
  }
}

checkAdmin();
