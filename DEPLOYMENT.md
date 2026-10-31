# Production Deployment, Backup & Rollback Guide

This guide covers deploying the **Digital Learning Platform for Rural Schools** either on a cloud Linux VM (Ubuntu/Debian) or on an on-premise **Rural School LAN Server** (e.g., Raspberry Pi 4/5 or school lab desktop serving classrooms over Wi-Fi without reliable internet).

---

## 1. System Requirements

- **Runtime**: Node.js `v22.5.0` LTS or newer (`v22.22+` recommended for built-in `node:sqlite` support)
- **OS**: Ubuntu 22.04/24.04 LTS, Debian 12+, or Windows 10/11 (for local school lab hosts)
- **RAM / Disk**: Minimum 1 GB RAM; 10 GB+ SSD/SD storage (scales with uploaded video/audio lessons and backups)
- **Network**: Works over HTTPS on public domains or over `http://<school-server-lan-ip>:5000` inside an offline school LAN (note: browsers enable Service Workers on `https://` origins and `http://localhost`)

---

## 2. Environment Configuration

Create `server/.env` from `server/env.template`:

```ini
NODE_ENV=production
HOST=0.0.0.0
PORT=5000

# REQUIRED: Generate with `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`
JWT_SECRET=<64-hex-character-random-secret>
JWT_EXPIRES_IN=7d

# Comma-separated allowed origins (strictly enforced in production)
CORS_ORIGINS=https://learning.yourschool.edu.in

# Persistent storage paths (outside ephemeral container layers)
DB_PATH=/var/lib/rural-learning/digital_learning.sqlite
BACKUP_DIR=/var/backups/rural-learning
MAX_BACKUPS=20

# Institution branding printed on PDF certificates
INSTITUTION_NAME=Government Rural High School Digital Learning Initiative
SCHOOL_NAME=ZPHS Rural Campus

# Upload limits
MAX_UPLOAD_MB=100
```

Protect `server/.env` permissions on Linux:
```bash
chmod 600 server/.env
```

---

## 3. Initial Build & Non-Destructive Database Initialization

```bash
# 1. Install dependencies
npm run install-all

# 2. Initialize/upgrade SQLite schema without touching existing data
npm run migrate

# 3. Optional: Seed starter multilingual courses if database is empty
npm run seed

# 4. Create the initial school administrator account interactively
cd server && ADMIN_USERNAME=schooladmin ADMIN_EMAIL=admin@yourschool.edu.in ADMIN_PASSWORD='<Strong12+CharPass>' npm run create-admin && cd ..

# 5. Compile production React PWA bundle into client/build/
npm run build
```

When `NODE_ENV=production`, `server/index.js` automatically serves:
- Static hashed assets from `client/build/static` (`max-age=365d, immutable`)
- `client/build/service-worker.js` and `index.html` with `Cache-Control: no-cache, no-store, must-revalidate` so browsers always pick up new deployments cleanly
- Protected learning media via `/api/files/:category/:filename` (with HTTP `206 Partial Content` byte-range streaming for audio/video)

---

## 4. Running Under `systemd` (Linux Production Service)

Create `/etc/systemd/system/rural-learning.service`:

```ini
[Unit]
Description=Digital Learning Platform for Rural Schools
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/opt/major-project/server
EnvironmentFile=/opt/major-project/server/.env
ExecStart=/usr/bin/node --no-warnings index.js
Restart=on-failure
RestartSec=5
KillSignal=SIGTERM
TimeoutStopSec=20

[Install]
WantedBy=multi-user.target
```

Enable and start:
```bash
sudo systemctl daemon-reload
sudo systemctl enable --now rural-learning
sudo systemctl status rural-learning
```

The server handles `SIGTERM` and `SIGINT` gracefully—draining active HTTP requests, checkpointing the SQLite WAL journal (`PRAGMA wal_checkpoint(TRUNCATE)`), and closing the database handle cleanly.

---

## 5. HTTPS Reverse Proxy (Nginx)

HTTPS is strongly recommended in production (and required by browsers for Service Worker offline caching on non-localhost hosts):

```nginx
server {
    listen 443 ssl http2;
    server_name learning.yourschool.edu.in;

    ssl_certificate     /etc/letsencrypt/live/learning.yourschool.edu.in/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/learning.yourschool.edu.in/privkey.pem;

    client_max_body_size 105M;

    location / {
        proxy_pass http://127.0.0.1:5000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

---

## 6. Automated Backups, Verification & Restore

### Daily Cron Backup
Add a daily cron job (`/etc/cron.d/rural-learning-backup`):
```cron
30 2 * * * www-data cd /opt/major-project/server && /usr/bin/node --no-warnings scripts/backup-cli.js backup scheduled-daily >> /var/log/rural-learning-backup.log 2>&1
```
- Backups use SQLite's online `VACUUM INTO` snapshot command—safe even while students are actively taking quizzes.
- Old snapshots beyond `MAX_BACKUPS` (default `20`) are rotated automatically.
- Also copy `/opt/major-project/server/uploads/` to off-host storage (`rsync` or object storage) alongside SQLite snapshots.

### Verify a Backup
```bash
cd /opt/major-project/server
npm run verify-backup -- backup-2026-10-30T02-30-00-000Z-scheduled-daily.sqlite
```

### Restore a Backup
```bash
sudo systemctl stop rural-learning
cd /opt/major-project/server
npm run restore -- backup-2026-10-30T02-30-00-000Z-scheduled-daily.sqlite
sudo systemctl start rural-learning
```
*(Administrators can also create, verify, and restore snapshots from **Admin Dashboard -> Backups & Health**.)*

---

## 7. Health Monitoring & Safe Rollback Procedure

### Health Endpoint
Poll `GET /api/health` from uptime monitors:
- Returns `200 OK` with `{ status: "OK", database: "connected", uptimeSeconds, timestamp }` when SQLite responds cleanly, or `503` if degraded.

### Safe Upgrade & Rollback Procedure
1. **Pre-upgrade snapshot**:
   ```bash
   cd server && npm run backup -- pre-release
   ```
2. **Deploy new release**:
   ```bash
   git pull
   npm run install-all
   npm run migrate
   npm run build
   sudo systemctl restart rural-learning
   curl -fsS http://127.0.0.1:5000/api/health
   ```
3. **Rollback (if health check or smoke test fails)**:
   ```bash
   sudo systemctl stop rural-learning
   git checkout <previous-known-good-tag-or-commit>
   npm run install-all
   npm run build
   cd server && npm run restore -- <pre-release-backup-filename.sqlite> && cd ..
   sudo systemctl start rural-learning
   ```
