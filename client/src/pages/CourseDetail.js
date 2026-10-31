import React, { useState, useEffect, useCallback } from 'react';
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
  ListItemIcon,
  ListItemText,
  Chip,
  Skeleton,
  LinearProgress,
  Alert,
  Stack,
  Divider,
  FormControlLabel,
  Switch,
  TextField,
  Grid,
  IconButton,
} from '@mui/material';
import {
  PlayCircleOutline,
  CheckCircle,
  Description,
  Quiz,
  ArrowBack,
  CloudDownload,
  DeleteOutline,
  OfflinePin,
  GraphicEq,
  WorkspacePremium,
  UploadFile,
  Download,
  Edit,
  Add,
} from '@mui/icons-material';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { usePreferences } from '../context/PreferencesContext';
import { useOffline } from '../context/OfflineContext';
import { useToast } from '../context/ToastContext';
import { resolveEntityTranslation, getLanguageDisplayName } from '../i18n/translations';
import {
  downloadCourseForOffline,
  getOfflineCourseBundle,
  getOfflineProgressForUser,
  removeOfflineCourse,
  saveMediaBlobOffline,
  hasOfflineMedia,
  getOfflineMediaObjectUrl,
} from '../services/offlineDb';

const formatBytes = (bytes) => {
  const b = Number(bytes || 0);
  if (!b) return '';
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / (1024 * 1024)).toFixed(2)} MB`;
};

const CourseDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { language, t } = useLanguage();
  const { lowBandwidthMode } = usePreferences();
  const { isOffline, refreshOfflineStatus } = useOffline();
  const { showToast } = useToast();

  const [course, setCourse] = useState(null);
  const [progress, setProgress] = useState([]);
  const [materials, setMaterials] = useState([]);
  const [assessments, setAssessments] = useState([]);
  const [certificateInfo, setCertificateInfo] = useState(null);
  const [enrolled, setEnrolled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [enrolling, setEnrolling] = useState(false);

  const [isDownloadedOffline, setIsDownloadedOffline] = useState(false);
  const [includeVideosOffline, setIncludeVideosOffline] = useState(!lowBandwidthMode);
  const [downloadProgress, setDownloadProgress] = useState(null);
  const [cachedMaterialMap, setCachedMaterialMap] = useState({});

  const [showMaterialForm, setShowMaterialForm] = useState(false);
  const [matTitle, setMatTitle] = useState('');
  const [matDesc, setMatDesc] = useState('');
  const [matFile, setMatFile] = useState(null);
  const [uploadingMat, setUploadingMat] = useState(false);

  const canManageCourse =
    user &&
    (user.role === 'admin' ||
      (user.role === 'teacher' && Number(course?.created_by) === Number(user.id)));

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const courseRes = await axios.get(`/api/courses/${id}`);
      const courseData = courseRes.data.course;
      setCourse(courseData);

      let isStudentEnrolled = user?.role !== 'student';
      if (user?.id && user?.role === 'student') {
        const enrollRes = await axios.get(`/api/users/${user.id}/enrollments`);
        const enrollList = enrollRes.data.enrollments || [];
        isStudentEnrolled = enrollList.some((e) => Number(e.course_id) === Number(id));
      }
      setEnrolled(isStudentEnrolled);

      const progRes = await axios.get('/api/progress', { params: { course_id: id } });
      setProgress(progRes.data.progress || []);

      if (isStudentEnrolled || user?.role === 'admin' || Number(courseData.created_by) === Number(user?.id)) {
        const [matsRes, examsRes] = await Promise.all([
          axios.get('/api/materials', { params: { course_id: id } }).catch(() => ({ data: { materials: [] } })),
          axios.get('/api/assessments/exams', { params: { course_id: id } }).catch(() => ({ data: { exams: [] } })),
        ]);
        const mats = matsRes.data.materials || [];
        setMaterials(mats);
        setAssessments(examsRes.data.exams || courseData.course_assessments || []);

        if (user?.id) {
          const matStatus = {};
          for (const m of mats) {
            matStatus[m.id] = await hasOfflineMedia(user.id, m.file_url);
          }
          setCachedMaterialMap(matStatus);
        }
      } else {
        setMaterials([]);
        setAssessments(courseData.course_assessments || []);
      }

      if (user?.role === 'student') {
        const eligRes = await axios.get(`/api/certificates/eligibility/${id}`).catch(() => ({ data: null }));
        setCertificateInfo(eligRes.data);
      }

      if (user?.id) {
        const offlineBundle = await getOfflineCourseBundle(user.id, Number(id));
        setIsDownloadedOffline(Boolean(offlineBundle && !offlineBundle.isPartialCache));
      }
    } catch (_error) {
      // Offline fallback from IndexedDB
      if (user?.id) {
        const offlineBundle = await getOfflineCourseBundle(user.id, Number(id));
        const offlineProg = await getOfflineProgressForUser(user.id, { courseId: Number(id) });
        if (offlineBundle) {
          setCourse({
            ...offlineBundle.course,
            lessons: offlineBundle.lessons || [],
          });
          setMaterials(offlineBundle.materials || []);
          setProgress(offlineProg || []);
          setEnrolled(true);
          setIsDownloadedOffline(true);
        } else {
          setCourse(null);
        }
      }
    } finally {
      setLoading(false);
    }
  }, [id, user]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleEnroll = async () => {
    if (!user?.id) return;
    setEnrolling(true);
    try {
      await axios.post(`/api/users/${user.id}/enrollments`, { course_id: Number(id) });
      setEnrolled(true);
      showToast('Enrolled in course successfully!', 'success');
      loadData();
    } catch (error) {
      showToast(error.response?.data?.message || 'Failed to enroll', 'error');
    } finally {
      setEnrolling(false);
    }
  };

  const handleDownloadCourseOffline = async () => {
    if (!user?.id) return;
    setDownloadProgress({ percent: 2, label: 'Preparing offline package...' });
    try {
      if (user.role === 'student' && !enrolled) {
        await axios.post(`/api/users/${user.id}/enrollments`, { course_id: Number(id) }).catch(() => {});
        setEnrolled(true);
      }

      await downloadCourseForOffline(user.id, Number(id), {
        includeVideo: includeVideosOffline,
        lowBandwidth: lowBandwidthMode,
        onProgress: (info) => setDownloadProgress(info),
      });
      setIsDownloadedOffline(true);
      await refreshOfflineStatus();
      showToast('Course downloaded for offline study!', 'success');
    } catch (error) {
      showToast(error.response?.data?.message || 'Offline download failed', 'error');
    } finally {
      setDownloadProgress(null);
    }
  };

  const handleRemoveOfflineCopy = async () => {
    if (!user?.id) return;
    await removeOfflineCourse(user.id, Number(id));
    setIsDownloadedOffline(false);
    await refreshOfflineStatus();
    showToast('Offline copy removed from device storage.', 'info');
  };

  const handleSaveMaterialOffline = async (mat) => {
    if (!user?.id) return;
    try {
      await saveMediaBlobOffline(user.id, {
        canonicalUrl: mat.file_url,
        downloadUrl: mat.file_url_signed || mat.file_url,
        courseId: Number(id),
        lessonId: mat.lesson_id || null,
      });
      setCachedMaterialMap((prev) => ({ ...prev, [mat.id]: true }));
      showToast(`Saved "${mat.title}" for offline access.`, 'success');
    } catch (_e) {
      showToast('Could not save resource offline.', 'error');
    }
  };

  const handleOpenMaterial = async (mat) => {
    if (user?.id) {
      const objUrl = await getOfflineMediaObjectUrl(user.id, mat.file_url);
      if (objUrl) {
        window.open(objUrl, '_blank', 'noopener,noreferrer');
        return;
      }
    }
    const base = mat.file_url_signed || mat.file_url;
    const target = base.includes('?') ? `${base}&download=1` : `${base}?download=1`;
    window.open(target, '_blank', 'noopener,noreferrer');
  };

  const handleUploadMaterial = async (e) => {
    e.preventDefault();
    if (!matFile || !matTitle.trim()) {
      showToast('Please enter a title and choose a file.', 'warning');
      return;
    }
    setUploadingMat(true);
    try {
      const fd = new FormData();
      fd.append('file', matFile);
      const uploadRes = await axios.post('/api/upload', fd);

      await axios.post('/api/materials', {
        course_id: Number(id),
        title: matTitle.trim(),
        description: matDesc.trim(),
        file_url: uploadRes.data.url,
        material_type: uploadRes.data.category || 'document',
        mime_type: uploadRes.data.mime_type,
        file_size_bytes: uploadRes.data.size_bytes,
      });

      setMatTitle('');
      setMatDesc('');
      setMatFile(null);
      setShowMaterialForm(false);
      showToast('Learning material uploaded!', 'success');
      loadData();
    } catch (error) {
      showToast(error.response?.data?.message || 'Material upload failed', 'error');
    } finally {
      setUploadingMat(false);
    }
  };

  const handleDeleteMaterial = async (matId) => {
    try {
      await axios.delete(`/api/materials/${matId}`);
      showToast('Material removed.', 'info');
      loadData();
    } catch (error) {
      showToast(error.response?.data?.message || 'Failed to delete material', 'error');
    }
  };

  const handleGenerateCertificate = async () => {
    try {
      const res = await axios.post('/api/certificates/generate', { course_id: Number(id) });
      const cert = res.data.certificate;
      showToast('Certificate issued!', 'success');
      navigate('/certificates', { state: { highlightCode: cert.certificate_code } });
    } catch (error) {
      showToast(error.response?.data?.message || 'Eligibility criteria not met yet.', 'warning');
    }
  };

  const getLessonStatus = (lessonId) => {
    const lp = progress.find((p) => Number(p.lesson_id) === Number(lessonId));
    return lp ? lp.completion_status : 'not_started';
  };

  const getLessonIcon = (lesson) => {
    const status = getLessonStatus(lesson.id);
    const lType = lesson.lesson_type || lesson.content_type;
    if (status === 'completed') return <CheckCircle color="success" />;
    if (lType === 'audio' || lesson.audio_url) return <GraphicEq color="primary" />;
    if (lType === 'pdf' || lesson.pdf_url) return <Description color="primary" />;
    if (lType === 'quiz') return <Quiz color="primary" />;
    return <PlayCircleOutline color="primary" />;
  };

  if (loading) {
    return (
      <Container maxWidth="lg" sx={{ py: 5 }}>
        <Skeleton variant="text" width={160} height={36} sx={{ mb: 2 }} />
        <Skeleton variant="rounded" height={220} sx={{ mb: 4 }} />
        <Skeleton variant="rounded" height={320} />
      </Container>
    );
  }

  if (!course) {
    return (
      <Container maxWidth="md" sx={{ py: 6 }}>
        <Card className="glass-panel" sx={{ p: 4, textAlign: 'center' }}>
          <Typography variant="h6" gutterBottom>
            {isOffline
              ? 'This course has not been downloaded for offline study yet.'
              : 'Course not found.'}
          </Typography>
          <Button variant="contained" onClick={() => navigate('/courses')} sx={{ mt: 2 }}>
            {t('courses.backToCourses')}
          </Button>
        </Card>
      </Container>
    );
  }

  const localizedCourse = resolveEntityTranslation(course, language);
  const lessons = course.lessons || [];
  const completedCount = lessons.filter((l) => getLessonStatus(l.id) === 'completed').length;
  const overallProgress = lessons.length > 0 ? Math.round((completedCount / lessons.length) * 100) : 0;

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" mb={2} flexWrap="wrap" gap={1}>
        <Button startIcon={<ArrowBack />} onClick={() => navigate('/courses')}>
          {t('courses.backToCourses')}
        </Button>

        {canManageCourse && !isOffline && (
          <Stack direction="row" spacing={1}>
            <Button
              variant="outlined"
              size="small"
              component={Link}
              to={`/teacher/courses/edit/${course.id}`}
              startIcon={<Edit />}
            >
              {t('common.edit')}
            </Button>
            <Button
              variant="contained"
              size="small"
              component={Link}
              to={`/teacher/courses/${course.id}/lessons/add`}
              startIcon={<Add />}
            >
              Add Lesson
            </Button>
          </Stack>
        )}
      </Stack>

      {localizedCourse.isOriginalFallback && (
        <Alert severity="info" sx={{ mb: 2.5 }}>
          {t('courses.originalLanguageNotice', {
            lang: getLanguageDisplayName(localizedCourse.activeLanguage),
          })}
        </Alert>
      )}

      {/* Course Overview Card */}
      <Card className="glass-panel" sx={{ mb: 4 }}>
        <CardContent sx={{ p: { xs: 2.5, sm: 4 } }}>
          <Stack direction="row" spacing={1} flexWrap="wrap" mb={2}>
            {course.category && <Chip label={course.category} color="primary" size="small" />}
            <Chip label={getLanguageDisplayName(localizedCourse.activeLanguage)} variant="outlined" size="small" />
            {isDownloadedOffline && (
              <Chip icon={<OfflinePin />} label={t('courses.courseSavedOffline')} color="success" size="small" />
            )}
          </Stack>

          <Typography variant="h4" component="h1" fontWeight={800} gutterBottom>
            {localizedCourse.title}
          </Typography>

          <Typography variant="body1" color="text.secondary" sx={{ mb: 3, lineHeight: 1.7 }}>
            {localizedCourse.description}
          </Typography>

          <Box sx={{ mb: 3 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.75 }}>
              <Typography variant="body2" fontWeight={700}>
                {t('dashboard.progress')} ({completedCount}/{lessons.length})
              </Typography>
              <Typography variant="body2" fontWeight={700}>
                {overallProgress}%
              </Typography>
            </Box>
            <LinearProgress
              variant="determinate"
              value={overallProgress}
              aria-label={`Course completion ${overallProgress}%`}
              sx={{ height: 10, borderRadius: 5 }}
            />
          </Box>

          <Divider sx={{ my: 2.5 }} />
          <Stack
            direction={{ xs: 'column', md: 'row' }}
            spacing={2}
            justifyContent="space-between"
            alignItems={{ xs: 'stretch', md: 'center' }}
          >
            <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap">
              {user?.role === 'student' && !enrolled && !isOffline && (
                <Button
                  variant="contained"
                  onClick={handleEnroll}
                  disabled={enrolling}
                  sx={{ fontWeight: 700 }}
                >
                  {enrolling ? t('courses.enrolling') : t('courses.enrollNow')}
                </Button>
              )}
              {enrolled && user?.role === 'student' && (
                <Chip icon={<CheckCircle />} label={t('courses.enrolledBadge')} color="success" variant="outlined" />
              )}

              {certificateInfo?.eligible && (
                <Button
                  variant="contained"
                  color="success"
                  startIcon={<WorkspacePremium />}
                  onClick={handleGenerateCertificate}
                  sx={{ fontWeight: 700 }}
                >
                  {certificateInfo.existing_certificate ? 'View Certificate' : t('certificates.claimCertificate')}
                </Button>
              )}
            </Stack>

            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems={{ xs: 'stretch', sm: 'center' }}>
              {!isOffline && (
                <FormControlLabel
                  control={
                    <Switch
                      size="small"
                      checked={includeVideosOffline}
                      onChange={(e) => setIncludeVideosOffline(e.target.checked)}
                    />
                  }
                  label={<Typography variant="caption">{t('courses.includeVideosOption')}</Typography>}
                />
              )}

              {!isOffline && (
                <Button
                  variant={isDownloadedOffline ? 'outlined' : 'contained'}
                  color="primary"
                  startIcon={<CloudDownload />}
                  disabled={Boolean(downloadProgress)}
                  onClick={handleDownloadCourseOffline}
                >
                  {downloadProgress
                    ? t('courses.downloadingCourse', { percent: downloadProgress.percent })
                    : isDownloadedOffline
                      ? 'Refresh Offline Copy'
                      : t('courses.downloadCourseOffline')}
                </Button>
              )}

              {isDownloadedOffline && (
                <Button
                  variant="text"
                  color="error"
                  size="small"
                  startIcon={<DeleteOutline />}
                  onClick={handleRemoveOfflineCopy}
                >
                  {t('courses.removeOfflineCopy')}
                </Button>
              )}
            </Stack>
          </Stack>

          {downloadProgress && (
            <Box sx={{ mt: 2 }}>
              <Typography variant="caption" color="text.secondary">
                {downloadProgress.label} ({downloadProgress.percent}%)
              </Typography>
              <LinearProgress variant="determinate" value={downloadProgress.percent} sx={{ mt: 0.5, borderRadius: 3 }} />
            </Box>
          )}
        </CardContent>
      </Card>

      {user?.role === 'student' && !enrolled && !isOffline && (
        <Alert severity="info" sx={{ mb: 3 }}>
          {t('courses.enrollToUnlock')}
        </Alert>
      )}

      {/* Lessons Curriculum */}
      <Typography variant="h5" component="h2" fontWeight={800} gutterBottom sx={{ mb: 2 }}>
        {t('courses.curriculum')} ({lessons.length})
      </Typography>

      {lessons.length === 0 ? (
        <Card className="glass-panel" sx={{ p: 3, mb: 4 }}>
          <Typography color="text.secondary">No lessons added to this course yet.</Typography>
        </Card>
      ) : (
        <Card className="glass-panel" sx={{ mb: 4 }}>
          <List disablePadding>
            {lessons.map((lesson, index) => {
              const status = getLessonStatus(lesson.id);
              const localizedLesson = resolveEntityTranslation(lesson, language);
              const lType = lesson.lesson_type || lesson.content_type || 'text';
              const mins = lesson.duration_minutes ?? lesson.duration ?? 0;

              return (
                <ListItem
                  key={lesson.id}
                  divider={index < lessons.length - 1}
                  sx={{
                    py: 2,
                    px: { xs: 2, sm: 3 },
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: 1.5,
                    bgcolor: status === 'completed' ? 'rgba(5, 150, 105, 0.05)' : 'transparent',
                  }}
                >
                  <ListItemIcon sx={{ minWidth: 38 }}>{getLessonIcon(lesson)}</ListItemIcon>
                  <ListItemText
                    sx={{ flex: '1 1 220px' }}
                    primary={
                      <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                        <Typography variant="subtitle1" fontWeight={700}>
                          {index + 1}. {localizedLesson.title}
                        </Typography>
                        <Chip label={lType.toUpperCase()} size="small" variant="outlined" />
                        {status === 'completed' && (
                          <Chip label="Completed" size="small" color="success" />
                        )}
                      </Stack>
                    }
                    secondary={mins > 0 ? `Estimated time: ${mins} min` : lesson.description}
                  />
                  <Stack direction="row" spacing={1}>
                    {canManageCourse && !isOffline && (
                      <Button
                        size="small"
                        variant="text"
                        component={Link}
                        to={`/teacher/lessons/edit/${lesson.id}`}
                      >
                        {t('common.edit')}
                      </Button>
                    )}
                    <Button
                      variant={status === 'completed' ? 'outlined' : 'contained'}
                      size="small"
                      disabled={user?.role === 'student' && !enrolled}
                      component={Link}
                      to={`/lessons/${lesson.id}`}
                      sx={{ fontWeight: 700, textTransform: 'none' }}
                    >
                      {status === 'completed' ? 'Review Lesson' : 'Open Lesson'}
                    </Button>
                  </Stack>
                </ListItem>
              );
            })}
          </List>
        </Card>
      )}

      {/* Course Assessments Section */}
      {(assessments.length > 0 || canManageCourse) && (
        <Box sx={{ mb: 4 }}>
          <Stack direction="row" justifyContent="space-between" alignItems="center" mb={2}>
            <Typography variant="h5" component="h2" fontWeight={800}>
              {t('courses.courseAssessments')} ({assessments.length})
            </Typography>
            <Button
              size="small"
              variant="outlined"
              component={Link}
              to={`/assessments?courseId=${course.id}`}
              startIcon={<Quiz />}
            >
              Open Assessments Workspace
            </Button>
          </Stack>

          {assessments.length === 0 ? (
            <Card className="glass-panel" sx={{ p: 3 }}>
              <Typography variant="body2" color="text.secondary">
                No exams published for this course yet.
              </Typography>
            </Card>
          ) : (
            <Grid container spacing={2}>
              {assessments.map((exam) => (
                <Grid item xs={12} md={6} key={exam.id}>
                  <Card className="glass-panel">
                    <CardContent>
                      <Typography variant="h6" fontWeight={700} gutterBottom>
                        {exam.title}
                      </Typography>
                      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
                        {exam.description || 'Graded course assessment'}
                      </Typography>
                      <Stack direction="row" spacing={1} flexWrap="wrap" mb={2}>
                        <Chip size="small" label={`${exam.total_marks} Marks`} />
                        <Chip size="small" label={`Pass: ${exam.passing_percentage}%`} />
                        {exam.time_limit_minutes && <Chip size="small" label={`${exam.time_limit_minutes} min`} />}
                      </Stack>
                      <Button
                        variant="contained"
                        size="small"
                        disabled={user?.role === 'student' && !enrolled}
                        component={Link}
                        to={`/assessments?courseId=${course.id}`}
                      >
                        {user?.role === 'student' ? t('assessments.startAssessment') : 'Manage / View Results'}
                      </Button>
                    </CardContent>
                  </Card>
                </Grid>
              ))}
            </Grid>
          )}
        </Box>
      )}

      {/* Learning Materials Section */}
      {(enrolled || canManageCourse) && (
        <Box sx={{ mb: 4 }}>
          <Stack direction="row" justifyContent="space-between" alignItems="center" mb={2}>
            <Typography variant="h5" component="h2" fontWeight={800}>
              {t('courses.materials')} ({materials.length})
            </Typography>
            {canManageCourse && !isOffline && (
              <Button
                size="small"
                variant="contained"
                startIcon={<UploadFile />}
                onClick={() => setShowMaterialForm((s) => !s)}
              >
                {showMaterialForm ? t('common.cancel') : 'Upload Resource'}
              </Button>
            )}
          </Stack>

          {showMaterialForm && (
            <Card className="glass-panel" sx={{ p: 3, mb: 3 }} component="form" onSubmit={handleUploadMaterial}>
              <Typography variant="subtitle1" fontWeight={700} gutterBottom>
                Upload Downloadable Study Material (PDF, Audio, Image, Video, Worksheet)
              </Typography>
              <Grid container spacing={2}>
                <Grid item xs={12} sm={6}>
                  <TextField
                    fullWidth
                    size="small"
                    label="Resource Title"
                    value={matTitle}
                    onChange={(e) => setMatTitle(e.target.value)}
                    required
                  />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <Button variant="outlined" component="label" fullWidth sx={{ height: 40 }}>
                    {matFile ? matFile.name : 'Choose File'}
                    <input
                      type="file"
                      hidden
                      accept=".pdf,.mp3,.wav,.ogg,.m4a,.mp4,.webm,.jpg,.jpeg,.png,.webp,.txt,.csv"
                      onChange={(e) => setMatFile(e.target.files?.[0] || null)}
                    />
                  </Button>
                </Grid>
                <Grid item xs={12}>
                  <TextField
                    fullWidth
                    size="small"
                    label="Description (optional)"
                    value={matDesc}
                    onChange={(e) => setMatDesc(e.target.value)}
                  />
                </Grid>
                <Grid item xs={12}>
                  <Button type="submit" variant="contained" disabled={uploadingMat}>
                    {uploadingMat ? 'Uploading...' : 'Save Resource'}
                  </Button>
                </Grid>
              </Grid>
            </Card>
          )}

          {materials.length === 0 ? (
            <Card className="glass-panel" sx={{ p: 3 }}>
              <Typography variant="body2" color="text.secondary">
                No supplemental resources uploaded for this course yet.
              </Typography>
            </Card>
          ) : (
            <Card className="glass-panel">
              <List disablePadding>
                {materials.map((mat, idx) => (
                  <ListItem
                    key={mat.id}
                    divider={idx < materials.length - 1}
                    sx={{ py: 1.75, display: 'flex', flexWrap: 'wrap', gap: 1 }}
                  >
                    <ListItemText
                      sx={{ flex: '1 1 220px' }}
                      primary={
                        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                          <Typography fontWeight={700}>{mat.title}</Typography>
                          <Chip size="small" label={(mat.material_type || 'file').toUpperCase()} variant="outlined" />
                          {mat.file_size_bytes > 0 && (
                            <Typography variant="caption" color="text.secondary">
                              ({formatBytes(mat.file_size_bytes)})
                            </Typography>
                          )}
                          {cachedMaterialMap[mat.id] && (
                            <Chip size="small" color="success" icon={<OfflinePin />} label={t('lesson.savedOfflineBadge')} />
                          )}
                        </Stack>
                      }
                      secondary={mat.description}
                    />
                    <Stack direction="row" spacing={1}>
                      {!cachedMaterialMap[mat.id] && !isOffline && (
                        <Button size="small" variant="outlined" onClick={() => handleSaveMaterialOffline(mat)}>
                          {t('lesson.saveOfflineBtn')}
                        </Button>
                      )}
                      <Button
                        size="small"
                        variant="contained"
                        startIcon={<Download />}
                        onClick={() => handleOpenMaterial(mat)}
                      >
                        {t('lesson.downloadFileBtn')}
                      </Button>
                      {canManageCourse && !isOffline && (
                        <IconButton
                          color="error"
                          size="small"
                          aria-label={`Delete material ${mat.title}`}
                          onClick={() => handleDeleteMaterial(mat.id)}
                        >
                          <DeleteOutline fontSize="small" />
                        </IconButton>
                      )}
                    </Stack>
                  </ListItem>
                ))}
              </List>
            </Card>
          )}
        </Box>
      )}
    </Container>
  );
};

export default CourseDetail;
