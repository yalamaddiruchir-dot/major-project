# Digital Learning Platform for Rural Schools

> An offline-capable digital learning solution designed to bridge the digital divide in rural education.

## 🚀 Quick Start

### Option 1: One-Click Start (Recommended)
1.  **Daily Use (Safe)**: Double-click **`start.bat`**.
    *   Starts the server and client.
    *   *Preserves your data.*
2.  **Fresh Install (Reset)**: Double-click **`install_and_reset.bat`**.
    *   Installs dependencies and **Resets** the database.
    *   *⚠️ WARNING: Deletes all data!*

### Option 2: Manual Terminal Setup
```bash
# 1. Install Dependencies
npm run install-all

# 2. Copy server/env.template to server/.env and set JWT_SECRET + ADMIN_* values
# 3. Initialize database and create the first administrator
cd server
npm run migrate
# Run only when the database has no administrator yet
npm run create-admin
cd ..

# 4. Run Application
npm run dev
```

### Option 3: Moving to a New Computer?
1.  **Copy**: Copy the entire project folder to the new machine.
    *   *(Tip: You can delete the `node_modules` folders to make the copy faster, but keep `server/database` to save your data!)*
2.  **Install**: Run **`install_dependencies.bat`** on the new machine.
3.  **Run**: Double-click **`start.bat`**.

---

## 🔐 Account setup

There are no universal default administrator credentials. Copy `server/env.template` to `server/.env`, set a unique `JWT_SECRET` (at least 32 random characters), and configure `ADMIN_USERNAME`, `ADMIN_EMAIL`, `ADMIN_FULL_NAME`, and a unique `ADMIN_PASSWORD` of at least 12 characters. Run `npm run migrate` and then `npm run create-admin` from the `server` directory. Administrators can create teacher accounts from the protected Admin dashboard.

The included SQLite file has anonymized demo identities while preserving the course catalogue and sample progress records. The bundled `admin` account uses a one-time password supplied with this project copy. Other demo teacher/student accounts are disabled; create fresh accounts from the Admin dashboard. Change the admin password before exposing the application to a network.

## 🌟 Key Features

*   **Role-Based Access**: Specialized dashboards for Students, Teachers, and Admins.
*   **Interactive Learning**: Multimedia lessons (Video/Text), progress tracking, and server-graded lesson assessments.
*   **Course Management**: Create, edit, and organize courses and modules.
*   **Offline Support**: Previously opened text lessons are cached on the device and progress updates queue locally until the connection returns. Videos still require connectivity unless already available in the browser cache.
*   **Modern UI**: Glassmorphism design, education-themed animations, and responsiveness.

## 🛠️ Technology Stack

*   **Frontend**: React 18, Material-UI, Axios, CSS3 Animations.
*   **Backend**: Node.js, Express.js, JWT Authentication.
*   **Database**: SQLite (File-based, zero-config).

## 📂 Project Structure

```
digital-learning-platform/
├── client/                 # React Frontend application
│   ├── src/pages/          # Application views
│   └── public/             # Static assets
├── server/                 # Node.js Backend
│   ├── database/           # SQLite database & seeding scripts
│   └── routes/             # API Endpoints
├── start.bat               # Safe startup script
├── install_and_reset.bat   # Installation & Reset script
└── README.md              # This file
```

## ⚙️ Configuration (Advanced)

The backend is configured via `server/.env`. Copy `server/env.template` and replace every example secret with a unique value before running the application. Do not use a sample JWT secret in production.

## ❓ Troubleshooting

*   **Port in Use**: If ports 3000/5000 are taken, the app will prompt to use others.
*   **Database Locked**: Close any external SQLite viewers while the app is running.
*   **White Screen**: Check if the backend server is running (port 5000).


## Updated setup and security notes

1. Install dependencies from the repository root with `npm run install-all`.
2. Copy `server/env.template` to `server/.env`, set a unique `JWT_SECRET` (at least 32 characters), and configure the first admin credentials described above.
3. Start the app with `npm run dev` from the repository root.
4. The SQLite database defaults to `server/database/digital_learning.sqlite`; set `DB_PATH` to use another file.
5. Public registration always creates a student account. Admins create teacher accounts through the protected user-management workflow.
6. Teachers can manage lessons only in courses they own. Students must enroll before opening lesson content or recording progress.
7. Video uploads are restricted by extension/MIME type and capped at 250 MB. This is a basic validation layer, not a substitute for malware scanning or content inspection on a public deployment.
8. The service worker caches the public app shell and same-origin static build assets. It deliberately does not cache private API responses or uploaded videos. Full offline video downloads and service-worker background sync are not implemented; queued progress syncs when the app is open and the browser reports a connection.

### Important database safety

The seed command is destructive by design and now requires explicit confirmation: `CONFIRM_RESET=YES npm run seed` from the server directory, after setting unique `SEED_ADMIN_PASSWORD`, `SEED_TEACHER_PASSWORD`, and `SEED_STUDENT_PASSWORD` values (each at least 12 characters) in `server/.env`. Back up the SQLite database before migrations or resets. Do not publish a database containing real student records.
