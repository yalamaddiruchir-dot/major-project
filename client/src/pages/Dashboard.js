import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Container,
  Typography,
  Box,
  Grid,
  Card,
  CardContent,
  CardActions,
  Button,
  CircularProgress,
  LinearProgress,
  Chip,
} from '@mui/material';
import {
  School,
  PlayArrow,
} from '@mui/icons-material';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';

const Dashboard = () => {
  const { user } = useAuth();
  const [courses, setCourses] = useState([]);
  const [progress, setProgress] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [coursesRes, progressRes] = await Promise.all([
        axios.get('/api/courses'),
        axios.get('/api/progress'),
      ]);

      setCourses(coursesRes.data.courses);
      setProgress(progressRes.data.progress);
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  const getCourseProgress = (courseId) => {
    const courseProgress = progress.filter((p) => p.course_id === courseId);
    if (courseProgress.length === 0) return 0;

    const completed = courseProgress.filter((p) => p.completion_status === 'completed').length;
    return Math.round((completed / courseProgress.length) * 100);
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
          Welcome, {user?.full_name}!
        </Typography>
        <Typography variant="body1" color="text.secondary" sx={{ fontSize: '1.1rem' }}>
          Continue your learning journey with your enrolled courses.
        </Typography>
      </Box>

      {/* Progress Overview */}
      <Grid container spacing={4} sx={{ mb: 6 }}>
        <Grid item xs={12} sm={4}>
          <Card className="glass-panel glow-card" sx={{ height: '100%', p: 2 }}>
            <CardContent>
              <Typography color="text.secondary" gutterBottom fontWeight="bold">
                Enrolled Courses
              </Typography>
              <Typography variant="h3" fontWeight="bold" color="primary">
                {courses.length}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={4}>
          <Card className="glass-panel glow-card" sx={{ height: '100%', p: 2 }}>
            <CardContent>
              <Typography color="text.secondary" gutterBottom fontWeight="bold">
                Completed Lessons
              </Typography>
              <Typography variant="h3" fontWeight="bold" sx={{ color: '#00d2ff' }}>
                {progress.filter((p) => p.completion_status === 'completed').length}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={4}>
          <Card className="glass-panel glow-card" sx={{ height: '100%', p: 2 }}>
            <CardContent>
              <Typography color="text.secondary" gutterBottom fontWeight="bold">
                In Progress
              </Typography>
              <Typography variant="h3" fontWeight="bold" color="secondary">
                {progress.filter((p) => p.completion_status === 'in_progress').length}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Courses */}
      <Typography variant="h5" gutterBottom sx={{ mb: 4 }} fontWeight="bold" className="gradient-text">
        Available Courses
      </Typography>
      <Grid container spacing={4}>
        {courses.map((course) => {
          const courseProgress = getCourseProgress(course.id);
          return (
            <Grid item xs={12} sm={6} md={4} key={course.id}>
              <Card className="glass-panel glow-card" sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                <CardContent sx={{ flexGrow: 1, p: 3 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
                    <Box sx={{ p: 1, borderRadius: 2, bgcolor: 'rgba(102, 126, 234, 0.1)', mr: 2 }}>
                      <School sx={{ color: 'primary.main', fontSize: 30 }} />
                    </Box>
                    <Typography variant="h6" component="h2" fontWeight="bold">
                      {course.title}
                    </Typography>
                  </Box>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 3, minHeight: '3em' }}>
                    {course.description || 'No description available'}
                  </Typography>
                  {course.category && (
                    <Chip
                      label={course.category}
                      size="small"
                      sx={{ mb: 2, bgcolor: 'rgba(0, 210, 255, 0.1)', color: '#008ba3', fontWeight: 'bold' }}
                    />
                  )}
                  {courseProgress > 0 && (
                    <Box sx={{ mt: 2 }}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                        <Typography variant="caption" fontWeight="bold">Progress</Typography>
                        <Typography variant="caption" fontWeight="bold">{courseProgress}%</Typography>
                      </Box>
                      <LinearProgress
                        variant="determinate"
                        value={courseProgress}
                        sx={{ height: 6, borderRadius: 3, bgcolor: 'rgba(0,0,0,0.05)', '& .MuiLinearProgress-bar': { borderRadius: 3, background: 'linear-gradient(90deg, #667eea, #764ba2)' } }}
                      />
                    </Box>
                  )}
                </CardContent>
                <CardActions sx={{ p: 3, pt: 0 }}>
                  <Button
                    fullWidth
                    variant={courseProgress > 0 ? "contained" : "outlined"}
                    component={Link}
                    to={`/courses/${course.id}`}
                    startIcon={<PlayArrow />}
                    className="hover-glow"
                    sx={{
                      borderRadius: 2,
                      textTransform: 'none',
                      fontWeight: 'bold',
                      ...(courseProgress > 0 ? {
                        background: 'linear-gradient(90deg, #667eea 0%, #764ba2 100%)',
                      } : {
                        borderColor: 'primary.main',
                        color: 'primary.main',
                        '&:hover': { borderColor: 'secondary.main', color: 'secondary.main' }
                      })
                    }}
                  >
                    {courseProgress > 0 ? 'Continue Learning' : 'Start Course'}
                  </Button>
                </CardActions>
              </Card>
            </Grid>
          );
        })}
      </Grid>

      {courses.length === 0 && (
        <Box textAlign="center" py={8} className="glass-panel" sx={{ borderRadius: 4 }}>
          <School sx={{ fontSize: 60, color: 'text.secondary', opacity: 0.5, mb: 2 }} />
          <Typography variant="h6" color="text.secondary">
            No courses available yet.
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Check back later for new content!
          </Typography>
        </Box>
      )}
    </Container>
  );
};

export default Dashboard;

