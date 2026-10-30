const dotenv = require('dotenv');
const path = require('path');
const bcrypt = require('bcryptjs');
const db = require('./connection');
dotenv.config({ path: path.join(__dirname, '../.env') });

async function createAdmin() {
  try {
    const { ADMIN_USERNAME, ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_FULL_NAME } = process.env;
    if (!ADMIN_USERNAME || !ADMIN_EMAIL || !ADMIN_FULL_NAME || !ADMIN_PASSWORD || ADMIN_PASSWORD.length < 12) {
      throw new Error('Set ADMIN_USERNAME, ADMIN_EMAIL, ADMIN_FULL_NAME and a unique ADMIN_PASSWORD of at least 12 characters in server/.env.');
    }
    const existing = await db.query("SELECT id FROM users WHERE role = 'admin' LIMIT 1");
    if (existing.rows.length) throw new Error('An administrator already exists. No account was changed.');
    const duplicate = await db.query('SELECT id FROM users WHERE LOWER(username) = LOWER($1) OR LOWER(email) = LOWER($2)', [ADMIN_USERNAME, ADMIN_EMAIL.toLowerCase()]);
    if (duplicate.rows.length) throw new Error('The selected username or email is already in use.');
    const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 12);
    await db.query(
      'INSERT INTO users (username, email, password_hash, full_name, role, school_name) VALUES ($1, $2, $3, $4, $5, $6)',
      [ADMIN_USERNAME, ADMIN_EMAIL.toLowerCase(), passwordHash, ADMIN_FULL_NAME, 'admin', process.env.SCHOOL_NAME || null]
    );
    console.log(`Administrator account '${ADMIN_USERNAME}' created successfully.`);
  } catch (error) {
    console.error('Admin bootstrap failed:', error.message);
    process.exitCode = 1;
  } finally {
    db.db.close();
  }
}

createAdmin();
