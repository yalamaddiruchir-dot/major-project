import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { CircularProgress, Box } from '@mui/material';

import { LanguageProvider } from './context/LanguageContext';
import { PreferencesProvider } from './context/PreferencesContext';
import { ToastProvider } from './context/ToastContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { OfflineProvider } from './context/OfflineContext';

import Navbar from './components/Navbar';
import BackgroundAnimation from './components/BackgroundAnimation';

import Home from './pages/Home';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import Courses from './pages/Courses';
import CourseDetail from './pages/CourseDetail';
import LessonDetail from './pages/LessonDetail';
import AssessmentsPage from './pages/AssessmentsPage';
import CertificatesPage from './pages/CertificatesPage';
import VerifyCertificate from './pages/VerifyCertificate';
import OfflineManager from './pages/OfflineManager';
import AdminDashboard from './pages/AdminDashboard';
import TeacherDashboard from './pages/TeacherDashboard';
import AddCourse from './pages/AddCourse';
import EditCourse from './pages/EditCourse';
import AddLesson from './pages/AddLesson';
import EditLesson from './pages/EditLesson';
import AddUser from './pages/AddUser';
import Profile from './pages/Profile';
import './App.css';

// Accessible WCAG 2.2 AA Theme (>= 4.5:1 contrast across surfaces & text)
const theme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main: '#1e40af',
      dark: '#1e3a8a',
      light: '#3b82f6',
      contrastText: '#ffffff',
    },
    secondary: {
      main: '#0369a1',
      contrastText: '#ffffff',
    },
    success: {
      main: '#047857',
      contrastText: '#ffffff',
    },
    warning: {
      main: '#b45309',
      contrastText: '#ffffff',
    },
    error: {
      main: '#b91c1c',
      contrastText: '#ffffff',
    },
    background: {
      default: '#f4f7fb',
      paper: '#ffffff',
    },
    text: {
      primary: '#0f172a',
      secondary: '#334155',
    },
  },
  typography: {
    fontFamily: [
      'Noto Sans',
      'Noto Sans Telugu',
      'Noto Sans Devanagari',
      '-apple-system',
      'BlinkMacSystemFont',
      '"Segoe UI"',
      'Roboto',
      'Arial',
      'sans-serif',
    ].join(','),
  },
  shape: {
    borderRadius: 10,
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          minHeight: 38,
        },
      },
    },
  },
});

const PrivateRoute = ({ children, allowedRoles = [] }) => {
  const { isAuthenticated, user, loading } = useAuth();

  if (loading) {
    return (
      <Box className="loading-container" role="status" aria-label="Loading session">
        <CircularProgress />
      </Box>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (allowedRoles.length > 0 && !allowedRoles.includes(user.role)) {
    return <Navigate to="/dashboard" replace />;
  }

  return children;
};

export const AppRoutes = () => (
  <div className="App">
    <BackgroundAnimation />
    <Navbar />
    <main id="main-content" className="main-content" tabIndex={-1}>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/verify-certificate" element={<VerifyCertificate />} />

        <Route
          path="/dashboard"
          element={
            <PrivateRoute>
              <Dashboard />
            </PrivateRoute>
          }
        />
        <Route
          path="/courses"
          element={
            <PrivateRoute>
              <Courses />
            </PrivateRoute>
          }
        />
        <Route
          path="/courses/:id"
          element={
            <PrivateRoute>
              <CourseDetail />
            </PrivateRoute>
          }
        />
        <Route
          path="/lessons/:id"
          element={
            <PrivateRoute>
              <LessonDetail />
            </PrivateRoute>
          }
        />
        <Route
          path="/assessments"
          element={
            <PrivateRoute>
              <AssessmentsPage />
            </PrivateRoute>
          }
        />
        <Route
          path="/certificates"
          element={
            <PrivateRoute>
              <CertificatesPage />
            </PrivateRoute>
          }
        />
        <Route
          path="/offline"
          element={
            <PrivateRoute>
              <OfflineManager />
            </PrivateRoute>
          }
        />
        <Route
          path="/profile"
          element={
            <PrivateRoute>
              <Profile />
            </PrivateRoute>
          }
        />

        {/* Admin Routes (including /admin/users and /admin/courses!) */}
        <Route
          path="/admin"
          element={
            <PrivateRoute allowedRoles={['admin']}>
              <AdminDashboard />
            </PrivateRoute>
          }
        />
        <Route
          path="/admin/users"
          element={
            <PrivateRoute allowedRoles={['admin']}>
              <AdminDashboard />
            </PrivateRoute>
          }
        />
        <Route
          path="/admin/courses"
          element={
            <PrivateRoute allowedRoles={['admin']}>
              <AdminDashboard />
            </PrivateRoute>
          }
        />
        <Route
          path="/admin/users/add"
          element={
            <PrivateRoute allowedRoles={['admin']}>
              <AddUser />
            </PrivateRoute>
          }
        />

        {/* Teacher & Admin Content Authoring Routes */}
        <Route
          path="/teacher"
          element={
            <PrivateRoute allowedRoles={['teacher', 'admin']}>
              <TeacherDashboard />
            </PrivateRoute>
          }
        />
        <Route
          path="/teacher/courses/add"
          element={
            <PrivateRoute allowedRoles={['teacher', 'admin']}>
              <AddCourse />
            </PrivateRoute>
          }
        />
        <Route
          path="/teacher/courses/edit/:id"
          element={
            <PrivateRoute allowedRoles={['teacher', 'admin']}>
              <EditCourse />
            </PrivateRoute>
          }
        />
        <Route
          path="/teacher/courses/:courseId/lessons/add"
          element={
            <PrivateRoute allowedRoles={['teacher', 'admin']}>
              <AddLesson />
            </PrivateRoute>
          }
        />
        <Route
          path="/teacher/lessons/edit/:id"
          element={
            <PrivateRoute allowedRoles={['teacher', 'admin']}>
              <EditLesson />
            </PrivateRoute>
          }
        />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </main>
  </div>
);

export const AppProviders = ({ children }) => (
  <ThemeProvider theme={theme}>
    <CssBaseline />
    <LanguageProvider>
      <PreferencesProvider>
        <ToastProvider>
          <AuthProvider>
            <OfflineProvider>{children}</OfflineProvider>
          </AuthProvider>
        </ToastProvider>
      </PreferencesProvider>
    </LanguageProvider>
  </ThemeProvider>
);

function App() {
  return (
    <AppProviders>
      <Router future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <AppRoutes />
      </Router>
    </AppProviders>
  );
}

export default App;
