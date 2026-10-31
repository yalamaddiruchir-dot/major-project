const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

module.exports = async () => {
  // 1. Ensure @sparticuz/chromium binary + shared libs (al2023) are extracted when running in headless Linux CI/containers
  try {
    process.env.AWS_LAMBDA_JS_RUNTIME = process.env.AWS_LAMBDA_JS_RUNTIME || 'nodejs22.x';
    // eslint-disable-next-line global-require
    const pkg = require('@sparticuz/chromium');
    const chromiumBin = pkg.default || pkg;
    if (!fs.existsSync('/tmp/al2023/lib/libnspr4.so')) {
      fs.rmSync('/tmp/chromium', { force: true });
    }
    await chromiumBin.executablePath();
  } catch (_err) {
    // System browser will be used if @sparticuz/chromium is not installed
  }

  // 2. Prepare isolated production-like SQLite database for Playwright E2E server
  const e2eTmpDir = '/tmp/dlp-playwright-e2e';
  fs.rmSync(e2eTmpDir, { recursive: true, force: true });
  fs.mkdirSync(e2eTmpDir, { recursive: true });

  const serverDir = path.resolve(__dirname, '../server');
  const env = {
    ...process.env,
    NODE_ENV: 'production',
    DB_PATH: path.join(e2eTmpDir, 'e2e.sqlite'),
    BACKUP_DIR: path.join(e2eTmpDir, 'backups'),
    JWT_SECRET: 'playwright-e2e-production-secret-key-minimum-32-chars-2026',
    BOOTSTRAP_ADMIN_PASSWORD: 'AdminPassword123!',
    BOOTSTRAP_TEACHER_PASSWORD: 'TeacherPassword123!',
  };

  const mig = spawnSync(process.execPath, ['--no-warnings', 'database/migrate.js'], {
    cwd: serverDir,
    env,
    encoding: 'utf8',
  });
  if (mig.status !== 0) {
    throw new Error(`E2E DB migration failed: ${mig.stderr || mig.stdout}`);
  }

  const seed = spawnSync(process.execPath, ['--no-warnings', 'database/seed_safe.js'], {
    cwd: serverDir,
    env,
    encoding: 'utf8',
  });
  if (seed.status !== 0) {
    throw new Error(`E2E DB seed failed: ${seed.stderr || seed.stdout}`);
  }
};
