import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  Container,
  Typography,
  Box,
  Card,
  CardContent,
  Button,
  Grid,
  List,
  ListItem,
  ListItemText,
  Chip,
  Stack,
  Alert,
  LinearProgress,
} from '@mui/material';
import {
  Storage,
  Sync,
  DeleteSweep,
  DeleteOutline,
  CloudOff,
  CloudDone,
  PlayArrow,
} from '@mui/icons-material';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { useOffline } from '../context/OfflineContext';
import { useToast } from '../context/ToastContext';
import ConfirmDialog from '../components/ConfirmDialog';
import {
  getOfflineStorageSummary,
  removeOfflineCourse,
  clearOfflineDownloads,
} from '../services/offlineDb';

const formatBytes = (bytes) => {
  const b = Number(bytes || 0);
  if (b === 0) return '0 KB';
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / (1024 * 1024)).toFixed(2)} MB`;
};

const OfflineManager = () => {
  const { user } = useAuth();
  const { t } = useLanguage();
  const { isOffline, syncing, triggerSync, refreshOfflineStatus } = useOffline();
  const { showToast } = useToast();

  const [summary, setSummary] = useState({
    courses: [],
    courseCount: 0,
    mediaCount: 0,
    totalMediaBytes: 0,
    pendingSyncCount: 0,
    failedSyncCount: 0,
    browserQuotaBytes: null,
  });
  const [confirmClearAll, setConfirmClearAll] = useState(false);

  const loadSummary = useCallback(async () => {
    if (!user?.id) return;
    try {
      const data = await getOfflineStorageSummary(user.id);
      setSummary(data);
    } catch (_e) {
      // ignore
    }
  }, [user?.id]);

  useEffect(() => {
    loadSummary();
  }, [loadSummary]);

  const handleSyncNow = async () => {
    if (isOffline) {
      showToast('Device is currently offline. Sync will run automatically when connected.', 'warning');
      return;
    }
    const res = await triggerSync({ forceRetryAll: true });
    await loadSummary();
    if (res) {
      showToast(
        `Synchronization complete (${res.syncedCount} synced, ${res.remainingCount} remaining).`,
        'success'
      );
    }
  };

  const handleRemoveCourse = async (courseId) => {
    if (!user?.id) return;
    await removeOfflineCourse(user.id, courseId);
    await refreshOfflineStatus();
    await loadSummary();
    showToast('Offline course removed.', 'info');
  };

  const handleClearAll = async () => {
    setConfirmClearAll(false);
    if (!user?.id) return;
    await clearOfflineDownloads(user.id);
    await refreshOfflineStatus();
    await loadSummary();
    showToast('All offline downloads cleared. Unsynced progress remains safely queued.', 'info');
  };

  const quotaPct =
    summary.browserQuotaBytes && summary.browserQuotaBytes > 0
      ? Math.min(100, Math.round((summary.totalMediaBytes / summary.browserQuotaBytes) * 100))
      : 0;

  return (
    <Container maxWidth="lg" sx={{ py: 5 }}>
      <Stack direction="row" justifyContent="space-between" alignItems="flex-start" flexWrap="wrap" gap={2} mb={4}>
        <Box>
          <Typography variant="h4" component="h1" fontWeight={800} className="gradient-text" gutterBottom>
            {t('offline.title')}
          </Typography>
          <Typography variant="body1" color="text.secondary">
            {t('offline.subtitle')}
          </Typography>
        </Box>

        <Stack direction="row" spacing={1.5}>
          <Button
            variant="contained"
            startIcon={<Sync />}
            disabled={syncing || isOffline || summary.pendingSyncCount === 0}
            onClick={handleSyncNow}
          >
            {syncing ? 'Syncing...' : t('offline.syncAllBtn')}
          </Button>
          {summary.courses.length > 0 && (
            <Button
              variant="outlined"
              color="error"
              startIcon={<DeleteSweep />}
              onClick={() => setConfirmClearAll(true)}
            >
              {t('offline.clearAllBtn')}
            </Button>
          )}
        </Stack>
      </Stack>

      <Alert
        icon={isOffline ? <CloudOff /> : <CloudDone />}
        severity={isOffline ? 'warning' : 'success'}
        sx={{ mb: 4 }}
      >
        {isOffline
          ? 'Offline Mode Active — Downloaded courses, PDFs, audio, and videos remain accessible without internet.'
          : 'Online — Any offline lesson progress is automatically synchronized with your school server.'}
      </Alert>

      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid item xs={12} sm={4}>
          <Card className="glass-panel">
            <CardContent>
              <Typography variant="body2" color="text.secondary" fontWeight={700}>
                {t('offline.downloadedCourses')}
              </Typography>
              <Typography variant="h3" fontWeight={800} color="primary" sx={{ mt: 1 }}>
                {summary.courseCount}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {summary.mediaCount} cached media files
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={4}>
          <Card className="glass-panel">
            <CardContent>
              <Typography variant="body2" color="text.secondary" fontWeight={700}>
                {t('offline.storageUsed')}
              </Typography>
              <Typography variant="h3" fontWeight={800} sx={{ color: '#0284c7', mt: 1 }}>
                {formatBytes(summary.totalMediaBytes)}
              </Typography>
              {summary.browserQuotaBytes && (
                <LinearProgress variant="determinate" value={quotaPct} sx={{ mt: 1, borderRadius: 2 }} />
              )}
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={4}>
          <Card className="glass-panel">
            <CardContent>
              <Typography variant="body2" color="text.secondary" fontWeight={700}>
                {t('offline.queuedUpdates')}
              </Typography>
              <Typography variant="h3" fontWeight={800} sx={{ color: '#059669', mt: 1 }}>
                {summary.pendingSyncCount}
              </Typography>
              {summary.failedSyncCount > 0 && (
                <Typography variant="caption" color="error">
                  {summary.failedSyncCount} awaiting retry
                </Typography>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Card className="glass-panel">
        <CardContent>
          <Typography variant="h6" fontWeight={800} gutterBottom>
            {t('offline.downloadedCourses')}
          </Typography>

          {summary.courses.length === 0 ? (
            <Box sx={{ py: 4, textAlign: 'center' }}>
              <Storage sx={{ fontSize: 48, color: 'text.secondary', opacity: 0.4, mb: 1 }} />
              <Typography color="text.secondary" gutterBottom>
                {t('offline.noOfflineCourses')}
              </Typography>
              <Button variant="contained" component={Link} to="/courses" sx={{ mt: 1 }}>
                {t('dashboard.browseCatalog')}
              </Button>
            </Box>
          ) : (
            <List disablePadding>
              {summary.courses.map((item, idx) => (
                <ListItem
                  key={item.courseId}
                  divider={idx < summary.courses.length - 1}
                  sx={{ py: 2, display: 'flex', flexWrap: 'wrap', gap: 1.5 }}
                >
                  <ListItemText
                    sx={{ flex: '1 1 220px' }}
                    primary={
                      <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                        <Typography fontWeight={700}>{item.course?.title}</Typography>
                        <Chip size="small" label={`${item.lessonCount || 0} Lessons`} variant="outlined" />
                        <Chip size="small" label={formatBytes(item.downloadedBytes)} color="primary" variant="outlined" />
                      </Stack>
                    }
                    secondary={`Saved: ${new Date(item.downloadedAt).toLocaleString()}`}
                  />
                  <Stack direction="row" spacing={1}>
                    <Button
                      size="small"
                      variant="contained"
                      component={Link}
                      to={`/courses/${item.courseId}`}
                      startIcon={<PlayArrow />}
                    >
                      Open Course
                    </Button>
                    <Button
                      size="small"
                      variant="outlined"
                      color="error"
                      startIcon={<DeleteOutline />}
                      onClick={() => handleRemoveCourse(item.courseId)}
                    >
                      Remove
                    </Button>
                  </Stack>
                </ListItem>
              ))}
            </List>
          )}
        </CardContent>
      </Card>

      <ConfirmDialog
        open={confirmClearAll}
        title={t('offline.clearConfirmTitle')}
        message={t('offline.clearConfirmText')}
        confirmLabel={t('common.confirm')}
        onConfirm={handleClearAll}
        onCancel={() => setConfirmClearAll(false)}
      />
    </Container>
  );
};

export default OfflineManager;
