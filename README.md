# Digital Learning Platform for Rural Schools

An offline-capable, multilingual (**English**, **Telugu / తెలుగు**, **Hindi / हिन्दी**), low-bandwidth-optimized full-stack learning platform engineered for rural government and community schools running on intermittent 2G/3G connectivity, school LAN servers, and shared low-end Android tablets or lab PCs.

---

## Core Capabilities

### 1. Role-Based Learning & Administration
- **Public Student Registration**: Self-registration strictly creates `student` accounts (`POST /api/auth/register` never permits privilege escalation to `teacher` or `admin`).
- **Administrator Portal (`/admin`)**: Create and manage authorized `teacher` and `student` accounts, activate/deactivate accounts, oversee all courses, view platform-wide analytics, monitor `/api/health`, and create/verify/restore atomic SQLite backups.
- **Teacher Portal (`/teacher`)**: Create and edit courses and lessons in English, Telugu, and Hindi; upload validated PDFs, audio narrations, worksheets, images, and videos; author timed course assessments; review student submissions and add feedback; track weak subjects and individual learner progress.
- **Student Portal (`/dashboard`, `/courses`, `/assessments`, `/certificates`, `/offline`)**: Browse and filter courses, enroll, study text/audio/PDF/image/video lessons online or offline, take timed assessments, track progress, and earn downloadable verifiable PDF completion certificates.

### 2. True Offline-First Architecture (Part B)
- **Service Worker (`client/public/service-worker.js`)**: Caches the React application shell, bundled Indic fonts (`@fontsource/noto-sans-telugu`, `@fontsource/noto-sans-devanagari`), and static assets so the app boots with zero internet access.
- **User-Isolated IndexedDB (`client/src/services/offlineDb.js`)**: Stores full course bundles, lessons, teacher materials, and binary media blobs (`PDF`, `MP3`/`WAV`/`OGG`, images, and optional downloadable `MP4`/`WebM` videos) scoped by `userId` (`${userId}:${entityId}`).
- **Offline Progress Queue & Monotonic Sync**: Lesson progress and media timestamps recorded offline are queued with unique `idempotency_key` tokens and automatically synchronized via `POST /api/progress/sync` upon reconnection with exponential backoff and server-side monotonic conflict resolution (`completed` status is never downgraded by stale updates).
- **Shared-Device Privacy**: Logging out (`AuthContext.logout`) revokes the server JWT (`revoked_tokens`), clears private Service Worker caches, revokes active `Blob:` URLs, and purges the user's IndexedDB records so shared classroom tablets never leak learner data.

### 3. Complete Assessment, Analytics & Certificate System (Part C)
- **Timed Assessments**: Supports Multiple Choice (`mcq`), True/False (`true_false`), and Short Answer (`short_answer`) questions with marks, passing percentage, time limits, schedule windows, max retake limits, auto-saved drafts, server-side grading (correct answers are never exposed in pre-submission payloads), configurable answer review (`after_submission`, `after_pass`, `never`), and teacher feedback.
- **Real Database-Driven Analytics**: Enrolled student counts, course completion rates, individual student progress comparisons, average assessment marks, 14-day learning activity timelines, and automatic weak-subject detection (`< 60%` average score or `< 50%` completion).
- **Verifiable PDF Certificates**: Generated dynamically via `pdfkit` strictly after a student completes 100% of active lessons and passes all required course assessments. Includes student name, course title, institution name, completion date, unique certificate code (`DLP-YYYY-XXXXXXXX`), and public verification at `/verify-certificate` (`GET /api/certificates/verify/:code`).

### 4. Rural-School & Accessibility Optimizations (Part D)
- **Multilingual UI & Content (`en`, `te`, `hi`)**: Instant language switching across navigation, forms, dashboards, and learning views with persistent preference. Teachers can author genuine Telugu and Hindi translations per course/lesson; untranslated lessons fall back transparently to their original authored language without machine-invented text.
- **Low-Bandwidth / Data-Saver Mode**: Disables decorative animations, automatically transcodes uploaded classroom videos via FFmpeg (`server/utils/transcoder.js`) into both compact `360p` low-bandwidth MP4s and `240p`/`480p` Adaptive Bitrate HLS (`.m3u8`/`.ts`) streams, mirrors external HTTPS Open Educational Resources onto the school server (`POST /api/upload/import-remote`), defers media preloading (`preload="none"`), paginates catalog responses, and gzips API/static responses.
- **Audio Learning Player (`AudioLessonPlayer.js`)**: Accessible HTML5 narration player with `0.75x`, `1x`, `1.25x`, `1.5x`, `1.75x`, and `2x` playback speed control, 10-second skip controls, resume position tracking, and one-click offline audio caching.
- **WCAG 2.2 AA Accessibility**: Skip-to-main-content link, high-contrast color tokens, visible `:focus-visible` outlines, keyboard-operable controls, ARIA labels/live regions, `100%` / `115%` / `130%` text scaling, and automated `jest-axe` verification.

