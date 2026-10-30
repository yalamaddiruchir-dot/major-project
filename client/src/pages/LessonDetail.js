import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  Container,
  Typography,
  Box,
  Card,
  CardContent,
  Button,
  CircularProgress,
  LinearProgress,
  Alert,
  Paper,
  RadioGroup,
  FormControlLabel,
  Radio,
  Divider,
} from '@mui/material';
import {
  ArrowBack,
  ArrowForward,
  CheckCircle,


} from '@mui/icons-material';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';

const getYoutubeEmbedUrl = (value) => {
  if (!value) return null;
  try {
    const parsed = new URL(value);
    const host = parsed.hostname.toLowerCase();
    let videoId = null;
    if (host === 'youtu.be' || host.endsWith('.youtu.be')) {
      videoId = parsed.pathname.split('/').filter(Boolean)[0];
    } else if (host === 'youtube.com' || host.endsWith('.youtube.com')) {
      if (parsed.pathname === '/watch') videoId = parsed.searchParams.get('v');
      else if (parsed.pathname.startsWith('/embed/')) videoId = parsed.pathname.split('/')[2];
      else if (parsed.pathname.startsWith('/shorts/')) videoId = parsed.pathname.split('/')[2];
    }
    return videoId && /^[A-Za-z0-9_-]{11}$/.test(videoId)
      ? `https://www.youtube.com/embed/${videoId}`
      : null;
  } catch (_error) {
    return null;
  }
};

