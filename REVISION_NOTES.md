# Revision Notes — October 30, 2026

This revision keeps the existing React, Material UI, Express and SQLite architecture while correcting defects and completing several incomplete workflows.

## Fixed

- Reworked the SQLite query adapter so numbered parameters are converted in occurrence order, repeated placeholders bind correctly, and `INSERT`/`UPDATE ... RETURNING` statements return rows.
- Replaced PostgreSQL-only `ILIKE` syntax with SQLite-compatible case-insensitive matching and added explicit aliases for aggregate counts.
- Made public registration student-only; added an administrator-only account creation endpoint and first-admin bootstrap script.
- Added teacher ownership checks for course/lesson operations and enrollment checks for lesson access and student progress.
- Restricted teacher progress reporting to courses owned by that teacher.
- Removed unsafe HTML injection from lesson rendering.
- Added video URL allow-listing, upload extension/MIME checks, basic file-signature validation, and a 250 MB upload cap.
- Added server-side progress validation, monotonic progress updates, and active-lesson/course consistency checks.
- Added a lesson assessment workflow: teachers/admins can author multiple-choice questions, students submit option indexes, and the server grades answers without exposing answer keys in lesson responses.
- Corrected the lesson player’s YouTube URL handling and made course curriculum links unavailable until enrollment (except for the owning teacher/admin).

## Offline improvements

- The service worker caches the public application shell and same-origin static assets, while deliberately avoiding private API responses and uploaded media.
- Previously opened lesson text and safe assessment choices are cached per signed-in user in browser storage.
- Progress updates made offline are queued locally and synchronized when the app is open and connectivity returns.
- Video downloads, first-time offline lesson access, and service-worker background synchronization are not implemented.

## Setup and data safety

- `server/env.template` no longer supplies a usable default JWT secret or administrator password. Configure a unique `JWT_SECRET` (32+ characters) and bootstrap credentials before a fresh install.
- `npm run create-admin` creates the first administrator only when no administrator exists.
- The destructive seed script now requires `CONFIRM_RESET=YES` and three distinct strong demo passwords.
- The bundled SQLite demo identities have been anonymized. Existing sample courses, lessons, enrollments and progress records were retained. The bundled admin account has a one-time password supplied with this project copy; other demo teacher/student passwords are disabled.
- SQLite foreign keys, busy timeout, WAL mode and normal synchronous mode are configured on connection.

## Verification performed

- All backend JavaScript files passed `node --check`.
- All frontend JavaScript/JSX files passed TypeScript JSX parsing.
- SQLite integration checks passed against a temporary copy of the database for numbered/repeated parameters, `RETURNING`, course/lesson inserts, enrollment, progress updates, counts and assessment results.
- A full `npm run build` and live browser/API test were not completed because dependency installation did not finish in the revision environment. Run `npm run install-all`, then `npm run build` and the application tests on the target machine before deployment.

## Production follow-up

Before public deployment, configure HTTPS and a strong JWT secret, use a trusted CORS origin, back up the database, add login/upload rate limiting and malware scanning, review media access policy, and run end-to-end tests with representative student/teacher/admin accounts.
