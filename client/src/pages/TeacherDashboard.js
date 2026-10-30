import React, { useState, useEffect } from 'react';
import {
  Container,
  Typography,
  Box,
  Grid,
  Card,
  CardContent,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  CircularProgress,
  Chip,
  Tabs,
  Tab,
  LinearProgress,
} from '@mui/material';
import {
  People,
  School,
  TrendingUp,
  CheckCircle,
} from '@mui/icons-material';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';

const TeacherDashboard = () => {
  const { user } = useAuth();
  const [tabValue, setTabValue] = useState(0);
  const [students, setStudents] = useState([]);
  const [progress, setProgress] = useState([]);
  // eslint-disable-next-line no-unused-vars
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    totalStudents: 0,
    totalCourses: 0,
    activeStudents: 0,
    completedLessons: 0,
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [studentsRes, coursesRes, progressRes] = await Promise.all([
        axios.get('/api/users', { params: { role: 'student' } }),
        axios.get('/api/courses'),
        axios.get('/api/progress/students'),
      ]);

      setStudents(studentsRes.data.users);
      setCourses(coursesRes.data.courses);
      setProgress(progressRes.data.progress);

      // Calculate stats
      const activeStudents = new Set(progressRes.data.progress.map((p) => p.user_id)).size;
      const completedLessons = progressRes.data.progress.filter(
        (p) => p.completion_status === 'completed'
      ).length;

      setStats({
        totalStudents: studentsRes.data.users.length,
        totalCourses: coursesRes.data.courses.length,
        activeStudents,
        completedLessons,
      });
    } catch (error) {
      console.error('Error fetching teacher dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStudentProgress = (studentId) => {
    const studentProgress = progress.filter((p) => p.user_id === studentId);
    const completed = studentProgress.filter((p) => p.completion_status === 'completed').length;
    return { total: studentProgress.length, completed };
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="60vh">
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Container maxWidth="lg" sx={{ py: 8 }}>
      <Box sx={{ mb: 6 }}>
        <Typography variant="h4" component="h1" gutterBottom fontWeight="bold" className="gradient-text">
          Teacher Dashboard
        </Typography>
        <Typography variant="body1" color="text.secondary" sx={{ fontSize: '1.1rem' }}>
          Welcome, {user?.full_name}. Monitor student progress and course performance.
        </Typography>
      </Box>

      {/* Statistics Cards */}
      <Grid container spacing={4} sx={{ mb: 6 }}>
        <Grid item xs={12} sm={6} md={3}>
          <Card className="glass-panel glow-card" sx={{ height: '100%', p: 2 }}>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                <Box sx={{ p: 1, borderRadius: '50%', bgcolor: 'rgba(102, 126, 234, 0.1)', mr: 2 }}>
                  <People sx={{ color: 'primary.main' }} />
                </Box>
                <Typography color="text.secondary" fontWeight="bold">Total Students</Typography>
              </Box>
              <Typography variant="h4" fontWeight="bold">{stats.totalStudents}</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card className="glass-panel glow-card" sx={{ height: '100%', p: 2 }}>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                <Box sx={{ p: 1, borderRadius: '50%', bgcolor: 'rgba(118, 75, 162, 0.1)', mr: 2 }}>
                  <School sx={{ color: 'secondary.main' }} />
                </Box>
                <Typography color="text.secondary" fontWeight="bold">Total Courses</Typography>
              </Box>
              <Typography variant="h4" fontWeight="bold">{stats.totalCourses}</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card className="glass-panel glow-card" sx={{ height: '100%', p: 2 }}>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                <Box sx={{ p: 1, borderRadius: '50%', bgcolor: 'rgba(0, 210, 255, 0.1)', mr: 2 }}>
                  <TrendingUp sx={{ color: '#00d2ff' }} />
                </Box>
                <Typography color="text.secondary" fontWeight="bold">Active Students</Typography>
              </Box>
              <Typography variant="h4" fontWeight="bold">{stats.activeStudents}</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card className="glass-panel glow-card" sx={{ height: '100%', p: 2 }}>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                <Box sx={{ p: 1, borderRadius: '50%', bgcolor: 'rgba(76, 175, 80, 0.1)', mr: 2 }}>
                  <CheckCircle sx={{ color: 'success.main' }} />
                </Box>
                <Typography color="text.secondary" fontWeight="bold" sx={{ fontSize: '0.9rem' }}>Completed Lessons</Typography>
              </Box>
              <Typography variant="h4" fontWeight="bold">{stats.completedLessons}</Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Tabs */}
      <Paper sx={{ mb: 4, borderRadius: 2, overflow: 'hidden' }} className="glass-panel">
        <Tabs
          value={tabValue}
          onChange={(e, newValue) => setTabValue(newValue)}
          indicatorColor="primary"
          textColor="primary"
          sx={{ '& .MuiTab-root': { fontWeight: 'bold' } }}
        >
          <Tab label="Students Directory" />
          <Tab label="Progress Overview" />
        </Tabs>
      </Paper>

      {/* Students Tab */}
      {tabValue === 0 && (
        <TableContainer component={Paper} className="glass-panel" sx={{ borderRadius: 2, overflow: 'hidden' }}>
          <Table>
            <TableHead sx={{ bgcolor: 'rgba(102, 126, 234, 0.05)' }}>
              <TableRow>
                <TableCell sx={{ fontWeight: 'bold' }}>Name</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>Username</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>School</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>Class</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>Progress</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>Status</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {students.map((student) => {
                const studentProgress = getStudentProgress(student.id);
                return (
                  <TableRow key={student.id} hover>
                    <TableCell sx={{ fontWeight: 500 }}>{student.full_name}</TableCell>
                    <TableCell>{student.username}</TableCell>
                    <TableCell>{student.school_name || 'N/A'}</TableCell>
                    <TableCell>{student.class_grade || 'N/A'}</TableCell>
                    <TableCell>
                      {studentProgress.total > 0 ? (
                        <Box sx={{ display: 'flex', alignItems: 'center' }}>
                          <LinearProgress
                            variant="determinate"
                            value={(studentProgress.completed / studentProgress.total) * 100}
                            sx={{ width: 100, mr: 1, height: 6, borderRadius: 3 }}
                          />
                          <Typography variant="caption">
                            {studentProgress.completed}/{studentProgress.total}
                          </Typography>
                        </Box>
                      ) : (
                        <Typography variant="body2" color="text.secondary">
                          No progress
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell>
                      {studentProgress.total > 0 ? (
                        <Chip label="Active" color="success" size="small" variant="outlined" />
                      ) : (
                        <Chip label="Inactive" size="small" variant="outlined" />
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {/* Progress Overview Tab */}
      {tabValue === 1 && (
        <TableContainer component={Paper} className="glass-panel" sx={{ borderRadius: 2, overflow: 'hidden' }}>
          <Table>
            <TableHead sx={{ bgcolor: 'rgba(102, 126, 234, 0.05)' }}>
              <TableRow>
                <TableCell sx={{ fontWeight: 'bold' }}>Student</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>Course</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>Lesson</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>Status</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>Progress</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>Last Accessed</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {progress.slice(0, 50).map((p) => (
                <TableRow key={p.id} hover>
                  <TableCell sx={{ fontWeight: 500 }}>{p.full_name}</TableCell>
                  <TableCell>{p.course_title}</TableCell>
                  <TableCell>{p.lesson_title}</TableCell>
                  <TableCell>
                    <Chip
                      label={p.completion_status.replace('_', ' ')}
                      color={
                        p.completion_status === 'completed'
                          ? 'success'
                          : p.completion_status === 'in_progress'
                            ? 'primary'
                            : 'default'
                      }
                      size="small"
                      sx={{ textTransform: 'capitalize' }}
                    />
                  </TableCell>
                  <TableCell>
                    <Box sx={{ display: 'flex', alignItems: 'center' }}>
                      <CircularProgress
                        variant="determinate"
                        value={p.progress_percentage}
                        size={20}
                        thickness={5}
                        sx={{ mr: 1, color: p.progress_percentage === 100 ? 'success.main' : 'primary.main' }}
                      />
                      {p.progress_percentage}%
                    </Box>
                  </TableCell>
                  <TableCell>
                    {new Date(p.last_accessed).toLocaleDateString()}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {students.length === 0 && (
        <Box textAlign="center" py={8} className="glass-panel" sx={{ mt: 4, borderRadius: 2 }}>
          <People sx={{ fontSize: 60, color: 'text.secondary', opacity: 0.5, mb: 2 }} />
          <Typography variant="h6" color="text.secondary">
            No students registered yet.
          </Typography>
        </Box>
      )}
    </Container>
  );
};

export default TeacherDashboard;

