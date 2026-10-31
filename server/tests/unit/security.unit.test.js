const {
  sanitizeText,
  escapeLikePattern,
  normalizeLanguageCode,
  isAllowedMediaUrl,
  issueMediaToken,
  verifyMediaToken,
} = require('../../utils/security');
const { prepareSqlAndParams } = require('../../database/connection');

describe('Backend Security & SQL Adapter Unit Tests', () => {
  const originalSecret = process.env.JWT_SECRET;

  beforeAll(() => {
    process.env.JWT_SECRET = 'unit-test-jwt-secret-key-at-least-32-chars-long-2026';
  });

  afterAll(() => {
    process.env.JWT_SECRET = originalSecret;
  });

  test('sanitizeText removes null bytes and control characters while preserving Telugu and Hindi Unicode', () => {
    const raw = '  \x00\x07డిజిటల్ విద్య - डिजिटल शिक्षा\x1F  ';
    const cleaned = sanitizeText(raw, 200);
    expect(cleaned).toBe('డిజిటల్ విద్య - डिजिटल शिक्षा');
  });

  test('escapeLikePattern escapes SQLite wildcard characters % and _', () => {
    expect(escapeLikePattern('100%_test\\name')).toBe('100\\%\\_test\\\\name');
  });

  test('normalizeLanguageCode normalizes legacy and native language names to ISO codes', () => {
    expect(normalizeLanguageCode('english')).toBe('en');
    expect(normalizeLanguageCode('Telugu')).toBe('te');
    expect(normalizeLanguageCode('తెలుగు')).toBe('te');
    expect(normalizeLanguageCode('Hindi')).toBe('hi');
    expect(normalizeLanguageCode('हिन्दी')).toBe('hi');
    expect(normalizeLanguageCode('unknown-lang')).toBe('en');
  });

  test('isAllowedMediaUrl permits safe internal uploads & HTTPS media while blocking XSS/traversal/HTTP schemes', () => {
    expect(isAllowedMediaUrl('/uploads/pdfs/lesson-1.pdf', { type: 'pdf' })).toBe(true);
    expect(isAllowedMediaUrl('/uploads/audio/narration.mp3', { type: 'audio' })).toBe(true);
    expect(isAllowedMediaUrl('https://www.youtube.com/embed/dQw4w9WgXcQ', { type: 'video' })).toBe(true);

    // Malicious / unsafe URLs blocked
    expect(isAllowedMediaUrl('javascript:alert(1)', { type: 'any' })).toBe(false);
    expect(isAllowedMediaUrl('data:text/html,<script>alert(1)</script>', { type: 'any' })).toBe(false);
    expect(isAllowedMediaUrl('/uploads/pdfs/../../etc/passwd', { type: 'pdf' })).toBe(false);
    expect(isAllowedMediaUrl('http://insecure.example.com/file.pdf', { type: 'pdf' })).toBe(false);
  });

  test('issueMediaToken and verifyMediaToken enforce path binding, user ID, and expiration', () => {
    const pathA = '/api/files/pdfs/math-notes.pdf';
    const pathB = '/api/files/pdfs/other-secret.pdf';

    const validToken = issueMediaToken(42, pathA, 300);
    expect(validToken).toBeTruthy();

    // Valid verification
    expect(verifyMediaToken(validToken, pathA)).toEqual({ userId: 42 });

    // Path mismatch rejected
    expect(verifyMediaToken(validToken, pathB)).toBeNull();

    // Tampered userId rejected
    const tampered = validToken.replace(/^42\./, '99.');
    expect(verifyMediaToken(tampered, pathA)).toBeNull();

    // Expired token rejected
    const expiredToken = issueMediaToken(42, pathA, -10);
    expect(verifyMediaToken(expiredToken, pathA)).toBeNull();
  });

  test('prepareSqlAndParams converts numbered $1..$N placeholders safely without touching string literals', () => {
    const { executableSql, values } = prepareSqlAndParams(
      "SELECT * FROM courses WHERE title = '$1 literal' AND category = $1 AND is_active = $2 AND created_by = $1",
      ['Science', true]
    );
    expect(executableSql).toBe(
      "SELECT * FROM courses WHERE title = '$1 literal' AND category = ? AND is_active = ? AND created_by = ?"
    );
    expect(values).toEqual(['Science', 1, 'Science']);
  });
});
