import React, { useState, useEffect, useCallback } from 'react';
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
  Skeleton,
  LinearProgress,
  Chip,
  Alert,
  Stack,
} from '@mui/material';
import {
  School,
  PlayArrow,
  OfflinePin,
  Quiz,
  WorkspacePremium,
  Storage,
  Security,
  Person,
} from '@mui/icons-material';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { useOffline } from '../context/OfflineContext';
import { resolveEntityTranslation } from '../i18n/translations';
import {
  getOfflineCoursesList,
  getOfflineProgressForUser,
} from '../services/offlineDb';

const Dashboard = () => {
  const { user } = useAuth();
  const { language, t } = useLanguage();
  const { isOffline, offlineCourseIds } = useOffline();

  const [enrollments, setEnrollments] = useState([]);
  const [allCourses, setAllCourses] = useState([]);
  const [progress, setProgress] = useState([]);
  const [certificatesCount, setCertificatesCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [usingOfflineData, setUsingOfflineData] = useState(false);

  const fetchData = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const requests = [
        axios.get('/api/courses'),
        axios.get('/api/progress'),
        axios.get(`/api/users/${user.id}/enrollments`),
        axios.get('/api/certificates'),
      ];
      const [coursesRes, progressRes, enrollRes, certsRes] = await Promise.all(requests);
      setAllCourses(coursesRes.data.courses || []);
      setProgress(progressRes.data.progress || []);
      setEnrollments(enrollRes.data.enrollments || []);
      setCertificatesCount((certsRes.data.certificates || []).length);
      setUsingOfflineData(false);
    } catch (_error) {
      // Fallback to IndexedDB offline storage when disconnected
      try {
        const [offlineCourses, offlineProg] = await Promise.all([
          getOfflineCoursesList(user.id),
          getOfflineProgressForUser(user.id),
        ]);
        const mappedCourses = offlineCourses.map((c) => ({
          ...c.course,
          lesson_count: c.lessonCount || c.course?.lessons?.length || 0,
        }));
        setAllCourses(mappedCourses);
        setEnrollments(
          mappedCourses.map((c) => ({
            course_id: c.id,
            course_title: c.title,
            course_description: c.description,
            category: c.category,
            language: c.language,
            lesson_count: c.lesson_count,
          }))
        );
        setProgress(offlineProg);
        setUsingOfflineData(true);
      } catch (_offlineErr) {
        setAllCourses([]);
      }
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    fetchData();
    const onSynced = () => fetchData();
    window.addEventListener('rural-learning-progress-synced', onSynced);
    return () => window.removeEventListener('rural-learning-progress-synced', onSynced);
  }, [fetchData]);

  const computeCourseProgressPercentage = (courseId, totalLessonCount) => {
    const total = Number(totalLessonCount || 0);
    if (total <= 0) return 0;
    const completed = progress.filter(
      (p) => Number(p.course_id) === Number(courseId) && p.completion_status === 'completed'
    ).length;
    return Math.min(100, Math.round((completed / total) * 100));
  };

  const enrolledIds = new Set(enrollments.map((e) => Number(e.course_id)));
  const enrolledCourses = allCourses.filter((c) => enrolledIds.has(Number(c.id)));
  const recommendedCourses = allCourses.filter((c) => !enrolledIds.has(Number(c.id))).slice(0, 6);

  if (loading) {
    return (
      <Container maxWidth="lg" sx={{ py: 5 }}>
        <Skeleton variant="text" width="45%" height={48} sx={{ mb: 1 }} />
        <Skeleton variant="text" width="60%" height={28} sx={{ mb: 4 }} />
        <Grid container spacing={3}>
          {[1, 2, 3, 4].map((n) => (
            <Grid item xs={12} sm={6} md={3} key={n}>
              <Skeleton variant="rounded" height={120} />
            </Grid>
          ))}
        </Grid>
      </Container>
    );
  }

  return (
    <Container maxWidth="lg" sx={{ py: 5 }}>
      {(isOffline || usingOfflineData) && (
        <Alert severity="warning" sx={{ mb: 3 }}>
          {t('lesson.offlineBanner')}
        </Alert>
      )}

      <Box sx={{ mb: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 2 }}>
        <Box>
          <Typography variant="h4" component="h1" fontWeight={800} gutterBottom className="gradient-text">
            {t('dashboard.welcome', { name: user?.full_name || user?.username })}
          </Typography>
          <Typography variant="body1" color="text.secondary">
            {t('dashboard.studentSubtitle')}
          </Typography>
        </Box>

        <Stack direction="row" spacing={1.5} flexWrap="wrap">
          {user?.role === 'admin' && (
            <Button variant="contained" color="secondary" component={Link} to="/admin" startIcon={<Security />}>
              {t('nav.admin')}
            </Button>
          )}
          {(user?.role === 'teacher' || user?.role === 'admin') && (
            <Button variant="contained" component={Link} to="/teacher" startIcon={<Person />}>
              {t('nav.teacher')}
            </Button>
          )}
          <Button variant="outlined" component={Link} to="/assessments" startIcon={<Quiz />}>
            {t('nav.assessments')}
          </Button>
          <Button variant="outlined" component={Link} to="/offline" startIcon={<Storage />}>
            {t('nav.offline')}
          </Button>
        </Stack>
      </Box>

      {/* Accurate Student Metrics */}
      <Grid container spacing={3} sx={{ mb: 5 }}>
        <Grid item xs={6} md={3}>
          <Card className="glass-panel" sx={{ height: '100%' }}>
            <CardContent>
              <Typography variant="body2" color="text.secondary" fontWeight={700}>
                {t('dashboard.enrolledCourses')}
              </Typography>
              <Typography variant="h3" fontWeight={800} color="primary" sx={{ mt: 1 }}>
                {enrollments.length}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={6} md={3}>
          <Card className="glass-panel" sx={{ height: '100%' }}>
            <CardContent>
              <Typography variant="body2" color="text.secondary" fontWeight={700}>
                {t('dashboard.completedLessons')}
              </Typography>
              <Typography variant="h3" fontWeight={800} sx={{ color: '#0284c7', mt: 1 }}>
                {progress.filter((p) => p.completion_status === 'completed').length}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={6} md={3}>
          <Card className="glass-panel" sx={{ height: '100%' }}>
            <CardContent>
              <Typography variant="body2" color="text.secondary" fontWeight={700}>
                {t('dashboard.inProgressLessons')}
              </Typography>
              <Typography variant="h3" fontWeight={800} sx={{ color: '#b45309', mt: 1 }}>
                {progress.filter((p) => p.completion_status === 'in_progress').length}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={6} md={3}>
          <Card
            className="glass-panel"
            component={Link}
            to="/certificates"
            sx={{ height: '100%', display: 'block', textDecoration: 'none' }}
          >
            <CardContent>
              <Typography variant="body2" color="text.secondary" fontWeight={700}>
                {t('dashboard.earnedCertificates')}
              </Typography>
              <Stack direction="row" alignItems="center" spacing={1} sx={{ mt: 1 }}>
                <Typography variant="h3" fontWeight={800} sx={{ color: '#059669' }}>
                  {certificatesCount}
                </Typography>
                <WorkspacePremium sx={{ color: '#059669', fontSize: 32 }} />
              </Stack>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Enrolled Courses */}
      <Typography variant="h5" component="h2" fontWeight={800} gutterBottom sx={{ mb: 2.5 }} className="gradient-text">
        {t('dashboard.myEnrolledCourses')}
      </Typography>

      {enrolledCourses.length === 0 ? (
        <Card className="glass-panel" sx={{ p: 4, mb: 5, textAlign: 'center' }}>
          <School sx={{ fontSize: 52, color: 'text.secondary', opacity: 0.5, mb: 1 }} />
          <Typography variant="h6" gutterBottom>
            {t('dashboard.noEnrolledYet')}
          </Typography>
          <Button variant="contained" component={Link} to="/courses" sx={{ mt: 1, fontWeight: 700 }}>
            {t('dashboard.browseCatalog')}
          </Button>
        </Card>
      ) : (
        <Grid container spacing={3} sx={{ mb: 6 }}>
          {enrolledCourses.map((course) => {
            const localized = resolveEntityTranslation(course, language);
            const pct = computeCourseProgressPercentage(course.id, course.lesson_count);
            const savedOffline = offlineCourseIds.includes(Number(course.id));
            return (
              <Grid item xs={12} sm={6} md={4} key={course.id}>
                <Card className="glass-panel glow-card" sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                  <CardContent sx={{ flexGrow: 1 }}>
                    <Stack direction="row" spacing={1} mb={1.5} flexWrap="wrap">
                      {course.category && <Chip label={course.category} size="small" color="primary" variant="outlined" />}
                      {savedOffline && (
                        <Chip
                          icon={<OfflinePin />}
                          label={t('dashboard.availableOffline')}
                          size="small"
                          color="success"
                        />
                      )}
                    </Stack>
                    <Typography variant="h6" component="h3" fontWeight={700} gutterBottom>
                      {localized.title}
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                      {localized.description || 'Structured rural digital learning course.'}
                    </Typography>

                    <Box sx={{ mt: 'auto' }}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                        <Typography variant="caption" fontWeight={700}>
                          {t('dashboard.progress')}
                        </Typography>
                        <Typography variant="caption" fontWeight={700}>
                          {pct}% ({t('courses.lessonsCount', { count: course.lesson_count || 0 })})
                        </Typography>
                      </Box>
                      <LinearProgress
                        variant="determinate"
                        value={pct}
                        aria-label={`${localized.title} progress ${pct}%`}
                        sx={{ height: 8, borderRadius: 4 }}
                      />
                    </Box>
                  </CardContent>
                  <CardActions sx={{ p: 2, pt: 0 }}>
                    <Button
                      fullWidth
                      variant="contained"
                      component={Link}
                      to={`/courses/${course.id}`}
                      startIcon={<PlayArrow />}
                      sx={{ fontWeight: 700, textTransform: 'none' }}
                    >
                      {t('dashboard.continueLearning')}
                    </Button>
                  </CardActions>
                </Card>
              </Grid>
            );
          })}
        </Grid>
      )}

      {/* Recommended Un-enrolled Courses */}
      {recommendedCourses.length > 0 && (
        <>
          <Typography variant="h5" component="h2" fontWeight={800} gutterBottom sx={{ mb: 2.5 }} className="gradient-text">
            {t('dashboard.exploreMoreCourses')}
          </Typography>
          <Grid container spacing={3}>
            {recommendedCourses.map((course) => {
              const localized = resolveEntityTranslation(course, language);
              return (
                <Grid item xs={12} sm={6} md={4} key={course.id}>
                  <Card className="glass-panel glow-card" sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                    <CardContent sx={{ flexGrow: 1 }}>
                      {course.category && (
                        <Chip label={course.category} size="small" sx={{ mb: 1.5 }} />
                      )}
                      <Typography variant="h6" component="h3" fontWeight={700} gutterBottom>
                        {localized.title}
                      </Typography>
                      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
                        {localized.description
                          ? localized.description.slice(0, 120) + (localized.description.length > 120 ? '...' : '')
                          : 'Explore course modules and interactive lessons.'}
                      </Typography>
                      <Typography variant="caption" color="text.secondary" fontWeight={600}>
                        {t('courses.lessonsCount', { count: course.lesson_count || 0 })}
                      </Typography>
                    </CardContent>
                    <CardActions sx={{ p: 2, pt: 0 }}>
                      <Button
                        fullWidth
                        variant="outlined"
                        component={Link}
                        to={`/courses/${course.id}`}
                        startIcon={<PlayArrow />}
                        sx={{ fontWeight: 700, textTransform: 'none' }}
                      >
                        {t('dashboard.startCourse')}
                      </Button>
                    </CardActions>
                  </Card>
                </Grid>
              );
            })}
          </Grid>
        </>
      )}
    </Container>
  );
};

export default Dashboard;
