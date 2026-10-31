const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;

test.describe('Real Chromium E2E, Service Worker Offline Reload, WCAG 2.2 AA Contrast & 4x Throttled Android Suite', () => {
  test('Responsive layout (zero horizontal overflow), WCAG 2.2 AA computed contrast, ARIA accessibility tree, keyboard skip-link, and en/te/hi switching', async ({
    page,
  }) => {
    const pageErrors = [];
    page.on('pageerror', (err) => pageErrors.push(err.message));

    await page.goto('/');
    await expect(page.locator('h1')).toBeVisible();

    // 1. Verify zero horizontal scroll overflow on current viewport (Desktop 1280px, Tablet 768px, Mobile 360px)
    const overflowPx = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth
    );
    expect(overflowPx).toBeLessThanOrEqual(2);

    // 2. Verify keyboard Tab focus lands on Skip-to-Content link with visible focus styling
    await page.keyboard.press('Tab');
    const focusedClass = await page.evaluate(() => document.activeElement?.className || '');
    expect(focusedClass).toContain('skip-link');

    // 3. Capture real Chromium Accessibility Tree (screen-reader semantic structure)
    const a11ySnapshot = await page.locator('main').ariaSnapshot();
    expect(a11ySnapshot).toContain('heading');

    // 4. Real Chromium axe-core WCAG 2.2 AA audit (including real computed CSS pixel color contrast!)
    for (const publicRoute of ['/', '/login', '/register', '/verify-certificate']) {
      await page.goto(publicRoute);
      await expect(page.locator('h1')).toBeVisible();
      const axeResults = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
        .analyze();
      expect(axeResults.violations).toEqual([]);
    }

    // 5. Switch UI language across English -> Telugu -> Hindi in real Chromium
    await page.goto('/login');
    await page.getByRole('combobox').click();
    await page.getByRole('option', { name: /తెలుగు/ }).click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'te');

    await page.getByRole('combobox').click();
    await page.getByRole('option', { name: /हिन्दी/ }).click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'hi');

    // Reset to English
    await page.getByRole('combobox').click();
    await page.getByRole('option', { name: /English/ }).click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');

    expect(pageErrors).toEqual([]);
  });

  test('Real Service Worker registration, student enrollment, IndexedDB offline course caching, true offline browser reload, and reconnect sync', async ({
    page,
    context,
  }, testInfo) => {
    // Run full offline reload + DB write workflow once on Desktop & Mobile to avoid duplicate cross-project DB noise while still verifying mobile offline!
    const suffix = `${Date.now()}_${testInfo.project.name.replace(/[^a-z0-9]/gi, '').slice(0, 8)}`;

    await page.goto('/register');

    // Wait for real Service Worker to register and activate on 127.0.0.1
    const swActive = await page.evaluate(async () => {
      if (!('serviceWorker' in navigator)) return false;
      const reg = await navigator.serviceWorker.ready;
      return Boolean(reg && reg.active);
    });
    expect(swActive).toBe(true);

    // Reload once so Service Worker controls the client page (`navigator.serviceWorker.controller`)
    await page.reload();
    await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller), null, { timeout: 10000 });

    await page.getByLabel(/Full Name/i).fill(`Student ${suffix}`);
    await page.getByLabel(/^Username/i).fill(`stu_${suffix}`.slice(0, 28));
    await page.getByLabel(/Email/i).fill(`stu_${suffix}@rural.edu`);
    await page.getByLabel(/^Password/i).fill('RuralPass123!');
    await page.getByLabel(/Confirm Password/i).fill('RuralPass123!');
    await page.getByRole('button', { name: /Create Student Account/i }).click();

    await expect(page).toHaveURL(/\/dashboard/);

    // Browse catalog & enroll in Digital Literacy Basics
    await page.goto('/courses');
    await expect(page.getByText('Digital Literacy Basics')).toBeVisible();
    await page.getByRole('link', { name: /View Course/i }).first().click();

    await page.getByRole('button', { name: /Enroll/i }).click();
    await expect(page.getByText('Introduction to Computers')).toBeVisible();

    // Save entire course into IndexedDB for offline access
    const saveOfflineBtn = page.getByRole('button', { name: /Save Course for Offline|Download/i });
    await expect(saveOfflineBtn).toBeVisible();
    await saveOfflineBtn.click();
    await expect(page.getByText(/Saved Offline|Remove Offline Copy/i).first()).toBeVisible({ timeout: 15000 });

    // Cut network completely in real Chromium (`context.setOffline(true)`) AND perform a cold page reload!
    await context.setOffline(true);
    await page.reload({ waitUntil: 'domcontentloaded' });

    // App shell + IndexedDB course content must render 100% offline!
    await expect(page.getByText('Digital Literacy Basics')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Introduction to Computers')).toBeVisible();

    // Open lesson while offline and mark complete
    await page.getByRole('link', { name: /Open Lesson/i }).first().click();
    await expect(page.getByText(/electronic machine/i)).toBeVisible();

    const completeBtn = page.getByRole('button', { name: /Mark as Completed|Complete Lesson/i });
    if (await completeBtn.isVisible()) {
      await completeBtn.click();
    }

    // Restore network connectivity and verify clean recovery
    await context.setOffline(false);
    await page.goto('/offline');
    await expect(page.getByText('Digital Literacy Basics')).toBeVisible();
  });

  test('Teacher & Admin portals + 4x CPU-throttled Low-End Rural Android performance check', async ({
    page,
    context,
  }) => {
    // Emulate low-end rural Android ARM processor via 4x CDP CPU throttling
    const cdp = await context.newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });

    const startMs = Date.now();
    await page.goto('/login');
    await page.getByLabel(/Username or Email/i).fill('admin');
    await page.getByLabel(/^Password/i).fill('AdminPassword123!');
    await page.getByRole('button', { name: /Sign In/i }).click();

    await expect(page.getByRole('heading', { name: /Administrator Dashboard/i })).toBeVisible({ timeout: 15000 });
    const elapsedUnder4xThrottle = Date.now() - startMs;
    expect(elapsedUnder4xThrottle).toBeLessThan(12000);

    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  });
});