const LessonDetail = () => {
  const { id } = useParams();
  const { user } = useAuth();

  const [lesson, setLesson] = useState(null);
  const [course, setCourse] = useState(null);
  const [progress, setProgress] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [progressValue, setProgressValue] = useState(0);
  const [answers, setAnswers] = useState({});
  const [assessmentResults, setAssessmentResults] = useState({});
  const [submittingAssessment, setSubmittingAssessment] = useState({});
  const [offlineMode, setOfflineMode] = useState(typeof navigator !== 'undefined' && !navigator.onLine);
  const [pendingSyncCount, setPendingSyncCount] = useState(0);

  useEffect(() => {
    fetchLessonData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    if (!lesson || progress?.completion_status === 'completed') return undefined;
    let elapsedSeconds = 0;
    const timer = window.setInterval(() => {
      elapsedSeconds += 1;
      if (elapsedSeconds >= 60) {
        elapsedSeconds = 0;
        saveProgress('in_progress', Math.max(progressValue, 1), 1);
      }
    }, 1000);
    return () => window.clearInterval(timer);
    // The timer is intentionally restarted when the lesson changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lesson?.id, progress?.completion_status, progressValue]);

  const offlineLessonStorageKey = `rural-learning-lessons-${user?.id || 'guest'}`;
  const pendingProgressStorageKey = `rural-learning-progress-${user?.id || 'guest'}`;

  const fetchLessonData = async () => {
    setLoading(true);
    setLesson(null);
    setCourse(null);
    setProgress(null);
    setProgressValue(0);
    setAssessmentResults({});
    setAnswers({});
    try {
      const lessonRes = await axios.get(`/api/lessons/${id}`);
      const lessonData = lessonRes.data.lesson;
      const courseRes = await axios.get(`/api/courses/${lessonData.course_id}`);
      const courseData = courseRes.data.course;
      setLesson(lessonData);
      setCourse(courseData);
      setOfflineMode(false);

      // Cache text, metadata and safe assessment choices for lessons already opened online.
      try {
        const cached = JSON.parse(localStorage.getItem(offlineLessonStorageKey) || '{}');
        cached[String(id)] = { lesson: lessonData, course: courseData, cachedAt: Date.now() };
        localStorage.setItem(offlineLessonStorageKey, JSON.stringify(cached));
      } catch (storageError) {
        console.warn('Unable to cache lesson for offline use:', storageError);
      }

      const progressRes = await axios.get('/api/progress', { params: { lesson_id: id } });
      if (progressRes.data.progress.length > 0) {
        const lessonProgress = progressRes.data.progress[0];
        setProgress(lessonProgress);
        setProgressValue(lessonProgress.progress_percentage);
      }
    } catch (error) {
      if (error.response && [401, 403, 404].includes(error.response.status)) {
        setLesson(null);
        return;
      }
      console.warn('Network request failed; checking cached lesson:', error.message);
      try {
        const cached = JSON.parse(localStorage.getItem(offlineLessonStorageKey) || '{}');
        const savedLesson = cached[String(id)];
        if (savedLesson) {
          setLesson(savedLesson.lesson);
          setCourse(savedLesson.course);
          setOfflineMode(true);
          const queued = JSON.parse(localStorage.getItem(pendingProgressStorageKey) || '[]');
          setPendingSyncCount(queued.length);
        } else {
          setLesson(null);
        }
      } catch (storageError) {
        console.error('Unable to load offline lesson:', storageError);
        setLesson(null);
      }
    } finally {
      setLoading(false);
    }
  };


  useEffect(() => {
    const handleOnline = () => setOfflineMode(false);
    const handleOffline = () => setOfflineMode(true);
    const handleProgressSynced = () => {
      try {
        const queued = JSON.parse(localStorage.getItem(pendingProgressStorageKey) || '[]');
        setPendingSyncCount(queued.length);
      } catch (_error) {
        setPendingSyncCount(0);
      }
    };
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('rural-learning-progress-synced', handleProgressSynced);
    try {
      const queued = JSON.parse(localStorage.getItem(pendingProgressStorageKey) || '[]');
      setPendingSyncCount(queued.length);
    } catch (_error) {
      setPendingSyncCount(0);
    }
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('rural-learning-progress-synced', handleProgressSynced);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const saveProgress = async (status, percentage, minutesSpent = 0) => {
    if (!lesson || !course) return;

    try {
      setSaving(true);
      const response = await axios.post('/api/progress', {
        course_id: lesson.course_id,
        lesson_id: lesson.id,
        completion_status: status,
        progress_percentage: percentage,
        time_spent_minutes: minutesSpent,
      });
      setProgress(response.data.progress);
      return true;
    } catch (error) {
      if (!navigator.onLine || !error.response) {
        const payload = {
          course_id: lesson.course_id,
          lesson_id: lesson.id,
          completion_status: status,
          progress_percentage: percentage,
          time_spent_minutes: minutesSpent,
        };
        try {
          const queued = JSON.parse(localStorage.getItem(pendingProgressStorageKey) || '[]');
          queued.push(payload);
          localStorage.setItem(pendingProgressStorageKey, JSON.stringify(queued));
          setPendingSyncCount(queued.length);
          setOfflineMode(true);
          setProgress({ ...(progress || {}), completion_status: status, progress_percentage: percentage });
          return true;
        } catch (storageError) {
          console.error('Unable to queue offline progress:', storageError);
        }
      }
      console.error('Error saving progress:', error);
      return false;
    } finally {
      setSaving(false);
    }
  };

  const handleComplete = async () => {
    const saved = await saveProgress('completed', 100);
    if (saved) setProgressValue(100);
  };

  const submitAssessment = async (assessmentId) => {
    if (answers[assessmentId] === undefined || answers[assessmentId] === '') return;
    setSubmittingAssessment((current) => ({ ...current, [assessmentId]: true }));
    try {
      const response = await axios.post(`/api/assessments/${assessmentId}/submit`, {
        selected_answer: Number(answers[assessmentId]),
      });
      setAssessmentResults((current) => ({ ...current, [assessmentId]: response.data }));
    } catch (error) {
      setAssessmentResults((current) => ({
        ...current,
        [assessmentId]: { success: false, message: error.response?.data?.message || 'Assessment submission requires an internet connection.' },
      }));
    } finally {
      setSubmittingAssessment((current) => ({ ...current, [assessmentId]: false }));
    }
  };

  const getAssessmentOptions = (assessment) => {
    try {
      const options = typeof assessment.options === 'string' ? JSON.parse(assessment.options) : assessment.options;
      return Array.isArray(options) ? options : [];
    } catch (_error) {
      return [];
    }
  };

  const getNextLesson = () => {
    if (!course || !lesson) return null;
    const currentIndex = course.lessons.findIndex((l) => l.id === lesson.id);
    return currentIndex < course.lessons.length - 1 ? course.lessons[currentIndex + 1] : null;
  };

  const getPrevLesson = () => {
    if (!course || !lesson) return null;
    const currentIndex = course.lessons.findIndex((l) => l.id === lesson.id);
    return currentIndex > 0 ? course.lessons[currentIndex - 1] : null;
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="60vh">
        <CircularProgress />
      </Box>
    );
  }

  if (!lesson) {
    return (
      <Container>
        <Alert severity="error">Lesson not found</Alert>
      </Container>
    );
  }

  const nextLesson = getNextLesson();
  const prevLesson = getPrevLesson();
  const isCompleted = progress?.completion_status === 'completed';
  const youtubeEmbedUrl = getYoutubeEmbedUrl(lesson.video_url);
  const isDirectVideo = Boolean(lesson.video_url && (lesson.video_url.startsWith('/uploads/videos/') || /\.(mp4|webm|mov|ogv|ogg|mpeg|mpg)(?:[?#]|$)/i.test(lesson.video_url)));

  return (
    <Container maxWidth="md" sx={{ py: 4 }}>
      {offlineMode && (
        <Alert severity="warning" sx={{ mb: 2 }}>You are offline. This previously opened lesson is available from this device. Video playback may require an internet connection.</Alert>
      )}
      {pendingSyncCount > 0 && (
        <Alert severity="info" sx={{ mb: 2 }}>{pendingSyncCount} progress update(s) are saved on this device and will sync when you reconnect.</Alert>
      )}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 3 }}>
        <Button
          startIcon={<ArrowBack />}
          component={Link}
          to={`/courses/${lesson.course_id}`}
        >
          Back to Course
        </Button>
        {saving && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <CircularProgress size={20} />
            <Typography variant="body2" color="text.secondary">
              Saving...
            </Typography>
          </Box>
        )}
      </Box>

      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="h4" component="h1" gutterBottom fontWeight="bold">
            {lesson.title}
          </Typography>
          {lesson.description && (
            <Typography variant="body1" color="text.secondary" sx={{ mb: 2 }}>
              {lesson.description}
            </Typography>
          )}

          {progress && (
            <Box sx={{ mb: 2 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                <Typography variant="body2">Progress</Typography>
                <Typography variant="body2">{progress.progress_percentage}%</Typography>
              </Box>
              <LinearProgress
                variant="determinate"
                value={progress.progress_percentage}
                color={isCompleted ? 'success' : 'primary'}
              />
            </Box>
          )}

          {!isCompleted && (
            <Button
              variant="contained"
              color="success"
              onClick={handleComplete}
              startIcon={<CheckCircle />}
              sx={{ mt: 2 }}
            >
              Mark as Completed
            </Button>
          )}

          {isCompleted && (
            <Alert severity="success" sx={{ mt: 2 }}>
              Lesson completed! Great job!
            </Alert>
          )}
        </CardContent>
      </Card>

      <Paper sx={{ p: 3, mb: 3 }}>
        <Typography
          variant="body1"
          component="div"
          sx={{
            whiteSpace: 'pre-wrap',
            lineHeight: 1.8,
            '& p': { mb: 2 },
          }}
        >
          {lesson.content || ''}
        </Typography>
      </Paper>

      {lesson.video_url && (
        <Card sx={{ mb: 3 }}>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Video Content
            </Typography>
            {isDirectVideo ? (
              <Box
                component="video"
                controls
                preload="metadata"
                src={lesson.video_url.startsWith('/uploads/') ? `${process.env.REACT_APP_API_BASE_URL || ''}${lesson.video_url}` : lesson.video_url}
                sx={{ width: '100%', maxHeight: '500px', backgroundColor: '#000', borderRadius: 1 }}
              />
            ) : youtubeEmbedUrl ? (
              <Box
                component="iframe"
                title={`${lesson.title} video`}
                src={youtubeEmbedUrl}
                loading="lazy"
                referrerPolicy="strict-origin-when-cross-origin"
                sx={{ width: '100%', height: '400px', border: 'none' }}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
              />
            ) : (
              <Alert severity="warning">This video URL is not supported. Use an uploaded video or a valid YouTube link.</Alert>
            )}
          </CardContent>
        </Card>
      )}

      {lesson.assessments?.length > 0 && (
        <Card sx={{ mb: 3 }}>
          <CardContent>
            <Typography variant="h5" fontWeight="bold" gutterBottom>Lesson Assessment</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>Choose an answer for each question. Your score is checked securely by the server.</Typography>
            {lesson.assessments.map((assessment, index) => {
              const options = getAssessmentOptions(assessment);
              const result = assessmentResults[assessment.id];
              return (
                <Box key={assessment.id} sx={{ py: 2 }}>
                  <Typography variant="subtitle1" fontWeight="bold" gutterBottom>{index + 1}. {assessment.question}</Typography>
                  <RadioGroup
                    value={answers[assessment.id] ?? ''}
                    onChange={(event) => setAnswers((current) => ({ ...current, [assessment.id]: event.target.value }))}
                  >
                    {options.map((option, optionIndex) => (
                      <FormControlLabel key={`${assessment.id}-${optionIndex}`} value={String(optionIndex)} control={<Radio />} label={option} disabled={!!result?.success || offlineMode} />
                    ))}
                  </RadioGroup>
                  <Button
                    variant="outlined"
                    size="small"
                    disabled={answers[assessment.id] === undefined || answers[assessment.id] === '' || !!result?.success || !!submittingAssessment[assessment.id] || offlineMode}
                    onClick={() => submitAssessment(assessment.id)}
                    sx={{ mt: 1 }}
                  >
                    {submittingAssessment[assessment.id] ? 'Submitting…' : result?.success ? 'Submitted' : 'Submit answer'}
                  </Button>
                  {result && <Alert severity={result.success ? (result.is_correct ? 'success' : 'warning') : 'error'} sx={{ mt: 1 }}>{result.message}{result.success ? ` Score: ${result.score}/${assessment.points || 1}` : ''}</Alert>}
                  {index < lesson.assessments.length - 1 && <Divider sx={{ mt: 2 }} />}
                </Box>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* Navigation */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 4 }}>
        {prevLesson ? (
          <Button
            startIcon={<ArrowBack />}
            component={Link}
            to={`/lessons/${prevLesson.id}`}
          >
            Previous Lesson
          </Button>
        ) : (
          <Box />
        )}

        {nextLesson ? (
          <Button
            endIcon={<ArrowForward />}
            component={Link}
            to={`/lessons/${nextLesson.id}`}
            variant="contained"
          >
            Next Lesson
          </Button>
        ) : (
          <Button
            endIcon={<ArrowBack />}
            component={Link}
            to={`/courses/${lesson.course_id}`}
            variant="contained"
          >
            Back to Course
          </Button>
        )}
      </Box>
    </Container>
  );
};

export default LessonDetail;

