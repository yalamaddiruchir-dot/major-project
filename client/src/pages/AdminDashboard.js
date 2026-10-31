import React, { useState, useEffect, useCallback } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  Container,
  Typography,
  Box,
  Grid,
  Card,
  CardContent,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  IconButton,
  Tabs,
  Tab,
  TextField,
  MenuItem,
  Stack,
  Switch,
  Alert,
  Skeleton,
} from '@mui/material';
import {
  People,
  School,
  Add,
  Delete,
  Edit,
  Backup,
  VerifiedUser,
  Visibility,
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

const pathToTab = (pathname) => {
  if (pathname.startsWith('/admin/users')) return 1;
  if (pathname.startsWith('/admin/courses')) return 2;
  return 0;
};

const AdminDashboard = () => {
  const { user: currentUser } = useAuth();
  const { t } = useLanguage();
  const { showToast } = useToast();
  const location = useLocation();
  const navigate = useNavigate();

  const [tab, setTab] = useState(() => pathToTab(location.pathname));
  const [users, setUsers] = useState([]);
  const [courses, setCourses] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [backups, setBackups] = useState([]);
  const [health, setHealth] = useState(null);
  const [loading, setLoading] = useState(true);

  const [userSearch, setUserSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [deleteUserTarget, setDeleteUserTarget] = useState(null);
  const [deleteCourseTarget, setDeleteCourseTarget] = useState(null);
  const [creatingBackup, setCreatingBackup] = useState(false);

  useEffect(() => {
    setTab(pathToTab(location.pathname));
  }, [location.pathname]);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [usersRes, coursesRes, analyticsRes, backupsRes, healthRes] = await Promise.all([
        axios.get('/api/users', {
          params: {
            limit: 100,
            role: roleFilter || undefined,
            search: userSearch.trim() || undefined,
          },
        }),
        axios.get('/api/courses', { params: { limit: 100 } }),
        axios.get('/api/analytics/overview'),
        axios.get('/api/admin/backups'),
        axios.get('/api/health'),
      ]);

      setUsers(usersRes.data.users || []);
      setCourses(coursesRes.data.courses || []);
      setAnalytics(analyticsRes.data);
      setBackups(backupsRes.data.backups || []);
      setHealth(healthRes.data);
    } catch (error) {
      showToast(error.response?.data?.message || 'Error loading admin dashboard.', 'error');
    } finally {
      setLoading(false);
    }
  }, [roleFilter, showToast, userSearch]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const handleTabChange = (_e, newTab) => {
    setTab(newTab);
    if (newTab === 1) navigate('/admin/users', { replace: true });
    else if (newTab === 2) navigate('/admin/courses', { replace: true });
    else navigate('/admin', { replace: true });
  };

  const handleRoleChange = async (targetUser, newRole) => {
    try {
      await axios.put(`/api/users/${targetUser.id}`, { role: newRole });
      showToast(`Updated ${targetUser.username} role to ${newRole}.`, 'success');
      fetchAll();
    } catch (error) {
      showToast(error.response?.data?.message || 'Failed to update role.', 'error');
    }
  };

  const handleToggleUserActive = async (targetUser) => {
    try {
      await axios.put(`/api/users/${targetUser.id}`, { is_active: !targetUser.is_active });
      showToast(
        `${targetUser.username} ${!targetUser.is_active ? 'activated' : 'deactivated'}.`,
        'info'
      );
      fetchAll();
    } catch (error) {
      showToast(error.response?.data?.message || 'Could not update user status.', 'error');
    }
  };

  const handleConfirmDeleteUser = async () => {
    if (!deleteUserTarget) return;
    try {
      await axios.delete(`/api/users/${deleteUserTarget.id}`);
      showToast(`Deleted user "${deleteUserTarget.username}".`, 'info');
      setDeleteUserTarget(null);
      fetchAll();
    } catch (error) {
      showToast(error.response?.data?.message || 'Failed to delete user.', 'error');
    }
  };

  const handleConfirmDeleteCourse = async () => {
    if (!deleteCourseTarget) return;
    try {
      await axios.delete(`/api/courses/${deleteCourseTarget.id}`);
      showToast(`Deleted course "${deleteCourseTarget.title}".`, 'info');
      setDeleteCourseTarget(null);
      fetchAll();
    } catch (error) {
      showToast(error.response?.data?.message || 'Failed to delete course.', 'error');
    }
  };

  const handleCreateBackup = async () => {
    setCreatingBackup(true);
    try {
      const res = await axios.post('/api/admin/backups', { label: 'admin-ui' });
      const bName = res.data.backup?.filename || res.data.backup?.fileName || 'snapshot';
      showToast(`Backup created: ${bName}`, 'success');
      fetchAll();
    } catch (error) {
      showToast(error.response?.data?.message || 'Backup failed.', 'error');
    } finally {
      setCreatingBackup(false);
    }
  };

  const handleValidateBackup = async (fileName) => {
    try {
      const res = await axios.post(`/api/admin/backups/${encodeURIComponent(fileName)}/verify`);
      if (res.data.validation?.valid) {
        showToast(
          `Backup "${fileName}" passed SQLite integrity_check (${res.data.validation.tableCount} tables).`,
          'success'
        );
      } else {
        showToast(`Backup validation failed: ${res.data.validation?.reason}`, 'error');
      }
    } catch (error) {
      showToast(error.response?.data?.message || 'Backup validation request failed.', 'error');
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

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Stack direction="row" justifyContent="space-between" alignItems="flex-start" flexWrap="wrap" gap={2} mb={3}>
        <Box>
          <Typography variant="h4" component="h1" fontWeight={800} className="gradient-text" gutterBottom>
            {t('admin.title')}
          </Typography>
          <Typography variant="body1" color="text.secondary">
            {t('admin.subtitle')}
          </Typography>
        </Box>

        <Stack direction="row" spacing={1.5}>
          <Button variant="outlined" component={Link} to="/admin/users/add" startIcon={<Add />}>
            {t('admin.addUser')}
          </Button>
          <Button variant="contained" component={Link} to="/teacher/courses/add" startIcon={<Add />}>
            {t('admin.addCourse')}
          </Button>
        </Stack>
      </Stack>

      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid item xs={6} md={3}>
          <Card className="glass-panel">
            <CardContent>
              <Typography variant="body2" color="text.secondary" fontWeight={700}>
                Total Users
              </Typography>
              <Typography variant="h3" fontWeight={800} color="primary" sx={{ mt: 1 }}>
                {users.length}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={6} md={3}>
          <Card className="glass-panel">
            <CardContent>
              <Typography variant="body2" color="text.secondary" fontWeight={700}>
                Total Courses
              </Typography>
              <Typography variant="h3" fontWeight={800} sx={{ color: '#0284c7', mt: 1 }}>
                {courses.length}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={6} md={3}>
          <Card className="glass-panel">
            <CardContent>
              <Typography variant="body2" color="text.secondary" fontWeight={700}>
                Students
              </Typography>
              <Typography variant="h3" fontWeight={800} sx={{ color: '#059669', mt: 1 }}>
                {users.filter((u) => u.role === 'student').length}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={6} md={3}>
          <Card className="glass-panel">
            <CardContent>
              <Typography variant="body2" color="text.secondary" fontWeight={700}>
                Teachers
              </Typography>
              <Typography variant="h3" fontWeight={800} sx={{ color: '#b45309', mt: 1 }}>
                {users.filter((u) => u.role === 'teacher').length}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Tabs
        value={tab}
        onChange={handleTabChange}
        variant="scrollable"
        scrollButtons="auto"
        sx={{ mb: 3, borderBottom: 1, borderColor: 'divider' }}
      >
        <Tab label={t('admin.tabOverview')} />
        <Tab icon={<People fontSize="small" />} iconPosition="start" label={t('admin.tabUsers')} />
        <Tab icon={<School fontSize="small" />} iconPosition="start" label={t('admin.tabCourses')} />
        <Tab icon={<Backup fontSize="small" />} iconPosition="start" label={t('admin.tabBackups')} />
      </Tabs>

      {tab === 0 && analytics && (
        <Grid container spacing={3}>
          <Grid item xs={12} md={6}>
            <Card className="glass-panel" sx={{ height: '100%' }}>
              <CardContent>
                <Typography variant="h6" fontWeight={800} gutterBottom>
                  Course Completion & Assessment Performance
                </Typography>
                <CourseCompletionBarChart data={analytics.course_performance || []} />
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} md={6}>
            <Card className="glass-panel" sx={{ height: '100%' }}>
              <CardContent>
                <Typography variant="h6" fontWeight={800} gutterBottom>
                  Platform Daily Learning Activity
                </Typography>
                <ActivityTimelineChart timeline={analytics.activity_timeline || []} />
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      )}

      {tab === 1 && (
        <Card className="glass-panel">
          <CardContent>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} mb={2.5} justifyContent="space-between">
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
                <TextField
                  size="small"
                  label="Search name, username, or email"
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                />
                <TextField
                  select
                  size="small"
                  label="Role"
                  value={roleFilter}
                  onChange={(e) => setRoleFilter(e.target.value)}
                  sx={{ minWidth: 140 }}
                >
                  <MenuItem value="">All Roles</MenuItem>
                  <MenuItem value="student">Student</MenuItem>
                  <MenuItem value="teacher">Teacher</MenuItem>
                  <MenuItem value="admin">Admin</MenuItem>
                </TextField>
              </Stack>

              <Button variant="contained" component={Link} to="/admin/users/add" startIcon={<Add />}>
                {t('admin.addUser')}
              </Button>
            </Stack>

            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Full Name</TableCell>
                    <TableCell>Username / Email</TableCell>
                    <TableCell>Role</TableCell>
                    <TableCell>School / Grade</TableCell>
                    <TableCell>Active</TableCell>
                    <TableCell align="right">{t('common.actions')}</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {users.map((u) => {
                    const isSelf = Number(u.id) === Number(currentUser?.id);
                    return (
                      <TableRow key={u.id}>
                        <TableCell sx={{ fontWeight: 600 }}>{u.full_name}</TableCell>
                        <TableCell>
                          @{u.username}
                          <Typography variant="caption" display="block" color="text.secondary">
                            {u.email}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <TextField
                            select
                            size="small"
                            value={u.role}
                            disabled={isSelf}
                            onChange={(e) => handleRoleChange(u, e.target.value)}
                            inputProps={{ 'aria-label': `Role for ${u.username}` }}
                          >
                            <MenuItem value="student">student</MenuItem>
                            <MenuItem value="teacher">teacher</MenuItem>
                            <MenuItem value="admin">admin</MenuItem>
                          </TextField>
                        </TableCell>
                        <TableCell>
                          {u.school_name || '—'} {u.class_grade ? `(${u.class_grade})` : ''}
                        </TableCell>
                        <TableCell>
                          <Switch
                            size="small"
                            checked={Boolean(u.is_active)}
                            disabled={isSelf}
                            onChange={() => handleToggleUserActive(u)}
                            inputProps={{ 'aria-label': `Active toggle for ${u.username}` }}
                          />
                        </TableCell>
                        <TableCell align="right">
                          {!isSelf && (
                            <IconButton
                              color="error"
                              size="small"
                              aria-label={`Delete user ${u.username}`}
                              onClick={() => setDeleteUserTarget(u)}
                            >
                              <Delete fontSize="small" />
                            </IconButton>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          </CardContent>
        </Card>
      )}

      {tab === 2 && (
        <Card className="glass-panel">
          <CardContent>
            <Stack direction="row" justifyContent="space-between" alignItems="center" mb={2}>
              <Typography variant="h6" fontWeight={800}>
                {t('admin.tabCourses')} ({courses.length})
              </Typography>
              <Button variant="contained" component={Link} to="/teacher/courses/add" startIcon={<Add />}>
                {t('admin.addCourse')}
              </Button>
            </Stack>

            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Course Title</TableCell>
                    <TableCell>Category</TableCell>
                    <TableCell>Language</TableCell>
                    <TableCell>Lessons</TableCell>
                    <TableCell align="right">{t('common.actions')}</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {courses.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell sx={{ fontWeight: 700 }}>{c.title}</TableCell>
                      <TableCell>{c.category || '—'}</TableCell>
                      <TableCell>{(c.language || 'en').toUpperCase()}</TableCell>
                      <TableCell>{c.lesson_count ?? 0}</TableCell>
                      <TableCell align="right">
                        <Button size="small" component={Link} to={`/courses/${c.id}`} startIcon={<Visibility />}>
                          View
                        </Button>
                        <Button
                          size="small"
                          component={Link}
                          to={`/teacher/courses/edit/${c.id}`}
                          startIcon={<Edit />}
                        >
                          {t('common.edit')}
                        </Button>
                        <IconButton
                          color="error"
                          size="small"
                          aria-label={`Delete course ${c.title}`}
                          onClick={() => setDeleteCourseTarget(c)}
                        >
                          <Delete fontSize="small" />
                        </IconButton>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </CardContent>
        </Card>
      )}

      {tab === 3 && (
        <Box>
          {health && (
            <Alert severity={health.status === 'ok' ? 'success' : 'error'} sx={{ mb: 3 }}>
              System Health: <strong>{String(health.status).toUpperCase()}</strong> • Database:{' '}
              <strong>{health.database?.status || health.database || 'connected'}</strong>
            </Alert>
          )}

          <Card className="glass-panel">
            <CardContent>
              <Stack direction="row" justifyContent="space-between" alignItems="center" mb={2} flexWrap="wrap" gap={1}>
                <Box>
                  <Typography variant="h6" fontWeight={800}>
                    {t('admin.tabBackups')}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Atomic SQLite snapshots generated safely via VACUUM INTO.
                  </Typography>
                </Box>
                <Button
                  variant="contained"
                  startIcon={<Backup />}
                  disabled={creatingBackup}
                  onClick={handleCreateBackup}
                >
                  {creatingBackup ? 'Creating Snapshot...' : t('admin.createBackup')}
                </Button>
              </Stack>

              {backups.length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                  No backups created yet. Click &ldquo;{t('admin.createBackup')}&rdquo; to generate a verified database snapshot.
                </Typography>
              ) : (
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Backup File</TableCell>
                      <TableCell>Size</TableCell>
                      <TableCell>Created At</TableCell>
                      <TableCell align="right">{t('admin.verifyBackup')}</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {backups.map((b) => {
                      const fname = b.filename || b.fileName;
                      return (
                        <TableRow key={fname}>
                          <TableCell sx={{ fontFamily: 'monospace' }}>{fname}</TableCell>
                          <TableCell>{((b.sizeBytes || 0) / 1024).toFixed(1)} KB</TableCell>
                          <TableCell>{new Date(b.createdAt).toLocaleString()}</TableCell>
                          <TableCell align="right">
                            <Button
                              size="small"
                              variant="outlined"
                              startIcon={<VerifiedUser />}
                              onClick={() => handleValidateBackup(fname)}
                            >
                              {t('admin.verifyBackup')}
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </Box>
      )}

      <ConfirmDialog
        open={Boolean(deleteUserTarget)}
        title="Delete User Account?"
        message={`Are you sure you want to delete user "${deleteUserTarget?.full_name}" (@${deleteUserTarget?.username})?`}
        confirmLabel={t('common.delete')}
        onConfirm={handleConfirmDeleteUser}
        onCancel={() => setDeleteUserTarget(null)}
      />

      <ConfirmDialog
        open={Boolean(deleteCourseTarget)}
        title="Delete Course?"
        message={`Are you sure you want to delete "${deleteCourseTarget?.title}" and all associated lessons?`}
        confirmLabel={t('common.delete')}
        onConfirm={handleConfirmDeleteCourse}
        onCancel={() => setDeleteCourseTarget(null)}
      />
    </Container>
  );
};

export default AdminDashboard;
