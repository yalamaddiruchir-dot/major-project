// @ts-check
const fs = require('fs');
const path = require('path');
const { defineConfig, devices } = require('@playwright/test');

const resolveSparticuzLaunchOptions = () => {
  if (process.env.PLAYWRIGHT_USE_SYSTEM_BROWSER === 'true') {
    return {};
  }
  try {
    process.env.AWS_LAMBDA_JS_RUNTIME = process.env.AWS_LAMBDA_JS_RUNTIME || 'nodejs22.x';
    // eslint-disable-next-line global-require
    const pkg = require('@sparticuz/chromium');
    const chromiumBin = pkg.default || pkg;
    const chromiumPath = '/tmp/chromium';
    const libDir = '/tmp/al2023/lib';
    const currentLd = process.env.LD_LIBRARY_PATH || '';
    const mergedLd = currentLd ? `${libDir}:${currentLd}` : libDir;

    return {
      executablePath: fs.existsSync(chromiumPath) ? chromiumPath : undefined,
      args: (chromiumBin.args || []).filter((arg) => arg !== '--single-process'),
      env: {
        ...process.env,
        LD_LIBRARY_PATH: mergedLd,
      },
    };
  } catch (_err) {
    return {};
  }
};

// Pre-extract synchronously via helper check if needed before workers spawn
try {
  process.env.AWS_LAMBDA_JS_RUNTIME = process.env.AWS_LAMBDA_JS_RUNTIME || 'nodejs22.x';
} catch (_e) {
  // ignore
}

const e2eTmpDir = '/tmp/dlp-playwright-e2e';
const port = Number(process.env.E2E_PORT || 5177);

module.exports = defineConfig({
  testDir: './e2e',
  globalSetup: require.resolve('./e2e/global-setup.js'),
  timeout: 60000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    headless: true,
    launchOptions: {
      ...resolveSparticuzLaunchOptions(),
      executablePath: '/tmp/chromium',
    },
  },
  projects: [
    {
      name: 'Desktop Chromium (1280x800)',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 800 },
      },
    },
    {
      name: 'School Tablet (768x1024)',
      use: {
        ...devices['iPad Mini'],
        defaultBrowserType: 'chromium',
        viewport: { width: 768, height: 1024 },
      },
    },
    {
      name: 'Low-End Rural Android Mobile (360x640)',
      use: {
        ...devices['Pixel 5'],
        viewport: { width: 360, height: 640 },
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
  webServer: {
    command: `node --no-warnings index.js`,
    cwd: path.resolve(__dirname, 'server'),
    url: `http://127.0.0.1:${port}/api/health`,
    reuseExistingServer: false,
    timeout: 30000,
    env: {
      ...process.env,
      NODE_ENV: 'production',
      HOST: '127.0.0.1',
      PORT: String(port),
      DB_PATH: path.join(e2eTmpDir, 'e2e.sqlite'),
      BACKUP_DIR: path.join(e2eTmpDir, 'backups'),
      CORS_ORIGINS: `http://127.0.0.1:${port},http://localhost:${port}`,
      JWT_SECRET: 'playwright-e2e-production-secret-key-minimum-32-chars-2026',
      BOOTSTRAP_ADMIN_PASSWORD: 'AdminPassword123!',
      BOOTSTRAP_TEACHER_PASSWORD: 'TeacherPassword123!',
    },
  },
});
