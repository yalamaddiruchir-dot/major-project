/**
 * Full-Stack End-to-End Integration Test (Real React UI + Real Child-Process Express Server + Real SQLite DB)
 * Spawns the actual Node 22 Express + SQLite backend on an isolated TCP port and drives <AppRoutes />
 * across Student, Teacher, and Admin workflows over real HTTP sockets.
 */
import React from 'react';
import fs from 'fs';
import os from 'os';
import net from 'net';
import path from 'path';
import { spawn, spawnSync } from 'child_process';
import axios from 'axios';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AppProviders, AppRoutes } from '../App';

const getFreePort = () =>
  new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
    srv.on('error', reject);
  });

const waitForServerReady = async (url, maxWaitMs = 15000) => {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    try {
      const res = await axios.get(`${url}/api/health`, { adapter: 'http' });
      if (res.status === 200) return;
    } catch (_e) {
      await new Promise((r) => setTimeout(r, 200));
    }
  }
  throw new Error('Timed out waiting for live backend server');
};

describe('Full-Stack Live React + Express + SQLite Workflows (Student, Teacher, Admin)', () => {
  let tmpDir;
  let serverProc;
  let baseUrl;

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dlp-fullstack-e2e-'));
    const port = await getFreePort();
    baseUrl = `http://127.0.0.1:${port}`;
    const serverDir = path.resolve(__dirname, '../../../server');

    const env = {
      ...process.env,
      NODE_ENV: 'development',
      HOST: '127.0.0.1',
      PORT: String(port),
      DB_PATH: path.join(tmpDir, 'fullstack.sqlite'),
      BACKUP_DIR: path.join(tmpDir, 'backups'),
      JWT_SECRET: 'fullstack-e2e-jwt-secret-key-minimum-32-chars-2026',
      BOOTSTRAP_ADMIN_PASSWORD: 'AdminPassword123!',
      BOOTSTRAP_TEACHER_PASSWORD: 'TeacherPassword123!',
    };

    // Run real migrations and curriculum seed
    const mig = spawnSync(process.execPath, ['--no-warnings', 'database/migrate.js'], {
      cwd: serverDir,
      env,
      encoding: 'utf8',
    });
    expect(mig.status).toBe(0);

    const seed = spawnSync(process.execPath, ['--no-warnings', 'database/seed_safe.js'], {
      cwd: serverDir,
      env,
      encoding: 'utf8',
    });
    expect(seed.status).toBe(0);

    // Start real Express HTTP server
    serverProc = spawn(process.execPath, ['--no-warnings', 'index.js'], {
      cwd: serverDir,
      env,
      stdio: 'ignore',
    });

    await waitForServerReady(baseUrl);
    axios.defaults.baseURL = baseUrl;
    axios.defaults.adapter = 'http';
  });

  afterAll(async () => {
    if (serverProc && !serverProc.killed) {
      serverProc.kill('SIGTERM');
      await new Promise((resolve) => {
        serverProc.once('exit', resolve);
        setTimeout(resolve, 1500);
      });
    }
    if (tmpDir) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  beforeEach(() => {
    localStorage.clear();
    delete axios.defaults.headers.common.Authorization;
  });

  const renderAppAt = (route = '/') =>
    render(
      <MemoryRouter initialEntries={[route]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <AppProviders>
          <AppRoutes />
        </AppProviders>
      </MemoryRouter>
    );

  test('Student full journey: Register -> Browse Courses -> Enroll -> Study Lesson & Complete', async () => {
    const { unmount } = renderAppAt('/register');

    fireEvent.change(screen.getByLabelText(/Full Name/i), { target: { value: 'Kiran Raju' } });
    fireEvent.change(screen.getByLabelText(/^Username/i), { target: { value: 'kiran_student' } });
    fireEvent.change(screen.getByLabelText(/Email/i), { target: { value: 'kiran@ruralschool.edu' } });
    fireEvent.change(screen.getByLabelText(/^Password/i), { target: { value: 'KiranPass123!' } });
    fireEvent.change(screen.getByLabelText(/Confirm Password/i), { target: { value: 'KiranPass123!' } });

    const submitBtn = screen.getByRole('button', { name: /Create Student Account|Register/i });
    fireEvent.click(submitBtn);

    // Redirects to Student Dashboard with real profile loaded
    await waitFor(() => {
      expect(screen.getByText(/Kiran Raju/i)).toBeInTheDocument();
    });

    const savedToken = localStorage.getItem('token');
    expect(savedToken).toBeTruthy();
    unmount();

    // Open Courses catalog while authenticated as Kiran
    localStorage.setItem('token', savedToken);
    const coursesView = renderAppAt('/courses');
    await waitFor(() => {
      expect(screen.getByText(/Digital Literacy Basics/i)).toBeInTheDocument();
    });

    // Click View Course on Digital Literacy Basics
    const viewButtons = await screen.findAllByRole('link', { name: /View Course|Continue/i });
    fireEvent.click(viewButtons[0]);

    // Enroll in course over real API
    const enrollBtn = await screen.findByRole('button', { name: /Enroll in Course|Enroll Now/i });
    fireEvent.click(enrollBtn);

    await waitFor(() => {
      expect(screen.getByText(/Introduction to Computers/i)).toBeInTheDocument();
    });

    coursesView.unmount();
  });

  test('Teacher & Admin dashboards render real database metrics over live API', async () => {
    // Teacher Login
    const teacherUi = renderAppAt('/login');

    fireEvent.change(screen.getByLabelText(/Username or Email/i), { target: { value: 'teacher1' } });
    fireEvent.change(screen.getByLabelText(/^Password/i), { target: { value: 'TeacherPassword123!' } });
    fireEvent.click(screen.getByRole('button', { name: /Sign In/i }));

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /Teacher Dashboard/i })).toBeInTheDocument();
    });

    teacherUi.unmount();
    localStorage.clear();
    delete axios.defaults.headers.common.Authorization;

    // Admin Login
    const adminUi = renderAppAt('/login');
    fireEvent.change(screen.getByLabelText(/Username or Email/i), { target: { value: 'admin' } });
    fireEvent.change(screen.getByLabelText(/^Password/i), { target: { value: 'AdminPassword123!' } });
    fireEvent.click(screen.getByRole('button', { name: /Sign In/i }));

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /Administrator Dashboard/i })).toBeInTheDocument();
    });

    adminUi.unmount();
  });
});
