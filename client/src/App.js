import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import './App.css';
import { AuthProvider } from './context/AuthContext';
import PrivateRoute from './components/PrivateRoute';
import Navbar from './components/Navbar';
import Home from './pages/Home';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import Courses from './pages/Courses';
import CourseDetail from './pages/CourseDetail';
import LessonDetail from './pages/LessonDetail';
import TeacherDashboard from './pages/TeacherDashboard';
import Profile from './pages/Profile';
import AdminDashboard from './pages/AdminDashboard';
import AddUser from './pages/AddUser';
import AddCourse from './pages/AddCourse';
import EditCourse from './pages/EditCourse';

import AddLesson from './pages/AddLesson';
import EditLesson from './pages/EditLesson';
import BackgroundAnimation from './components/BackgroundAnimation';

const theme = createTheme({
  palette: {
    primary: {
      main: '#1976d2',
    },
    secondary: {
      main: '#dc004e',
    },
    background: {
      default: '#f5f5f5',
    },
  },
  typography: {
    fontFamily: 'Roboto, Arial, sans-serif',
  },
});

function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <AuthProvider>
        <Router>
          <div className="App">
            <BackgroundAnimation />
            <Navbar />
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<Register />} />
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
                path="/teacher"
                element={
                  <PrivateRoute allowedRoles={['teacher', 'admin']}>
                    <TeacherDashboard />
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
              <Route
                path="/admin"
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
              <Route
                path="/admin/courses/add"
                element={
                  <PrivateRoute allowedRoles={['admin', 'teacher']}>
                    <AddCourse />
                  </PrivateRoute>
                }
              />
              <Route
                path="/admin/courses/edit/:id"
                element={
                  <PrivateRoute allowedRoles={['admin', 'teacher']}>
                    <EditCourse />
                  </PrivateRoute>
                }
              />
              <Route
                path="/admin/courses/:courseId/lessons/add"
                element={
                  <PrivateRoute allowedRoles={['admin', 'teacher']}>
                    <AddLesson />
                  </PrivateRoute>
                }
              />
              <Route
                path="/admin/lessons/edit/:id"
                element={
                  <PrivateRoute allowedRoles={['admin', 'teacher']}>
                    <EditLesson />
                  </PrivateRoute>
                }
              />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </div>
        </Router>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;

