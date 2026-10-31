import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Container,
  Typography,
  Box,
  Card,
  CardContent,
  Button,
  Skeleton,
  Alert,
  Radio,
  RadioGroup,
  FormControlLabel,
  FormControl,
  FormLabel,
  Paper,
  Chip,
  Stack,
  LinearProgress,
} from '@mui/material';
import {
  ArrowBack,
  CheckCircle,
  Download,
  CloudDownload,
  OfflinePin,
} from '@mui/icons-material';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { usePreferences } from '../context/PreferencesContext';
import { useOffline } from '../context/OfflineContext';
import { useToast } from '../context/ToastContext';
import { resolveEntityTranslation, getLanguageDisplayName } from '../i18n/translations';
import AudioLessonPlayer from '../components/AudioLessonPlayer';
import {
  cacheOpenedLesson,
  getOfflineLesson,
  getOfflineProgressForUser,
  recordLessonProgressWithOfflineSupport,
  getOfflineMediaObjectUrl,
  hasOfflineMedia,
  saveMediaBlobOffline,
} from '../services/offlineDb';

const LessonDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { language, t } = useLanguage();
  const { lowBandwidthMode } = usePreferences();
  const { isOffline, refreshOfflineStatus } = useOffline();
  const { showToast } = useToast();

  const [lesson, setLesson] = useState(null);
  const [progress, setProgress] = useState(null);
  const [loading, setLoading] = useState(true);
  const [inlineAnswers, setInlineAnswers] = useState({});
  const [inlineResults, setInlineResults] = useState({});

  const [videoOfflineUrl, setVideoOfflineUrl] = useState(null);
  const [pdfOfflineUrl, setPdfOfflineUrl] = useState(null);
  const [imageOfflineUrl, setImageOfflineUrl] = useState(null);
  const [videoSavedOffline, setVideoSavedOffline] = useState(false);
  const [pdfSavedOffline, setPdfSavedOffline] = useState(false);
  const [savingMediaPct, setSavingMediaPct] = useState(null);
  const [videoLoadApproved, setVideoLoadApproved] = useState(!lowBandwidthMode);

  const studyStartRef = useRef(Date.now());

  const loadLesson = useCallback(async () => {
    setLoading(true);
    studyStartRef.current = Date.now();
    try {
      const lessonRes = await axios.get(`/api/lessons/${id}`);
      const lessonData = lessonRes.data.lesson;
      setLesson(lessonData);

      if (user?.id) {
        await cacheOpenedLesson(user.id, lessonData, null).catch(() => {});
      }

      const progRes = await axios.get('/api/progress', {
        params: { course_id: lessonData.course_id, lesson_id: id },
      });
      const lp = (progRes.data.progress || [])[0] || null;
      if (lp) setProgress(lp);
    } catch (_err) {
      if (user?.id) {
        const cachedLesson = await getOfflineLesson(user.id, Number(id));
        if (cachedLesson) {
          setLesson(cachedLesson);
          const offlineProg = await getOfflineProgressForUser(user.id, {
            courseId: cachedLesson.course_id,
            lessonId: Number(id),
          });
          if (offlineProg[0]) setProgress(offlineProg[0]);
        } else {
          setLesson(null);
        }
      }
    } finally {
      setLoading(false);
    }
  }, [id, user?.id]);

  useEffect(() => {
    loadLesson();
  }, [loadLesson]);

  useEffect(() => {
    let active = true;
    const loadOfflineBlobs = async () => {
      if (!user?.id || !lesson) return;
      if (lesson.video_url) {
        const hasVid = await hasOfflineMedia(user.id, lesson.video_url);
        if (active) setVideoSavedOffline(hasVid);
        if (hasVid) {
          const u = await getOfflineMediaObjectUrl(user.id, lesson.video_url);
          if (active && u) {
            setVideoOfflineUrl(u);
            setVideoLoadApproved(true);
          }
        }
      }
      if (lesson.pdf_url) {
        const hasPdf = await hasOfflineMedia(user.id, lesson.pdf_url);
        if (active) setPdfSavedOffline(hasPdf);
        if (hasPdf) {
          const u = await getOfflineMediaObjectUrl(user.id, lesson.pdf_url);
          if (active && u) setPdfOfflineUrl(u);
        }
      }
      if (lesson.image_url) {
        const hasImg = await hasOfflineMedia(user.id, lesson.image_url);
        if (hasImg) {
          const u = await getOfflineMediaObjectUrl(user.id, lesson.image_url);
          if (active && u) setImageOfflineUrl(u);
        }
      }
    };
    loadOfflineBlobs();
    return () => {
      active = false;
    };
  }, [lesson, user?.id]);

  const getElapsedMinutes = () => {
    const secs = Math.max(30, Math.round((Date.now() - studyStartRef.current) / 1000));
    studyStartRef.current = Date.now();
    return Math.min(240, Math.max(1, Math.round(secs / 60)));
  };

  const persistProgress = async (status, progressPct = null, lastPos = null) => {
    if (!user?.id || !lesson || user?.role !== 'student') return;
    const result = await recordLessonProgressWithOfflineSupport(user.id, {
      lesson_id: Number(id),
      course_id: Number(lesson.course_id),
      completion_status: status,
      progress_percentage: progressPct ?? (status === 'completed' ? 100 : 50),
      time_spent_minutes: getElapsedMinutes(),
      last_position_seconds: lastPos ?? 0,
    });
    setProgress(result.progress);
    await refreshOfflineStatus();
    if (result.queuedOffline) {
      showToast('Progress saved offline and queued for automatic sync.', 'info');
    } else if (status === 'completed') {
      showToast(t('lesson.completedAlert'), 'success');
    }
  };

  const handleSaveAssetOffline = async (canonicalUrl, signedUrl, type) => {
    if (!user?.id || !canonicalUrl) return;
    setSavingMediaPct(2);
    try {
      await saveMediaBlobOffline(user.id, {
        canonicalUrl,
        downloadUrl: signedUrl || canonicalUrl,
        courseId: lesson.course_id,
        lessonId: lesson.id,
        onProgress: (pct) => setSavingMediaPct(pct),
      });
      const objUrl = await getOfflineMediaObjectUrl(user.id, canonicalUrl);
      if (type === 'video') {
        setVideoSavedOffline(true);
        if (objUrl) setVideoOfflineUrl(objUrl);
        setVideoLoadApproved(true);
      } else if (type === 'pdf') {
        setPdfSavedOffline(true);
        if (objUrl) setPdfOfflineUrl(objUrl);
      }
      showToast('Saved for offline access!', 'success');
    } catch (_e) {
      showToast('Could not download file for offline use.', 'error');
    } finally {
      setSavingMediaPct(null);
    }
  };

  const handleCheckInlineQuestion = async (assessment) => {
    const selected = inlineAnswers[assessment.id];
    if (selected === undefined) return;
    try {
      const res = await axios.post(`/api/assessments/${assessment.id}/submit`, {
        user_answer: Number(selected),
      });
      setInlineResults((prev) => ({ ...prev, [assessment.id]: res.data }));
    } catch (err) {
      showToast(err.response?.data?.message || 'Unable to submit answer right now.', 'warning');
    }
  };

  if (loading) {
    return (
      <Container maxWidth="md" sx={{ py: 5 }}>
        <Skeleton variant="text" width={160} height={36} sx={{ mb: 2 }} />
        <Skeleton variant="rounded" height={340} />
      </Container>
    );
  }

  if (!lesson) {
    return (
      <Container maxWidth="md" sx={{ py: 5 }}>
        <Card className="glass-panel" sx={{ p: 4, textAlign: 'center' }}>
          <Typography variant="h6" gutterBottom>
            {isOffline
              ? 'This lesson is not cached offline yet. Connect to the internet and save the course first.'
              : 'Lesson not found.'}
          </Typography>
          <Button variant="contained" onClick={() => navigate('/courses')} sx={{ mt: 2 }}>
            {t('courses.backToCourses')}
          </Button>
        </Card>
      </Container>
    );
  }

  const localized = resolveEntityTranslation(lesson, language);
  const inlineAssessments = (lesson.assessments || []).map((a) => ({
    ...a,
    parsedOptions: typeof a.options === 'string' ? JSON.parse(a.options) : a.options || [],
  }));
  const lType = lesson.lesson_type || lesson.content_type || 'text';
  const durationMins = lesson.duration_minutes ?? lesson.duration ?? 0;

  const videoSrc = videoOfflineUrl || lesson.video_url_signed || lesson.video_url;
  const pdfSrc = pdfOfflineUrl || lesson.pdf_url_signed || lesson.pdf_url;
  const imgSrc = imageOfflineUrl || lesson.image_url_signed || lesson.image_url;

  return (
    <Container maxWidth="md" sx={{ py: 4 }}>
      <Button
        startIcon={<ArrowBack />}
        onClick={() => navigate(`/courses/${lesson.course_id}`)}
        sx={{ mb: 2 }}
      >
        {t('lesson.backToCourse')}
      </Button>

      {isOffline && (
        <Alert severity="warning" sx={{ mb: 2.5 }}>
          {t('lesson.offlineBanner')}
        </Alert>
      )}

      {localized.isOriginalFallback && (
        <Alert severity="info" sx={{ mb: 2.5 }}>
          {t('courses.originalLanguageNotice', {
            lang: getLanguageDisplayName(localized.activeLanguage),
          })}
        </Alert>
      )}

      <Card className="glass-panel" sx={{ mb: 3 }}>
        <CardContent>
          <Stack direction="row" justifyContent="space-between" alignItems="flex-start" flexWrap="wrap" gap={1.5}>
            <Box>
              <Typography variant="h4" component="h1" fontWeight={800} gutterBottom>
                {localized.title}
              </Typography>
              <Stack direction="row" spacing={1} flexWrap="wrap">
                <Chip size="small" label={lType.toUpperCase()} color="primary" variant="outlined" />
                <Chip size="small" label={getLanguageDisplayName(localized.activeLanguage)} variant="outlined" />
                {durationMins > 0 && <Chip size="small" label={`${durationMins} min`} variant="outlined" />}
              </Stack>
            </Box>

            {progress?.completion_status === 'completed' && (
              <Chip icon={<CheckCircle />} label="Completed" color="success" />
            )}
          </Stack>
        </CardContent>
      </Card>

      {savingMediaPct !== null && (
        <LinearProgress variant="determinate" value={savingMediaPct} sx={{ mb: 2, borderRadius: 2 }} />
      )}

      {/* Audio Lesson Player */}
      {lesson.audio_url && (
        <AudioLessonPlayer
          userId={user?.id}
          courseId={lesson.course_id}
          lessonId={lesson.id}
          title={`${localized.title} — ${t('lesson.audioLesson')}`}
          canonicalUrl={lesson.audio_url}
          signedUrl={lesson.audio_url_signed}
          initialPositionSeconds={progress?.last_position_seconds || 0}
          lowBandwidthMode={lowBandwidthMode}
          onProgressTick={(pct, posSec) => {
            if (progress?.completion_status !== 'completed') {
              persistProgress('in_progress', pct, posSec);
            }
          }}
          onCompleted={() => persistProgress('completed', 100, 0)}
        />
      )}

      {/* Video Player */}
      {lesson.video_url && (
        <Card className="glass-panel" sx={{ mb: 3 }}>
          <CardContent>
            <Stack direction="row" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={1} mb={2}>
              <Typography variant="h6" fontWeight={700}>
                {t('lesson.videoLesson')}
              </Typography>
              <Stack direction="row" spacing={1}>
                {videoSavedOffline ? (
                  <Chip icon={<OfflinePin />} label={t('lesson.savedOfflineBadge')} color="success" size="small" />
                ) : (
                  !isOffline &&
                  lesson.video_url.startsWith('/uploads/') && (
                    <Button
                      size="small"
                      variant="outlined"
                      startIcon={<CloudDownload />}
                      onClick={() => handleSaveAssetOffline(lesson.video_url, lesson.video_url_signed, 'video')}
                    >
                      {t('lesson.saveOfflineBtn')}
                    </Button>
                  )
                )}
                {lesson.video_url.startsWith('/uploads/') && (
                  <Button
                    size="small"
                    component="a"
                    href={
                      videoOfflineUrl ||
                      `${lesson.video_url_signed || lesson.video_url}${
                        (lesson.video_url_signed || lesson.video_url).includes('?') ? '&' : '?'
                      }download=1`
                    }
                    download
                    startIcon={<Download />}
                  >
                    {t('lesson.downloadFileBtn')}
                  </Button>
                )}
              </Stack>
            </Stack>

            {!videoLoadApproved && !videoOfflineUrl ? (
              <Box sx={{ p: 3, bgcolor: '#f1f5f9', borderRadius: 2, textAlign: 'center' }}>
                <Typography variant="body2" sx={{ mb: 1.5 }}>
                  {t('lesson.lowBandwidthMediaNotice')}
                </Typography>
                <Button variant="contained" onClick={() => setVideoLoadApproved(true)}>
                  {t('lesson.loadMediaBtn')}
                </Button>
              </Box>
            ) : !videoOfflineUrl &&
              lesson.video_url.startsWith('http') &&
              (lesson.video_url.includes('youtube.com') || lesson.video_url.includes('youtu.be')) ? (
              isOffline ? (
                <Alert severity="info">
                  External YouTube video streams require an active internet connection. All saved offline audio narrations, PDFs, and study notes below remain fully accessible offline.
                </Alert>
              ) : (
                <Box sx={{ position: 'relative', pb: '56.25%', height: 0, overflow: 'hidden', borderRadius: 2 }}>
                  <iframe
                    src={lesson.video_url}
                    title={localized.title}
                    style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', border: 0 }}
                    allowFullScreen
                  />
                </Box>
              )
            ) : (
              <video
                controls
                preload={videoOfflineUrl ? 'auto' : 'metadata'}
                src={videoSrc}
                style={{ width: '100%', maxHeight: 460, borderRadius: 8, background: '#000' }}
                onEnded={() => persistProgress('completed', 100)}
              >
                Your browser does not support HTML5 video playback.
              </video>
            )}
          </CardContent>
        </Card>
      )}

      {/* Image / Diagram */}
      {lesson.image_url && (
        <Card className="glass-panel" sx={{ mb: 3 }}>
          <CardContent sx={{ textAlign: 'center' }}>
            <Box
              component="img"
              src={imgSrc}
              alt={lesson.alt_text || `${localized.title} educational diagram`}
              loading="lazy"
              sx={{ maxWidth: '100%', maxHeight: 440, borderRadius: 2 }}
            />
          </CardContent>
        </Card>
      )}

      {/* Text Content */}
      {localized.content && (
        <Card className="glass-panel" sx={{ mb: 3 }}>
          <CardContent sx={{ p: { xs: 2.5, sm: 4 } }}>
            <Typography
              variant="body1"
              component="div"
              sx={{ whiteSpace: 'pre-line', lineHeight: 1.85, fontSize: '1.05rem' }}
            >
              {localized.content}
            </Typography>
          </CardContent>
        </Card>
      )}

      {/* PDF Document */}
      {lesson.pdf_url && (
        <Card className="glass-panel" sx={{ mb: 3 }}>
          <CardContent>
            <Stack direction="row" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={1} mb={2}>
              <Typography variant="h6" fontWeight={700}>
                {t('lesson.pdfLesson')}
              </Typography>
              <Stack direction="row" spacing={1}>
                {pdfSavedOffline ? (
                  <Chip icon={<OfflinePin />} label={t('lesson.savedOfflineBadge')} color="success" size="small" />
                ) : (
                  !isOffline &&
                  lesson.pdf_url.startsWith('/uploads/') && (
                    <Button
                      size="small"
                      variant="outlined"
                      startIcon={<CloudDownload />}
                      onClick={() => handleSaveAssetOffline(lesson.pdf_url, lesson.pdf_url_signed, 'pdf')}
                    >
                      {t('lesson.saveOfflineBtn')}
                    </Button>
                  )
                )}
                <Button
                  variant="contained"
                  size="small"
                  component="a"
                  href={pdfSrc}
                  target="_blank"
                  rel="noopener noreferrer"
                  download
                  startIcon={<Download />}
                >
                  {t('lesson.downloadFileBtn')}
                </Button>
              </Stack>
            </Stack>

            {!lowBandwidthMode && (
              <Box sx={{ height: 460, border: '1px solid #cbd5e1', borderRadius: 2, overflow: 'hidden' }}>
                <iframe
                  src={pdfSrc}
                  title={`${localized.title} PDF`}
                  style={{ width: '100%', height: '100%', border: 0 }}
                />
              </Box>
            )}
          </CardContent>
        </Card>
      )}

      {/* Inline Lesson Knowledge Check Questions */}
      {inlineAssessments.length > 0 && !isOffline && (
        <Card className="glass-panel" sx={{ mb: 3 }}>
          <CardContent>
            <Typography variant="h6" fontWeight={800} gutterBottom>
              {t('lesson.inlineQuizTitle')}
            </Typography>
            {inlineAssessments.map((q, qIndex) => {
              const res = inlineResults[q.id];
              return (
                <Paper key={q.id} variant="outlined" sx={{ p: 2, mb: 2, borderRadius: 2 }}>
                  <FormControl component="fieldset" fullWidth>
                    <FormLabel component="legend" sx={{ mb: 1, fontWeight: 700, color: 'text.primary' }}>
                      {qIndex + 1}. {q.question}
                    </FormLabel>
                    <RadioGroup
                      value={inlineAnswers[q.id] !== undefined ? String(inlineAnswers[q.id]) : ''}
                      onChange={(e) =>
                        setInlineAnswers((prev) => ({ ...prev, [q.id]: parseInt(e.target.value, 10) }))
                      }
                    >
                      {q.parsedOptions.map((option, oIndex) => (
                        <FormControlLabel
                          key={oIndex}
                          value={String(oIndex)}
                          control={<Radio />}
                          label={option}
                        />
                      ))}
                    </RadioGroup>
                  </FormControl>

                  <Stack direction="row" spacing={2} alignItems="center" mt={1}>
                    {user?.role === 'student' && (
                      <Button
                        size="small"
                        variant="outlined"
                        disabled={inlineAnswers[q.id] === undefined}
                        onClick={() => handleCheckInlineQuestion(q)}
                      >
                        {t('lesson.submitAnswer')}
                      </Button>
                    )}
                    {res && (
                      <Typography
                        variant="body2"
                        fontWeight={700}
                        color={res.is_correct ? 'success.main' : 'error.main'}
                      >
                        {res.is_correct ? `✓ Correct (+${res.points_earned} pts)` : '✗ Try reviewing the lesson text'}
                      </Typography>
                    )}
                  </Stack>
                </Paper>
              );
            })}
          </CardContent>
        </Card>
      )}

      {user?.role === 'student' && progress?.completion_status !== 'completed' && (
        <Box sx={{ textAlign: 'center', mt: 3 }}>
          <Button
            variant="contained"
            size="large"
            onClick={() => persistProgress('completed', 100)}
            startIcon={<CheckCircle />}
            sx={{ px: 4, py: 1.4, fontWeight: 700 }}
          >
            {t('lesson.markCompleted')}
          </Button>
        </Box>
      )}
    </Container>
  );
};

export default LessonDetail;
