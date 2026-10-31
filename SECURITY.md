# Security Architecture & Hardening Documentation

This document details the security controls implemented across authentication, authorization, media delivery, file uploads, database access, and shared classroom device storage.

---

## 1. Authentication, Session Revocation & Brute-Force Defense

- **Password Hashing**: Passwords are hashed using `bcryptjs` (`12` salt rounds). Plaintext passwords are never logged or returned.
- **Strong Secret Enforcement**: In `production`, server startup refuses to boot if `JWT_SECRET` is missing, shorter than 32 characters, or set to a placeholder template string.
- **Immediate Logout Revocation & Password Rotation**:
  - Every issued JWT embeds a unique `jti` claim and the user's `token_version`.
  - `POST /api/auth/logout` records the token's `jti` into `revoked_tokens`, immediately invalidating that token before natural expiration.
  - Changing a password (`PUT /api/auth/password`) or deactivating a user increments `users.token_version`, immediately invalidating all previously issued tokens across other devices.
- **Account Lockout & Rate Limiting**:
  - Dedicated IP rate limiters (`express-rate-limit`) protect `/api/auth/login`, `/api/auth/register`, `/api/upload`, and general `/api/*` endpoints.
  - Repeated failed login attempts increment `users.failed_login_attempts` and lock the account (`423 Locked` via `locked_until` for 15 minutes after 5 consecutive failures) to block credential stuffing even across rotating IPs.

---

## 2. Strict Role-Based Access Control (RBAC) & Privilege Escalation Prevention

- **Student-Only Public Registration**: `POST /api/auth/register` hardcodes `role = 'student'` on insert and rejects attempts to self-assign `teacher` or `admin` roles.
- **Administrator-Managed Teachers**: Only authenticated `admin` accounts can create `teacher` or `admin` users (`POST /api/users`) or change user roles (`PUT /api/users/:id`). Self-demotion and deletion of the last active administrator are blocked.
- **IDOR & Ownership Enforcement**:
  - Students can view/modify only their own profile, enrollments, progress, quiz attempts, and certificates.
  - Teachers can modify or delete only courses, lessons, materials, and exams they own (`created_by = req.user.id`), while administrators have institution-wide oversight.
  - Pre-submission assessment payloads (`GET /api/assessments/exams/:id`, `POST /api/assessments/exams/:id/start`) strip `correct_answer` and `explanation` on the server so students cannot inspect browser network responses to cheat.

---

## 3. File Upload Validation & Authorized Media Streaming

- **Magic-Byte Signature Inspection (`server/routes/upload.js`)**: Uploaded files are validated against extension allowlists, MIME allowlists, size caps, **and binary magic-byte headers** (`%PDF-` for PDFs, PNG/JPEG/WebP headers for images, `ID3`/MPEG sync/`RIFF`/`OggS`/`ftyp` for audio and MP4/WebM video). Executable files (`MZ`), HTML/SVG scripts, and polyglot spoofs are rejected and unlinked immediately.
- **Randomized Storage Names & Path Traversal Protection**: Uploaded filenames are replaced with `crypto.randomUUID()` + validated canonical extensions. Serving routes resolve paths with `path.resolve` and verify the resolved path remains strictly inside `server/uploads/` before touching the filesystem.
- **Authorized Media Access (`/api/files` & `/uploads`)**:
  - Uploaded learning materials are **not** exposed via unauthenticated `express.static`.
  - Every media request requires either a valid `Authorization: Bearer <jwt>` header or a short-lived HMAC-SHA256 `media_token` bound to `(userId, filePath, expiration)` using `crypto.timingSafeEqual`, plus enrollment/ownership verification in SQLite.
  - Supports HTTP `Range` (`206 Partial Content`) for smooth low-bandwidth `<audio>` and `<video>` seeking, with `X-Content-Type-Options: nosniff` and `Cross-Origin-Resource-Policy: same-origin`.

---

## 4. SQL Injection, XSS, CSRF & HTTP Header Hardening

- **Parameterized SQL**: All SQLite queries use bound parameters (`?` / `$1..$N`) via `server/database/connection.js`, with wildcard escaping (`escapeLikePattern`) on `LIKE` search filters.
- **XSS & URL Scheme Sanitization**:
  - React escapes rendered text by default; no untrusted user HTML is injected via `dangerouslySetInnerHTML`.
  - Server-side `sanitizeText` strips null bytes and control characters while preserving Telugu (`\u0C00–\u0C7F`) and Hindi Devanagari (`\u0900–\u097F`) scripts.
  - External lesson media URLs are restricted by `isAllowedMediaUrl` to `https://` media URLs or safe internal `/uploads/...` paths—blocking `javascript:`, `vbscript:`, and `data:text/html` payloads.
- **CSRF Posture**: All state-mutating APIs authenticate exclusively via explicit `Authorization: Bearer <jwt>` headers (never ambient browser cookies), eliminating cross-site cookie-riding CSRF vectors, reinforced by explicit `CORS_ORIGINS` allowlisting in production.
- **HTTP Security Headers (`helmet`)**: Enforces `Content-Security-Policy`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`, `Referrer-Policy: strict-origin-when-cross-origin`, and strict payload size limits (`1mb` JSON body limit).

---

## 5. Shared Rural Classroom Tablet Privacy

In rural schools, multiple students frequently share a single tablet or lab PC:
- Offline courses, lessons, media blobs, and queued progress updates in IndexedDB are keyed by `userId`.
- Clicking **Logout** clears `localStorage` auth tokens, posts `CLEAR_PRIVATE_CACHES` to the Service Worker, revokes active in-memory `Blob:` URLs, and purges that user's private IndexedDB caches so the next student cannot view prior private records.

---

## 6. Dependency Audit Status (`0` Vulnerabilities Across All Packages)

- **Root Workspace (`npm audit`)**: **0 vulnerabilities**
- **Backend Server (`cd server && npm audit`)**: **0 vulnerabilities** (both production and dev dependencies)
- **Frontend Client (`cd client && npm audit`)**: **0 vulnerabilities** (both production and dev dependencies — upgraded from legacy `react-scripts` to Vite 8 + Vitest 5 + React Router 7.18.5)
- **Remote Media Import SSRF Protection (`POST /api/upload/import-remote`)**: Strictly enforces HTTPS, blocks embedded credentials, resolves DNS prior to fetch, rejects loopback/private/link-local/metadata IPv4 & IPv6 ranges (`isPrivateOrReservedIp`), enforces category byte caps, and verifies file magic-byte headers before storage.