---

## Technology Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, React Router v7, Material UI v5, Vite 8, Axios, IndexedDB + Service Worker PWA |
| Indic Fonts | Bundled offline `@fontsource/noto-sans-telugu` & `@fontsource/noto-sans-devanagari` |
| Backend | Node.js (>= 18.0), Express 4, `helmet`, `express-rate-limit`, `express-validator`, `compression`, `multer`, `pdfkit`, `@ffmpeg-installer/ffmpeg` |
| Database | SQLite 3-tier adapter (`node:sqlite` native on Node >= 22.5, `sqlite3`, or universal pure-WASM `sql.js` on Node 18/20+ with zero C++ toolchain required) |
| Testing | Vitest, Supertest, React Testing Library, `fake-indexeddb`, `jest-axe`, `@playwright/test` + `@axe-core/playwright` + `@sparticuz/chromium` |

---

## Quick Start (Local Development)

### Prerequisites
- **Node.js `>= 18.0.0`** (`Node >= 22.5` uses built-in `node:sqlite`; `Node 18/20` automatically uses the bundled pure-WebAssembly `sql.js` fallback — zero C++ compiler required)
- **npm `>= 9.0.0`**

### 1. Install Dependencies
```bash
npm run install-all
```

### 2. Configure Environment Variables
Copy the provided templates and set strong secrets (never commit `.env` files):
```bash
cp server/env.template server/.env
cp client/.env.example client/.env
```
Generate a strong `JWT_SECRET` (minimum 32 characters):
```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```
Edit `server/.env` and set `JWT_SECRET`, plus optional initial bootstrap credentials (`BOOTSTRAP_ADMIN_PASSWORD`, `BOOTSTRAP_TEACHER_PASSWORD`, minimum 12 characters each) if initializing a fresh database.

### 3. Run Non-Destructive Migrations & Safe Curriculum Seed
```bash
npm run migrate
npm run seed
```
- `npm run migrate` applies schema upgrades idempotently and **never deletes existing users, courses, progress, or certificates**.
- `npm run seed` (`seed_safe.js`) populates starter multilingual courses (`en` / `te` / `hi`) and sample assessments **only if the database currently has zero courses**.
- Need to create or promote an administrator interactively on an existing database? Run:
  ```bash
  cd server && npm run create-admin
  ```

### 4. Start Development Servers
```bash
npm run dev
```
- Backend API: `http://localhost:5000` (`GET /api/health`)
- React Dev Server: `http://localhost:3000` (proxies `/api` and `/uploads` to `:5000`)

---

## Production Build & Single-Server Execution

Build the optimized React bundle and serve both the frontend PWA and backend API from Express:
```bash
npm run build
cd server
NODE_ENV=production npm start
```
See [`DEPLOYMENT.md`](./DEPLOYMENT.md) for reverse-proxy TLS setup, school LAN deployment, backups, health checks, and rollback instructions, and [`SECURITY.md`](./SECURITY.md) for complete security controls.

---

## Running Automated Tests

```bash
# Run all Backend (Unit + DB/Backup/Concurrency + Integration + Security) AND Frontend (i18n/WCAG + Offline IndexedDB + Live Full-Stack) suites:
npm test

# Backend suites individually:
npm run test:server
cd server && npm run test:unit
cd server && npm run test:db
cd server && npm run test:integration
cd server && npm run test:security

# Frontend suites individually:
npm run test:client

# Browser E2E suite (requires Chromium installed via `npx playwright install chromium`):
npm run test:e2e
```

---

## Database Backup & Restore CLI

```bash
# Create an atomic timestamped SQLite snapshot in server/backups/
cd server && npm run backup

# Verify SQLite header & PRAGMA integrity_check on a backup file
cd server && npm run verify-backup -- <backup-filename.sqlite>

# Restore from a validated backup (automatically saves a pre-restore safety snapshot first)
cd server && npm run restore -- <backup-filename.sqlite>
```
