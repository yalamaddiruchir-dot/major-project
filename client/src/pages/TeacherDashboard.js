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
  Chip,
  Stack,
  Tabs,
  Tab,
  TextField,
  MenuItem,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  LinearProgress,
} from '@mui/material';
import {
  Add,
  Edit,
  Delete,
  School,
  Visibility,
  Quiz,
  Analytics,
  WarningAmber,
} from '@mui/icons-material';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { useToast } from '../context/ToastContext';
import ConfirmDialog from '../components/ConfirmDialog';
import {
  CourseCompletionBarChart,
  ActivityTimelineChart,
} from '../components/AnalyticsCharts';

const TeacherDashboard = () => {
  const { user } = useAuth();
  const { t } = useLanguage();
  const { showToast } = useToast();

  const [tab, setTab] = useState(0);
  const [courses, setCourses] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [courseFilter, setCourseFilter] = useState('');
  const [gradeFilter, setGradeFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [deleteCourseTarget, setDeleteCourseTarget] = useState(null);
  const [studentDetail, setStudentDetail] = useState(null);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    try {
      const [coursesRes, analyticsRes] = await Promise.all([
        axios.get('/api/courses', {
          params: user?.role === 'teacher' ? { mine: 'true', limit: 50 } : { limit: 50 },
        }),
        axios.get('/api/analytics/overview', {
          params: {
            course_id: courseFilter || undefined,
            class_grade: gradeFilter.trim() || undefined,
          },
        }),
      ]);
      setCourses(coursesRes.data.courses || []);
      setAnalytics(analyticsRes.data);
    } catch (error) {
      showToast(error.response?.data?.message || 'Failed to load teacher dashboard.', 'error');
    } finally {
      setLoading(false);
    }
  }, [courseFilter, gradeFilter, showToast, user?.role]);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  const handleDeleteCourse = async () => {
    if (!deleteCourseTarget) return;
    try {
      await axios.delete(`/api/courses/${deleteCourseTarget.id}`);
      showToast('Course deleted.', 'info');
      setDeleteCourseTarget(null);
      loadDashboard();
    } catch (error) {
      showToast(error.response?.data?.message || 'Failed to delete course.', 'error');
    }
  };

  const handleInspectStudent = async (studentId) => {
    try {
      const res = await axios.get(`/api/analytics/student/${studentId}`);
      setStudentDetail(res.data);
    } catch (_e) {
      showToast('Unable to load student analytics detail.', 'error');
    }
  };

  if (loading && !analytics) {
    return (
      <Container maxWidth="lg" sx={{ py: 5 }}>
        <Skeleton variant="text" width={280} height={46} sx={{ mb: 2 }} />
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

  const summary = analytics?.summary || {};

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Stack
        direction="row"
        justifyContent="space-between"
        alignItems="flex-start"
        flexWrap="wrap"
        gap={2}
        mb={3}
      >
        <Box>
          <Typography variant="h4" component="h1" fontWeight={800} className="gradient-text" gutterBottom>
            {t('teacher.title')}
          </Typography>
          <Typography variant="body1" color="text.secondary">
            {t('teacher.subtitle')}
          </Typography>
        </Box>

        <Stack direction="row" spacing={1.5} flexWrap="wrap">
          <Button variant="outlined" component={Link} to="/assessments" startIcon={<Quiz />}>
            {t('nav.assessments')}
          </Button>
          <Button
            variant="contained"
            component={Link}
            to="/teacher/courses/add"
            startIcon={<Add />}
            sx={{ fontWeight: 700 }}
          >
            {t('teacher.addCourse')}
          </Button>
        </Stack>
      </Stack>

      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid item xs={6} md={3}>
          <Card className="glass-panel">
            <CardContent>
              <Typography variant="body2" color="text.secondary" fontWeight={700}>
                {t('teacher.myCoursesCount')}
              </Typography>
              <Typography variant="h3" fontWeight={800} color="primary" sx={{ mt: 1 }}>
                {courses.length}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={6} md={3}>
          <Card className="glass-panel">
            <CardContent>
              <Typography variant="body2" color="text.secondary" fontWeight={700}>
                {t('teacher.totalStudents')}
              </Typography>
              <Typography variant="h3" fontWeight={800} sx={{ color: '#0284c7', mt: 1 }}>
                {summary.total_enrolled_students || 0}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={6} md={3}>
          <Card className="glass-panel">
            <CardContent>
              <Typography variant="body2" color="text.secondary" fontWeight={700}>
                {t('teacher.avgScore')}
              </Typography>
              <Typography variant="h3" fontWeight={800} sx={{ color: '#059669', mt: 1 }}>
                {summary.average_assessment_percentage || 0}%
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={6} md={3}>
          <Card className="glass-panel">
            <CardContent>
              <Typography variant="body2" color="text.secondary" fontWeight={700}>
                {t('teacher.activeLearners')}
              </Typography>
              <Typography variant="h3" fontWeight={800} sx={{ color: '#b45309', mt: 1 }}>
                {summary.active_learners_7d || 0}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Tabs
        value={tab}
        onChange={(_e, v) => setTab(v)}
        sx={{ mb: 3, borderBottom: 1, borderColor: 'divider' }}
      >
        <Tab label={`${t('teacher.tabCourses')} (${courses.length})`} />
        <Tab icon={<Analytics fontSize="small" />} iconPosition="start" label={t('teacher.tabAnalytics')} />
      </Tabs>

      {tab === 0 && (
        <>
          {courses.length === 0 ? (
            <Card className="glass-panel" sx={{ p: 5, textAlign: 'center' }}>
              <School sx={{ fontSize: 56, color: 'text.secondary', opacity: 0.45, mb: 1 }} />
              <Typography variant="h6" fontWeight={700} gutterBottom>
                No courses created yet
              </Typography>
              <Button
                variant="contained"
                component={Link}
                to="/teacher/courses/add"
                startIcon={<Add />}
                sx={{ mt: 1 }}
              >
                {t('teacher.addCourse')}
              </Button>
            </Card>
          ) : (
            <Grid container spacing={3}>
              {courses.map((course) => (
                <Grid item xs={12} sm={6} md={4} key={course.id}>
                  <Card className="glass-panel glow-card" sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                    <CardContent sx={{ flexGrow: 1 }}>
                      <Stack direction="row" spacing={1} mb={1.5} flexWrap="wrap">
                        {course.category && <Chip label={course.category} size="small" color="primary" variant="outlined" />}
                        <Chip label={`${course.lesson_count ?? 0} Lessons`} size="small" />
                      </Stack>
                      <Typography variant="h6" component="h2" fontWeight={800} gutterBottom>
                        {course.title}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        {course.description
                          ? course.description.slice(0, 110) + (course.description.length > 110 ? '...' : '')
                          : 'No description'}
                      </Typography>
                    </CardContent>
                    <CardActions sx={{ px: 2, pb: 2, flexWrap: 'wrap', gap: 0.5 }}>
                      <Button size="small" component={Link} to={`/courses/${course.id}`} startIcon={<Visibility />}>
                        View
                      </Button>
                      <Button
                        size="small"
                        component={Link}
                        to={`/teacher/courses/${course.id}/lessons/add`}
                        startIcon={<Add />}
                      >
                        Add Lesson
                      </Button>
                      <Button
                        size="small"
                        component={Link}
                        to={`/teacher/courses/edit/${course.id}`}
                        startIcon={<Edit />}
                      >
                        {t('common.edit')}
                      </Button>
                      <Button
                        size="small"
                        color="error"
                        startIcon={<Delete />}
                        onClick={() => setDeleteCourseTarget(course)}
                      >
                        {t('common.delete')}
                      </Button>
                    </CardActions>
                  </Card>
                </Grid>
              ))}
            </Grid>
          )}
        </>
      )}

      {tab === 1 && analytics && (
        <Box>
          <Card className="glass-panel" sx={{ p: 2.5, mb: 3 }}>
            <Grid container spacing={2} alignItems="center">
              <Grid item xs={12} sm={6}>
                <TextField
                  select
                  fullWidth
                  size="small"
                  label="Filter by Course"
                  value={courseFilter}
                  onChange={(e) => setCourseFilter(e.target.value)}
                >
                  <MenuItem value="">All Courses</MenuItem>
                  {courses.map((c) => (
                    <MenuItem key={c.id} value={String(c.id)}>
                      {c.title}
                    </MenuItem>
                  ))}
                </TextField>
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  size="small"
                  label="Filter by Class / Grade (e.g. 8th Grade)"
                  value={gradeFilter}
                  onChange={(e) => setGradeFilter(e.target.value)}
                />
              </Grid>
            </Grid>
          </Card>

          {analytics.weak_subjects?.length > 0 && (
            <Alert icon={<WarningAmber />} severity="warning" sx={{ mb: 3 }}>
              <Typography fontWeight={700} gutterBottom>
                {t('teacher.weakSubjectsTitle')}:
              </Typography>
              {analytics.weak_subjects.map((ws) => (
                <Typography variant="body2" key={ws.subject}>
                  • <strong>{ws.subject}</strong>: {ws.reason} (Avg Completion:{' '}
                  {ws.average_completion_percentage}%)
                </Typography>
              ))}
            </Alert>
          )}

          <Grid container spacing={3} sx={{ mb: 4 }}>
            <Grid item xs={12} md={6}>
              <Card className="glass-panel" sx={{ height: '100%' }}>
                <CardContent>
                  <Typography variant="h6" fontWeight={800} gutterBottom>
                    Course-Wise Completion & Quiz Performance
                  </Typography>
                  <CourseCompletionBarChart data={analytics.course_performance || []} />
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={12} md={6}>
              <Card className="glass-panel" sx={{ height: '100%' }}>
                <CardContent>
                  <Typography variant="h6" fontWeight={800} gutterBottom>
                    Daily Learning Activity (Last 14 Days)
                  </Typography>
                  <ActivityTimelineChart timeline={analytics.activity_timeline || []} />
                </CardContent>
              </Card>
            </Grid>
          </Grid>

          <Card className="glass-panel">
            <CardContent sx={{ overflowX: 'auto' }}>
              <Typography variant="h6" fontWeight={800} gutterBottom>
                Student Progress & Marks Comparison
              </Typography>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Student</TableCell>
                    <TableCell>Grade / School</TableCell>
                    <TableCell>Enrolled</TableCell>
                    <TableCell>Completion</TableCell>
                    <TableCell>Avg Quiz %</TableCell>
                    <TableCell>Study Time</TableCell>
                    <TableCell>Action</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {(analytics.student_performance || []).map((st) => (
                    <TableRow key={st.user_id}>
                      <TableCell>
                        <Typography variant="body2" fontWeight={700}>
                          {st.full_name}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          @{st.username}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        {st.class_grade} • {st.school_name}
                      </TableCell>
                      <TableCell>{st.enrolled_courses}</TableCell>
                      <TableCell>
                        {st.completed_lessons}/{st.assigned_lessons} ({st.completion_percentage}%)
                      </TableCell>
                      <TableCell>
                        {st.average_marks_percentage !== null ? `${st.average_marks_percentage}%` : '—'}
                      </TableCell>
                      <TableCell>{st.time_spent_minutes}m</TableCell>
                      <TableCell>
                        <Button size="small" onClick={() => handleInspectStudent(st.user_id)}>
                          Individual Report
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </Box>
      )}

      <Dialog open={Boolean(studentDetail)} onClose={() => setStudentDetail(null)} maxWidth="md" fullWidth>
        <DialogTitle sx={{ fontWeight: 800 }}>
          Student Performance — {studentDetail?.student?.full_name}
        </DialogTitle>
        <DialogContent dividers>
          {studentDetail && (
            <>
              <Typography variant="subtitle2" gutterBottom fontWeight={700}>
                Enrolled Courses & Completion
              </Typography>
              <Stack spacing={1.5} sx={{ mb: 3 }}>
                {(studentDetail.courses || []).map((c) => (
                  <Box key={c.course_id}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                      <Typography variant="body2" fontWeight={600}>
                        {c.title}
                      </Typography>
                      <Typography variant="caption">
                        {c.completed_lessons}/{c.total_lessons} lessons ({c.completion_percentage}%)
                      </Typography>
                    </Box>
                    <LinearProgress variant="determinate" value={c.completion_percentage} sx={{ height: 7, borderRadius: 3 }} />
                  </Box>
                ))}
              </Stack>

              <Typography variant="subtitle2" gutterBottom fontWeight={700}>
                Assessment Attempts ({studentDetail.assessments?.length || 0})
              </Typography>
              {(studentDetail.assessments || []).length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                  No graded assessments submitted yet.
                </Typography>
              ) : (
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Assessment</TableCell>
                      <TableCell>Score</TableCell>
                      <TableCell>Status</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {studentDetail.assessments.map((a) => (
                      <TableRow key={a.id}>
                        <TableCell>{a.assessment_title} ({a.course_title})</TableCell>
                        <TableCell>{a.score}/{a.total_marks} ({a.percentage}%)</TableCell>
                        <TableCell>{a.passed ? 'Passed' : 'Below Pass %'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setStudentDetail(null)}>{t('common.close')}</Button>
        </DialogActions>
      </Dialog>

      <ConfirmDialog
        open={Boolean(deleteCourseTarget)}
        title="Delete Course?"
        message={`Are you sure you want to permanently delete "${deleteCourseTarget?.title}" and all its lessons?`}
        confirmLabel={t('common.delete')}
        onConfirm={handleDeleteCourse}
        onCancel={() => setDeleteCourseTarget(null)}
      />
    </Container>
  );
};

export default TeacherDashboard;
