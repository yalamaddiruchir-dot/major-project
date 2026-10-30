import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  Container,
  Typography,
  Box,
  Card,
  CardContent,
  Button,
  List,
  ListItem,
  ListItemText,
  ListItemButton,
  Chip,
  CircularProgress,
  LinearProgress,
  Alert,
  Paper,
} from '@mui/material';
import {
  PlayArrow,
  CheckCircle,
  School,
  ArrowBack,
} from '@mui/icons-material';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';

const CourseDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [course, setCourse] = useState(null);
  const [progress, setProgress] = useState([]);
  const [loading, setLoading] = useState(true);
  const [enrolled, setEnrolled] = useState(false);
  const [enrolling, setEnrolling] = useState(false);
  const [enrollError, setEnrollError] = useState('');

  useEffect(() => {
    const fetchCourseData = async () => {
      // If user is not defined (checking authentication state), wait or handle.
      // Assuming user might be null initially during load.
      if (user === undefined) return;

      if (!user) {
        // Not logged in, can still view course details but not progress/enrollment
        try {
          const courseRes = await axios.get(`/api/courses/${id}`);
          setCourse(courseRes.data.course);
        } catch (error) {
          console.error('Error fetching course:', error);
        } finally {
          setLoading(false);
        }
        return;
      }

      try {
        const [courseRes, progressRes, enrollmentsRes] = await Promise.all([
          axios.get(`/api/courses/${id}`),
          axios.get('/api/progress', { params: { course_id: id } }),
          axios.get(`/api/users/${user.id}/enrollments`),
        ]);

        setCourse(courseRes.data.course);
        setProgress(progressRes.data.progress);
        setEnrolled(enrollmentsRes.data.enrollments.some((e) => e.course_id === parseInt(id)));
      } catch (error) {
        console.error('Error fetching course data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchCourseData();
  }, [id, user]);

  const handleEnroll = async () => {
    if (!user || !user.id) {
      setEnrollError('Please login to enroll in courses.');
      return;
    }

    try {
      setEnrolling(true);
      setEnrollError('');

      const response = await axios.post(`/api/users/${user.id}/enrollments`, {
        course_id: parseInt(id)
      });

      if (response.data.success) {
        setEnrolled(true);
        // Refresh data manually or trigger re-fetch. 
        // For simplicity, we can just reload functionality or set state.
        // Let's refetch course data basically by calling hook logic? No, let's just update local state if possible.
        // Actually, re-triggering effect is dependent on user/id which do not change. 
        // We can just set enrolled true, which we did.
      } else {
        setEnrollError(response.data.message || 'Failed to enroll in course.');
      }
    } catch (error) {
      console.error('Error enrolling:', error);
      const errorMessage = error.response?.data?.message ||
        error.message ||
        'Failed to enroll in course. Please try again.';
      setEnrollError(errorMessage);
    } finally {
      setEnrolling(false);
    }
  };

  const getLessonProgress = (lessonId) => {
    const lessonProgress = progress.find((p) => p.lesson_id === lessonId);
    return lessonProgress || null;
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="60vh">
        <CircularProgress size={60} />
      </Box>
    );
  }

  if (!course) {
    return (
      <Container sx={{ py: 8 }}>
        <Alert severity="error" variant="filled">Course not found</Alert>
        <Button startIcon={<ArrowBack />} onClick={() => navigate('/courses')} sx={{ mt: 2 }}>
          Back to Courses
        </Button>
      </Container>
    );
  }

  const completedLessons = progress.filter((p) => p.completion_status === 'completed').length;
  const totalLessons = course.lessons?.length || 0;
  const canAccessLessons = enrolled || user?.role === 'admin' || (user?.role === 'teacher' && course.created_by === user.id);
  const progressPercentage = totalLessons > 0 ? Math.round((completedLessons / totalLessons) * 100) : 0;

  return (
    <Container maxWidth="lg" sx={{ py: 8 }}>
      <Button
        startIcon={<ArrowBack />}
        onClick={() => navigate('/courses')}
        sx={{ mb: 4, color: 'text.secondary' }}
      >
        Back to Courses
      </Button>

      <Card className="glass-panel" sx={{ mb: 6, overflow: 'visible' }}>
        <CardContent sx={{ p: 4 }}>
          <Box sx={{ display: 'flex', alignItems: 'flex-start', mb: 4, flexDirection: { xs: 'column', md: 'row' } }}>
            <Box sx={{
              p: 3,
              borderRadius: 4,
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              color: 'white',
              mr: { md: 4 },
              mb: { xs: 3, md: 0 },
              boxShadow: '0 10px 20px rgba(118, 75, 162, 0.4)'
            }}>
              <School sx={{ fontSize: 60 }} />
            </Box>
            <Box sx={{ flexGrow: 1 }}>
              <Typography variant="h3" component="h1" gutterBottom fontWeight="bold" sx={{ color: '#2d3748' }}>
                {course.title}
              </Typography>
              <Box sx={{ display: 'flex', gap: 1.5, mb: 3, flexWrap: 'wrap' }}>
                {course.category && (
                  <Chip
                    label={course.category}
                    sx={{ bgcolor: 'rgba(102, 126, 234, 0.1)', color: 'primary.main', fontWeight: 'bold' }}
                  />
                )}
                {course.language && (
                  <Chip
                    label={course.language.toUpperCase()}
                    variant="outlined"
                    sx={{ borderColor: 'rgba(0,0,0,0.2)', fontWeight: 500 }}
                  />
                )}
              </Box>
              <Typography variant="body1" color="text.secondary" sx={{ fontSize: '1.1rem', lineHeight: 1.7, maxWidth: '800px' }}>
                {course.description || 'No description available'}
              </Typography>
            </Box>
          </Box>

          {enrolled && progress.length > 0 && (
            <Box sx={{ mb: 4, p: 3, bgcolor: 'rgba(255,255,255,0.5)', borderRadius: 3 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1.5 }}>
                <Typography variant="subtitle1" fontWeight="bold">Your Progress</Typography>
                <Typography variant="subtitle1" fontWeight="bold" color="primary">{progressPercentage}%</Typography>
              </Box>
              <LinearProgress
                variant="determinate"
                value={progressPercentage}
                sx={{ height: 10, borderRadius: 5, bgcolor: 'rgba(0,0,0,0.05)', '& .MuiLinearProgress-bar': { borderRadius: 5, background: 'linear-gradient(90deg, #00d2ff, #3a7bd5)' } }}
              />
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5 }}>
                {completedLessons} of {totalLessons} lessons completed
              </Typography>
            </Box>
          )}

          {!enrolled && (
            <Box sx={{ mt: 2 }}>
              <Button
                variant="contained"
                size="large"
                onClick={handleEnroll}
                disabled={enrolling}
                startIcon={enrolling ? <CircularProgress size={20} color="inherit" /> : <PlayArrow />}
                sx={{
                  py: 1.5,
                  px: 4,
                  borderRadius: 2,
                  fontSize: '1rem',
                  fontWeight: 'bold',
                  background: 'linear-gradient(90deg, #667eea 0%, #764ba2 100%)',
                  boxShadow: '0 4px 15px rgba(102, 126, 234, 0.4)'
                }}
                className="hover-glow"
              >
                {enrolling ? 'Enrolling...' : 'Enroll Now'}
              </Button>
              {enrollError && (
                <Alert severity="error" sx={{ mt: 3, borderRadius: 2 }}>
                  {enrollError}
                </Alert>
              )}
            </Box>
          )}

          {enrolled && (
            <Alert severity="success" icon={<CheckCircle fontSize="inherit" />} sx={{ mt: 2, borderRadius: 2 }}>
              You are enrolled in this course. Good luck!
            </Alert>
          )}
        </CardContent>
      </Card>

      <Typography variant="h5" gutterBottom fontWeight="bold" sx={{ mb: 3, px: 1 }}>
        Course Curriculum
      </Typography>

      {course.lessons && course.lessons.length > 0 ? (
        <List sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {course.lessons.map((lesson, index) => {
            const lessonProgress = getLessonProgress(lesson.id);
            const isCompleted = lessonProgress?.completion_status === 'completed';
            const isInProgress = lessonProgress?.completion_status === 'in_progress';

            return (
              <Card key={lesson.id} className="hover-glow" sx={{ border: 'none', boxShadow: '0 4px 6px rgba(0,0,0,0.02)' }}>
                <ListItem
                  component={canAccessLessons ? Link : 'div'}
                  {...(canAccessLessons ? { to: `/lessons/${lesson.id}` } : {})}
                  sx={{ textDecoration: 'none', color: 'inherit', p: 0 }}
                >
                  <ListItemButton disabled={!canAccessLessons} sx={{ p: 3 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', width: '100%' }}>
                      <Box sx={{ mr: 3, minWidth: 50, textAlign: 'center' }}>
                        {isCompleted ? (
                          <CheckCircle color="success" sx={{ fontSize: 32 }} />
                        ) : isInProgress ? (
                          <PlayArrow color="primary" sx={{ fontSize: 32 }} />
                        ) : (
                          <Box sx={{
                            width: 32,
                            height: 32,
                            borderRadius: '50%',
                            border: '2px solid #e2e8f0',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            margin: '0 auto',
                            fontWeight: 'bold',
                            color: 'text.secondary'
                          }}>
                            {index + 1}
                          </Box>
                        )}
                      </Box>
                      <ListItemText
                        primary={
                          <Typography variant="h6" component="span" fontWeight="500" sx={{ mb: 0.5, display: 'block' }}>
                            {lesson.title}
                          </Typography>
                        }
                        secondary={
                          <Box>
                            <Typography variant="body2" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                              {lesson.description || 'No description'}
                            </Typography>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                              {lesson.duration_minutes && (
                                <Chip
                                  label={`${lesson.duration_minutes} min`}
                                  size="small"
                                  sx={{ bgcolor: '#f1f5f9', fontWeight: 500 }}
                                />
                              )}
                              {lessonProgress && (
                                <Typography variant="caption" color="primary" fontWeight="bold">
                                  {lessonProgress.progress_percentage}% Completed
                                </Typography>
                              )}
                            </Box>
                          </Box>
                        }
                      />
                    </Box>
                  </ListItemButton>
                </ListItem>
              </Card>
            );
          })}
        </List>
      ) : (
        <Paper sx={{ p: 4, textAlign: 'center', bgcolor: '#f8f9fa' }}>
          <Typography color="text.secondary">No lessons available for this course yet.</Typography>
        </Paper>
      )}
    </Container>
  );
};

export default CourseDetail;

