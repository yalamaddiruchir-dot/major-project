import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Container,
  Typography,
  Box,
  Card,
  CardContent,
  Button,
  Grid,
  Chip,
  Stack,
  TextField,
  RadioGroup,
  FormControlLabel,
  Radio,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  MenuItem,
  Switch,
  Divider,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  IconButton,
  Paper,
} from '@mui/material';
import {
  Timer,
  Add,
  Delete,
  Edit,
  Save,
  CheckCircle,
  Cancel,
  Visibility,
  Assessment as AssessmentIcon,
} from '@mui/icons-material';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { useToast } from '../context/ToastContext';
import ConfirmDialog from '../components/ConfirmDialog';

const EMPTY_QUESTION = {
  question_type: 'mcq',
  question_text: '',
  options: ['Option A', 'Option B', 'Option C', 'Option D'],
  correct_answer: '0',
  marks: 2,
  explanation: '',
};

const formatTimer = (sec) => {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r < 10 ? '0' : ''}${r}`;
};

const AssessmentsPage = () => {
  const [searchParams] = useSearchParams();
  const initialCourseFilter = searchParams.get('courseId') || '';

  const { user } = useAuth();
  const { t } = useLanguage();
  const { showToast } = useToast();

  const isStaff = user?.role === 'teacher' || user?.role === 'admin';

  const [assessments, setAssessments] = useState([]);
  const [courses, setCourses] = useState([]);
  const [courseFilter, setCourseFilter] = useState(initialCourseFilter);
  const [loading, setLoading] = useState(true);

  const [activeAttempt, setActiveAttempt] = useState(null);
  const [activeExam, setActiveExam] = useState(null);
  const [activeQuestions, setActiveQuestions] = useState([]);
  const [currentQIdx, setCurrentQIdx] = useState(0);
  const [answers, setAnswers] = useState({});
  const [remainingSec, setRemainingSec] = useState(null);
  const [savingDraft, setSavingDraft] = useState(false);
  const [confirmSubmitOpen, setConfirmSubmitOpen] = useState(false);

  const [reviewData, setReviewData] = useState(null);
  const [historyModal, setHistoryModal] = useState(null);

  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [examForm, setExamForm] = useState({
    course_id: '',
    title: '',
    description: '',
    time_limit_minutes: 15,
    passing_percentage: 50,
    max_attempts: 3,
    available_from: '',
    available_until: '',
    show_correct_answers: 'after_submission',
    is_required_for_certificate: true,
    is_published: true,
    questions: [{ ...EMPTY_QUESTION }],
  });

  const [submissionsReport, setSubmissionsReport] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const answersRef = useRef(answers);
  answersRef.current = answers;

  const fetchAssessments = useCallback(async () => {
    setLoading(true);
    try {
      const [examRes, courseRes] = await Promise.all([
        axios.get('/api/assessments/exams', {
          params: courseFilter ? { course_id: courseFilter } : {},
        }),
        axios.get('/api/courses', {
          params: user?.role === 'teacher' ? { mine: 'true', limit: 50 } : { limit: 50 },
        }),
      ]);
      setAssessments(examRes.data.exams || []);
      setCourses(courseRes.data.courses || []);
    } catch (error) {
      showToast(error.response?.data?.message || 'Unable to load assessments.', 'error');
    } finally {
      setLoading(false);
    }
  }, [courseFilter, showToast, user?.role]);

  useEffect(() => {
    fetchAssessments();
  }, [fetchAssessments]);

  useEffect(() => {
    if (!activeAttempt || remainingSec === null) return undefined;
    if (remainingSec <= 0) {
      handleFinalSubmit(true);
      return undefined;
    }
    const timer = window.setInterval(() => {
      setRemainingSec((prev) => (prev !== null ? prev - 1 : null));
    }, 1000);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeAttempt, remainingSec]);

  const handleStartExam = async (examId) => {
    try {
      const res = await axios.post(`/api/assessments/exams/${examId}/start`);
      const { attempt, exam, questions } = res.data;
      setActiveAttempt(attempt);
      setActiveExam(exam);
      setActiveQuestions(questions || []);
      setAnswers(attempt.draft_answers || {});
      setCurrentQIdx(0);
      if (attempt.expires_at) {
        const diffSec = Math.max(1, Math.floor((new Date(attempt.expires_at).getTime() - Date.now()) / 1000));
        setRemainingSec(diffSec);
      } else {
        setRemainingSec(null);
      }
    } catch (error) {
      showToast(error.response?.data?.message || 'Could not start exam.', 'error');
    }
  };

  const handleSaveDraft = async () => {
    if (!activeAttempt) return;
    setSavingDraft(true);
    try {
      await axios.put(`/api/assessments/attempts/${activeAttempt.id}/save`, {
        answers: answersRef.current,
      });
      showToast('Answers saved safely.', 'info');
    } catch (_e) {
      showToast('Could not save draft right now.', 'warning');
    } finally {
      setSavingDraft(false);
    }
  };

  const handleFinalSubmit = async (autoExpired = false) => {
    if (!activeAttempt) return;
    setConfirmSubmitOpen(false);
    try {
      const res = await axios.post(`/api/assessments/attempts/${activeAttempt.id}/submit`, {
        answers: answersRef.current,
      });
      setActiveAttempt(null);
      setActiveExam(null);
      setActiveQuestions([]);
      setRemainingSec(null);

      showToast(
        autoExpired
          ? 'Time expired — assessment submitted automatically.'
          : `Submitted! Score: ${res.data.attempt.percentage}%`,
        res.data.attempt.passed ? 'success' : 'info'
      );

      setReviewData(res.data);
      fetchAssessments();
    } catch (error) {
      showToast(error.response?.data?.message || 'Submission failed.', 'error');
    }
  };

  const handleReviewAttempt = async (attemptId) => {
    try {
      const res = await axios.get(`/api/assessments/attempts/${attemptId}`);
      setReviewData(res.data);
    } catch (_error) {
      showToast('Could not load attempt review.', 'error');
    }
  };

  const openCreateExam = () => {
    setEditingId(null);
    setExamForm({
      course_id: courseFilter || courses[0]?.id || '',
      title: '',
      description: '',
      time_limit_minutes: 15,
      passing_percentage: 50,
      max_attempts: 3,
      available_from: '',
      available_until: '',
      show_correct_answers: 'after_submission',
      is_required_for_certificate: true,
      is_published: true,
      questions: [{ ...EMPTY_QUESTION, options: ['Option A', 'Option B', 'Option C', 'Option D'] }],
    });
    setEditorOpen(true);
  };

  const openEditExam = async (examId) => {
    try {
      const res = await axios.get(`/api/assessments/exams/${examId}`);
      const a = res.data.exam;
      setEditingId(a.id);
      setExamForm({
        course_id: a.course_id,
        title: a.title,
        description: a.description || '',
        time_limit_minutes: a.time_limit_minutes || 15,
        passing_percentage: a.passing_percentage || 50,
        max_attempts: a.max_attempts ?? 3,
        available_from: a.available_from ? String(a.available_from).slice(0, 16) : '',
        available_until: a.available_until ? String(a.available_until).slice(0, 16) : '',
        show_correct_answers: a.show_correct_answers || 'after_submission',
        is_required_for_certificate: Boolean(a.is_required_for_certificate),
        is_published: Boolean(a.is_published),
        questions: (a.questions || []).map((q) => ({
          question_type: q.question_type,
          question_text: q.question_text,
          options: q.options || ['Option A', 'Option B', 'Option C', 'Option D'],
          correct_answer: String(q.correct_answer ?? '0'),
          marks: q.marks || 1,
          explanation: q.explanation || '',
        })),
      });
      setEditorOpen(true);
    } catch (_error) {
      showToast('Failed to load assessment for editing.', 'error');
    }
  };

  const handleSaveExam = async (e) => {
    e.preventDefault();
    if (!examForm.course_id || !examForm.title.trim() || examForm.questions.length === 0) {
      showToast('Course, title, and at least 1 question are required.', 'warning');
      return;
    }
    try {
      const payload = {
        ...examForm,
        available_from: examForm.available_from || null,
        available_until: examForm.available_until || null,
      };
      if (editingId) {
        await axios.put(`/api/assessments/exams/${editingId}`, payload);
        showToast('Assessment updated!', 'success');
      } else {
        await axios.post('/api/assessments/exams', payload);
        showToast('Assessment created!', 'success');
      }
      setEditorOpen(false);
      fetchAssessments();
    } catch (error) {
      showToast(error.response?.data?.message || 'Failed to save assessment.', 'error');
    }
  };

  const handleViewSubmissions = async (examId) => {
    try {
      const res = await axios.get(`/api/assessments/exams/${examId}/submissions`);
      setSubmissionsReport(res.data);
    } catch (error) {
      showToast(error.response?.data?.message || 'Unable to load submissions.', 'error');
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await axios.delete(`/api/assessments/exams/${deleteTarget.id}`);
      showToast('Assessment deleted.', 'info');
      setDeleteTarget(null);
      fetchAssessments();
    } catch (error) {
      showToast(error.response?.data?.message || 'Failed to delete assessment.', 'error');
    }
  };

  const updateQuestionField = (idx, field, value) => {
    setExamForm((prev) => {
      const next = [...prev.questions];
      const updated = { ...next[idx], [field]: value };
      if (field === 'question_type') {
        if (value === 'true_false') {
          updated.options = ['True', 'False'];
          updated.correct_answer = '0';
        } else if (value === 'mcq') {
          updated.options = ['Option A', 'Option B', 'Option C', 'Option D'];
          updated.correct_answer = '0';
        } else {
          updated.options = null;
          updated.correct_answer = '';
        }
      }
      next[idx] = updated;
      return { ...prev, questions: next };
    });
  };

  // ---------------- ACTIVE TIMED EXAM VIEW ----------------
  if (activeAttempt && activeExam) {
    const currentQ = activeQuestions[currentQIdx];

    return (
      <Container maxWidth="md" sx={{ py: 4 }}>
        <Card className="glass-panel" sx={{ mb: 3 }}>
          <CardContent>
            <Stack direction="row" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={2}>
              <Box>
                <Typography variant="h5" fontWeight={800}>
                  {activeExam.title}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Attempt #{activeAttempt.attempt_number} • {t('assessments.passingScore')}:{' '}
                  {activeExam.passing_percentage}%
                </Typography>
              </Box>

              {remainingSec !== null && (
                <Chip
                  icon={<Timer />}
                  label={`${formatTimer(remainingSec)}`}
                  color={remainingSec < 120 ? 'error' : 'primary'}
                  sx={{ fontWeight: 800, fontSize: '1rem', py: 2.2, px: 1 }}
                />
              )}
            </Stack>

            <Stack direction="row" spacing={1} flexWrap="wrap" sx={{ mt: 2.5 }}>
              {activeQuestions.map((q, idx) => {
                const answered =
                  answers[q.id] !== undefined && answers[q.id] !== null && String(answers[q.id]).trim() !== '';
                return (
                  <Button
                    key={q.id}
                    size="small"
                    variant={currentQIdx === idx ? 'contained' : answered ? 'outlined' : 'text'}
                    color={answered ? 'success' : 'primary'}
                    onClick={() => setCurrentQIdx(idx)}
                    sx={{ minWidth: 40, fontWeight: 700 }}
                  >
                    {idx + 1}
                  </Button>
                );
              })}
            </Stack>
          </CardContent>
        </Card>

        {currentQ && (
          <Card className="glass-panel" sx={{ mb: 3 }}>
            <CardContent sx={{ p: { xs: 2.5, sm: 4 } }}>
              <Stack direction="row" justifyContent="space-between" mb={2}>
                <Chip
                  size="small"
                  label={`${t('assessments.question')} ${currentQIdx + 1} / ${activeQuestions.length}`}
                  color="primary"
                  variant="outlined"
                />
                <Chip size="small" label={`${currentQ.marks} Mark(s)`} />
              </Stack>

              <Typography variant="h6" fontWeight={700} sx={{ mb: 3 }}>
                {currentQ.question_text}
              </Typography>

              {(currentQ.question_type === 'mcq' || currentQ.question_type === 'true_false') && (
                <RadioGroup
                  value={answers[currentQ.id] !== undefined ? String(answers[currentQ.id]) : ''}
                  onChange={(e) =>
                    setAnswers((prev) => ({ ...prev, [currentQ.id]: e.target.value }))
                  }
                >
                  {(currentQ.options || ['True', 'False']).map((opt, oIdx) => (
                    <FormControlLabel
                      key={oIdx}
                      value={String(oIdx)}
                      control={<Radio />}
                      label={opt}
                      sx={{ mb: 1 }}
                    />
                  ))}
                </RadioGroup>
              )}

              {currentQ.question_type === 'short_answer' && (
                <TextField
                  fullWidth
                  label="Your Answer"
                  placeholder="Type your concise answer here..."
                  value={answers[currentQ.id] || ''}
                  onChange={(e) =>
                    setAnswers((prev) => ({ ...prev, [currentQ.id]: e.target.value }))
                  }
                />
              )}

              <Divider sx={{ my: 3 }} />

              <Stack direction="row" justifyContent="space-between" flexWrap="wrap" gap={1.5}>
                <Stack direction="row" spacing={1}>
                  <Button
                    variant="outlined"
                    disabled={currentQIdx === 0}
                    onClick={() => setCurrentQIdx((i) => Math.max(0, i - 1))}
                  >
                    Previous
                  </Button>
                  <Button
                    variant="outlined"
                    disabled={currentQIdx >= activeQuestions.length - 1}
                    onClick={() => setCurrentQIdx((i) => Math.min(activeQuestions.length - 1, i + 1))}
                  >
                    Next
                  </Button>
                </Stack>

                <Stack direction="row" spacing={1.5}>
                  <Button
                    variant="outlined"
                    startIcon={<Save />}
                    disabled={savingDraft}
                    onClick={handleSaveDraft}
                  >
                    {t('assessments.saveDraft')}
                  </Button>
                  <Button
                    variant="contained"
                    color="success"
                    onClick={() => setConfirmSubmitOpen(true)}
                    sx={{ fontWeight: 700 }}
                  >
                    {t('assessments.submitAssessment')}
                  </Button>
                </Stack>
              </Stack>
            </CardContent>
          </Card>
        )}

        <ConfirmDialog
          open={confirmSubmitOpen}
          title={t('assessments.confirmSubmitTitle')}
          message={t('assessments.confirmSubmitMessage')}
          confirmLabel={t('assessments.submitAssessment')}
          confirmColor="success"
          onConfirm={() => handleFinalSubmit(false)}
          onCancel={() => setConfirmSubmitOpen(false)}
        />
      </Container>
    );
  }

  // ---------------- STANDARD ASSESSMENTS LIST VIEW ----------------
  return (
    <Container maxWidth="lg" sx={{ py: 5 }}>
      <Stack direction="row" justifyContent="space-between" alignItems="flex-start" flexWrap="wrap" gap={2} mb={4}>
        <Box>
          <Typography variant="h4" component="h1" fontWeight={800} className="gradient-text" gutterBottom>
            {t('assessments.title')}
          </Typography>
          <Typography variant="body1" color="text.secondary">
            {t('assessments.subtitle')}
          </Typography>
        </Box>

        <Stack direction="row" spacing={1.5} alignItems="center">
          <TextField
            select
            size="small"
            label="Filter by Course"
            value={courseFilter}
            onChange={(e) => setCourseFilter(e.target.value)}
            sx={{ minWidth: 210 }}
          >
            <MenuItem value="">All Courses</MenuItem>
            {courses.map((c) => (
              <MenuItem key={c.id} value={String(c.id)}>
                {c.title}
              </MenuItem>
            ))}
          </TextField>

          {isStaff && (
            <Button variant="contained" startIcon={<Add />} onClick={openCreateExam} sx={{ fontWeight: 700 }}>
              {t('assessments.createAssessment')}
            </Button>
          )}
        </Stack>
      </Stack>

      {!loading && assessments.length === 0 ? (
        <Card className="glass-panel" sx={{ p: 5, textAlign: 'center' }}>
          <AssessmentIcon sx={{ fontSize: 56, color: 'text.secondary', opacity: 0.4, mb: 1 }} />
          <Typography variant="h6" fontWeight={700}>
            {t('assessments.noAssessments')}
          </Typography>
        </Card>
      ) : (
        <Grid container spacing={3}>
          {assessments.map((exam) => {
            const myAttempts = exam.my_attempts || [];
            const inProgress = myAttempts.find((a) => a.status === 'in_progress');
            const attemptsUsed = Number(exam.attempts_used || 0);
            const canRetake =
              Boolean(inProgress) || !exam.max_attempts || attemptsUsed < Number(exam.max_attempts);

            return (
              <Grid item xs={12} md={6} key={exam.id}>
                <Card className="glass-panel glow-card" sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                  <CardContent sx={{ flexGrow: 1 }}>
                    <Stack direction="row" spacing={1} flexWrap="wrap" mb={1.5}>
                      <Chip size="small" color="primary" variant="outlined" label={exam.course_title || `Course #${exam.course_id}`} />
                      <Chip size="small" label={`${exam.question_count} Questions • ${exam.total_marks} Marks`} />
                      <Chip size="small" label={`Pass: ${exam.passing_percentage}%`} />
                      <Chip
                        size="small"
                        label={
                          exam.time_limit_minutes
                            ? `${exam.time_limit_minutes} ${t('assessments.minutes')}`
                            : t('assessments.noTimeLimit')
                        }
                      />
                      {!exam.is_published && <Chip size="small" color="warning" label="Draft" />}
                    </Stack>

                    <Typography variant="h6" component="h2" fontWeight={800} gutterBottom>
                      {exam.title}
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                      {exam.description || 'Structured course assessment.'}
                    </Typography>

                    {user?.role === 'student' && (
                      <Alert
                        severity={exam.has_passed ? 'success' : attemptsUsed > 0 ? 'info' : 'warning'}
                        sx={{ mb: 2 }}
                      >
                        {attemptsUsed > 0 ? (
                          <>
                            Best Score: <strong>{exam.best_percentage}%</strong> (
                            {exam.has_passed ? t('assessments.passed') : t('assessments.failed')}) • Attempts:{' '}
                            {attemptsUsed}/{exam.max_attempts || '∞'}
                          </>
                        ) : (
                          <>
                            Not attempted yet • {t('assessments.attemptsAllowed')}:{' '}
                            {exam.max_attempts || t('assessments.unlimited')}
                          </>
                        )}
                      </Alert>
                    )}

                    {isStaff && (
                      <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 2 }}>
                        Submissions: {exam.submission_count ?? 0}
                        {exam.average_percentage !== null && exam.average_percentage !== undefined
                          ? ` • Class Average: ${exam.average_percentage}%`
                          : ''}
                      </Typography>
                    )}

                    <Stack direction="row" spacing={1} flexWrap="wrap" mt="auto">
                      {user?.role === 'student' && (
                        <>
                          <Button
                            variant="contained"
                            disabled={!canRetake}
                            onClick={() => handleStartExam(exam.id)}
                            sx={{ fontWeight: 700 }}
                          >
                            {inProgress
                              ? t('assessments.resumeAssessment')
                              : attemptsUsed > 0
                                ? t('assessments.retakeAssessment')
                                : t('assessments.startAssessment')}
                          </Button>
                          {myAttempts.some((a) => a.status !== 'in_progress') && (
                            <Button
                              variant="outlined"
                              onClick={() => setHistoryModal({ exam, attempts: myAttempts })}
                            >
                              {t('assessments.reviewAttempt')}
                            </Button>
                          )}
                        </>
                      )}

                      {isStaff && (
                        <>
                          <Button
                            variant="contained"
                            size="small"
                            startIcon={<Visibility />}
                            onClick={() => handleViewSubmissions(exam.id)}
                          >
                            {t('assessments.viewSubmissions')}
                          </Button>
                          <Button
                            variant="outlined"
                            size="small"
                            startIcon={<Edit />}
                            onClick={() => openEditExam(exam.id)}
                          >
                            {t('common.edit')}
                          </Button>
                          <IconButton
                            color="error"
                            size="small"
                            aria-label={`Delete assessment ${exam.title}`}
                            onClick={() => setDeleteTarget(exam)}
                          >
                            <Delete fontSize="small" />
                          </IconButton>
                        </>
                      )}
                    </Stack>
                  </CardContent>
                </Card>
              </Grid>
            );
          })}
        </Grid>
      )}

      {/* Attempt Review Modal */}
      <Dialog open={Boolean(reviewData)} onClose={() => setReviewData(null)} maxWidth="md" fullWidth>
        <DialogTitle sx={{ fontWeight: 800 }}>
          {reviewData?.attempt?.exam_title || 'Assessment'} — Results & Feedback
        </DialogTitle>
        <DialogContent dividers>
          {reviewData && (
            <>
              <Alert severity={reviewData.attempt.passed ? 'success' : 'warning'} sx={{ mb: 3 }}>
                Score: <strong>{reviewData.attempt.score} / {reviewData.attempt.total_marks}</strong> (
                <strong>{reviewData.attempt.percentage}%</strong>) —{' '}
                {reviewData.attempt.passed ? t('assessments.passed') : t('assessments.failed')}
              </Alert>

              {(reviewData.questions_review || []).map((rq, idx) => (
                <Paper key={rq.question_id} variant="outlined" sx={{ p: 2, mb: 2 }}>
                  <Stack direction="row" justifyContent="space-between" mb={1}>
                    <Typography fontWeight={700}>
                      {idx + 1}. {rq.question_text}
                    </Typography>
                    <Chip
                      size="small"
                      icon={rq.is_correct ? <CheckCircle /> : <Cancel />}
                      color={rq.is_correct ? 'success' : 'error'}
                      label={`${rq.marks_awarded}/${rq.marks}`}
                    />
                  </Stack>
                  <Typography variant="body2">
                    Submitted answer:{' '}
                    <strong>
                      {rq.options && rq.options.length > 0
                        ? rq.options[Number(rq.submitted_answer)] ?? 'Not answered'
                        : String(rq.submitted_answer || 'Not answered')}
                    </strong>
                  </Typography>
                  {reviewData.answers_revealed && !rq.is_correct && (
                    <Typography variant="body2" color="success.main" fontWeight={700}>
                      Correct answer:{' '}
                      {rq.options && rq.options.length > 0
                        ? rq.options[Number(rq.correct_answer)]
                        : rq.correct_answer}
                    </Typography>
                  )}
                  {rq.feedback && (
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.75 }}>
                      {rq.feedback}
                    </Typography>
                  )}
                </Paper>
              ))}
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setReviewData(null)} variant="contained">
            {t('common.close')}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Student Previous Attempts Modal */}
      <Dialog open={Boolean(historyModal)} onClose={() => setHistoryModal(null)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontWeight: 800 }}>
          {historyModal?.exam?.title} — Attempt History
        </DialogTitle>
        <DialogContent dividers>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>#</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Score</TableCell>
                <TableCell>Action</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {(historyModal?.attempts || []).map((att) => (
                <TableRow key={att.id}>
                  <TableCell>{att.attempt_number}</TableCell>
                  <TableCell>{att.status}</TableCell>
                  <TableCell>
                    {att.status !== 'in_progress' ? `${att.percentage}% (${att.passed ? 'Pass' : 'Fail'})` : '—'}
                  </TableCell>
                  <TableCell>
                    {att.status !== 'in_progress' && (
                      <Button size="small" onClick={() => handleReviewAttempt(att.id)}>
                        Review
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setHistoryModal(null)}>{t('common.close')}</Button>
        </DialogActions>
      </Dialog>

      {/* Teacher Submissions & Class Performance Modal */}
      <Dialog open={Boolean(submissionsReport)} onClose={() => setSubmissionsReport(null)} maxWidth="md" fullWidth>
        <DialogTitle sx={{ fontWeight: 800 }}>
          {submissionsReport?.exam?.title} — Class Performance & Submissions
        </DialogTitle>
        <DialogContent dividers>
          {submissionsReport && (
            <>
              <Grid container spacing={2} sx={{ mb: 3 }}>
                <Grid item xs={6} sm={3}>
                  <Paper variant="outlined" sx={{ p: 1.5, textAlign: 'center' }}>
                    <Typography variant="caption">Submissions</Typography>
                    <Typography variant="h6" fontWeight={800}>
                      {submissionsReport.class_performance.total_submissions}
                    </Typography>
                  </Paper>
                </Grid>
                <Grid item xs={6} sm={3}>
                  <Paper variant="outlined" sx={{ p: 1.5, textAlign: 'center' }}>
                    <Typography variant="caption">Pass Rate</Typography>
                    <Typography variant="h6" fontWeight={800} color="success.main">
                      {submissionsReport.class_performance.pass_rate_percentage}%
                    </Typography>
                  </Paper>
                </Grid>
                <Grid item xs={6} sm={3}>
                  <Paper variant="outlined" sx={{ p: 1.5, textAlign: 'center' }}>
                    <Typography variant="caption">Class Average</Typography>
                    <Typography variant="h6" fontWeight={800}>
                      {submissionsReport.class_performance.average_percentage}%
                    </Typography>
                  </Paper>
                </Grid>
                <Grid item xs={6} sm={3}>
                  <Paper variant="outlined" sx={{ p: 1.5, textAlign: 'center' }}>
                    <Typography variant="caption">Highest Score</Typography>
                    <Typography variant="h6" fontWeight={800} color="primary">
                      {submissionsReport.class_performance.highest_percentage}%
                    </Typography>
                  </Paper>
                </Grid>
              </Grid>

              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Student</TableCell>
                    <TableCell>Grade / School</TableCell>
                    <TableCell>Attempt</TableCell>
                    <TableCell>Score</TableCell>
                    <TableCell>Result</TableCell>
                    <TableCell>Action</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {(submissionsReport.submissions || []).map((sub) => (
                    <TableRow key={sub.id}>
                      <TableCell>{sub.full_name} (@{sub.username})</TableCell>
                      <TableCell>{sub.class_grade || '—'} / {sub.school_name || '—'}</TableCell>
                      <TableCell>#{sub.attempt_number}</TableCell>
                      <TableCell>{sub.score}/{sub.total_marks} ({sub.percentage}%)</TableCell>
                      <TableCell>
                        <Chip
                          size="small"
                          color={sub.passed ? 'success' : 'warning'}
                          label={sub.passed ? 'Passed' : sub.status}
                        />
                      </TableCell>
                      <TableCell>
                        <Button size="small" onClick={() => handleReviewAttempt(sub.id)}>
                          Inspect
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSubmissionsReport(null)}>{t('common.close')}</Button>
        </DialogActions>
      </Dialog>

      {/* Teacher Create / Edit Assessment Dialog */}
      <Dialog open={editorOpen} onClose={() => setEditorOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle sx={{ fontWeight: 800 }}>
          {editingId ? t('assessments.editAssessment') : t('assessments.createAssessment')}
        </DialogTitle>
        <DialogContent dividers component="form" onSubmit={handleSaveExam}>
          <Grid container spacing={2} sx={{ mb: 3 }}>
            <Grid item xs={12} sm={6}>
              <TextField
                select
                fullWidth
                size="small"
                label="Course"
                value={examForm.course_id}
                onChange={(e) => setExamForm((p) => ({ ...p, course_id: e.target.value }))}
                required
              >
                {courses.map((c) => (
                  <MenuItem key={c.id} value={c.id}>
                    {c.title}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                size="small"
                label="Assessment Title"
                value={examForm.title}
                onChange={(e) => setExamForm((p) => ({ ...p, title: e.target.value }))}
                required
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                fullWidth
                size="small"
                label="Description / Instructions"
                value={examForm.description}
                onChange={(e) => setExamForm((p) => ({ ...p, description: e.target.value }))}
              />
            </Grid>
            <Grid item xs={4}>
              <TextField
                fullWidth
                size="small"
                type="number"
                label="Time Limit (min)"
                value={examForm.time_limit_minutes}
                onChange={(e) => setExamForm((p) => ({ ...p, time_limit_minutes: Number(e.target.value) }))}
              />
            </Grid>
            <Grid item xs={4}>
              <TextField
                fullWidth
                size="small"
                type="number"
                label="Passing %"
                value={examForm.passing_percentage}
                onChange={(e) => setExamForm((p) => ({ ...p, passing_percentage: Number(e.target.value) }))}
              />
            </Grid>
            <Grid item xs={4}>
              <TextField
                fullWidth
                size="small"
                type="number"
                label="Max Attempts"
                value={examForm.max_attempts}
                onChange={(e) => setExamForm((p) => ({ ...p, max_attempts: Number(e.target.value) }))}
              />
            </Grid>
            <Grid item xs={6}>
              <TextField
                select
                fullWidth
                size="small"
                label="Show Correct Answers"
                value={examForm.show_correct_answers}
                onChange={(e) => setExamForm((p) => ({ ...p, show_correct_answers: e.target.value }))}
              >
                <MenuItem value="after_submission">After Submission</MenuItem>
                <MenuItem value="after_pass">After Passing</MenuItem>
                <MenuItem value="never">Never Reveal</MenuItem>
              </TextField>
            </Grid>
            <Grid item xs={6}>
              <FormControlLabel
                control={
                  <Switch
                    checked={examForm.is_published}
                    onChange={(e) => setExamForm((p) => ({ ...p, is_published: e.target.checked }))}
                  />
                }
                label="Published to Students"
              />
            </Grid>
          </Grid>

          <Divider sx={{ mb: 2 }} />
          <Stack direction="row" justifyContent="space-between" alignItems="center" mb={2}>
            <Typography variant="subtitle1" fontWeight={800}>
              Questions ({examForm.questions.length})
            </Typography>
            <Button
              size="small"
              startIcon={<Add />}
              onClick={() =>
                setExamForm((p) => ({
                  ...p,
                  questions: [
                    ...p.questions,
                    { ...EMPTY_QUESTION, options: ['Option A', 'Option B', 'Option C', 'Option D'] },
                  ],
                }))
              }
            >
              Add Question
            </Button>
          </Stack>

          {examForm.questions.map((q, qIdx) => (
            <Paper key={qIdx} variant="outlined" sx={{ p: 2, mb: 2 }}>
              <Grid container spacing={1.5} alignItems="center">
                <Grid item xs={12} sm={5}>
                  <TextField
                    select
                    fullWidth
                    size="small"
                    label={`Q${qIdx + 1} Type`}
                    value={q.question_type}
                    onChange={(e) => updateQuestionField(qIdx, 'question_type', e.target.value)}
                  >
                    <MenuItem value="mcq">Multiple Choice (MCQ)</MenuItem>
                    <MenuItem value="true_false">True / False</MenuItem>
                    <MenuItem value="short_answer">Short Answer</MenuItem>
                  </TextField>
                </Grid>
                <Grid item xs={8} sm={4}>
                  <TextField
                    fullWidth
                    size="small"
                    type="number"
                    label="Marks"
                    value={q.marks}
                    onChange={(e) => updateQuestionField(qIdx, 'marks', Number(e.target.value))}
                  />
                </Grid>
                <Grid item xs={4} sm={3} textAlign="right">
                  {examForm.questions.length > 1 && (
                    <IconButton
                      color="error"
                      size="small"
                      onClick={() =>
                        setExamForm((p) => ({
                          ...p,
                          questions: p.questions.filter((_, i) => i !== qIdx),
                        }))
                      }
                    >
                      <Delete fontSize="small" />
                    </IconButton>
                  )}
                </Grid>

                <Grid item xs={12}>
                  <TextField
                    fullWidth
                    size="small"
                    label="Question Prompt"
                    value={q.question_text}
                    onChange={(e) => updateQuestionField(qIdx, 'question_text', e.target.value)}
                    required
                  />
                </Grid>

                {q.question_type === 'mcq' && (
                  <>
                    {(q.options || []).map((opt, oIdx) => (
                      <Grid item xs={12} sm={6} key={oIdx}>
                        <TextField
                          fullWidth
                          size="small"
                          label={`Option ${oIdx + 1}`}
                          value={opt}
                          onChange={(e) => {
                            const nextOpts = [...(q.options || [])];
                            nextOpts[oIdx] = e.target.value;
                            updateQuestionField(qIdx, 'options', nextOpts);
                          }}
                        />
                      </Grid>
                    ))}
                    <Grid item xs={12} sm={6}>
                      <TextField
                        select
                        fullWidth
                        size="small"
                        label="Correct Option"
                        value={String(q.correct_answer)}
                        onChange={(e) => updateQuestionField(qIdx, 'correct_answer', e.target.value)}
                      >
                        {(q.options || []).map((opt, oIdx) => (
                          <MenuItem key={oIdx} value={String(oIdx)}>
                            Option {oIdx + 1}: {opt}
                          </MenuItem>
                        ))}
                      </TextField>
                    </Grid>
                  </>
                )}

                {q.question_type === 'true_false' && (
                  <Grid item xs={12} sm={6}>
                    <TextField
                      select
                      fullWidth
                      size="small"
                      label="Correct Answer"
                      value={String(q.correct_answer)}
                      onChange={(e) => updateQuestionField(qIdx, 'correct_answer', e.target.value)}
                    >
                      <MenuItem value="0">True</MenuItem>
                      <MenuItem value="1">False</MenuItem>
                    </TextField>
                  </Grid>
                )}

                {q.question_type === 'short_answer' && (
                  <Grid item xs={12} sm={6}>
                    <TextField
                      fullWidth
                      size="small"
                      label="Expected Answer (separate synonyms with |)"
                      value={q.correct_answer}
                      onChange={(e) => updateQuestionField(qIdx, 'correct_answer', e.target.value)}
                    />
                  </Grid>
                )}

                <Grid item xs={12} sm={6}>
                  <TextField
                    fullWidth
                    size="small"
                    label="Explanation (shown in review)"
                    value={q.explanation}
                    onChange={(e) => updateQuestionField(qIdx, 'explanation', e.target.value)}
                  />
                </Grid>
              </Grid>
            </Paper>
          ))}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditorOpen(false)}>{t('common.cancel')}</Button>
          <Button onClick={handleSaveExam} variant="contained">
            {t('common.save')}
          </Button>
        </DialogActions>
      </Dialog>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete Assessment?"
        message={`Are you sure you want to permanently delete "${deleteTarget?.title}"?`}
        confirmLabel={t('common.delete')}
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </Container>
  );
};

export default AssessmentsPage;
