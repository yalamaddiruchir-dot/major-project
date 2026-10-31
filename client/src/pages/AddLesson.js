import React, { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Container,
  Typography,
  Box,
  TextField,
  Button,
  Paper,
  MenuItem,
  Alert,
  IconButton,
  Divider,
  Grid,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Stack,
} from '@mui/material';
import {
  ArrowBack,
  Save,
  Add,
  Delete,
  CloudUpload,
  ExpandMore,
  Translate,
} from '@mui/icons-material';
import axios from 'axios';
import { useToast } from '../context/ToastContext';

const AddLesson = () => {
  const { courseId } = useParams();
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [formData, setFormData] = useState({
    title: '',
    description: '',
    content: '',
    lesson_type: 'text',
    video_url: '',
    audio_url: '',
    pdf_url: '',
    image_url: '',
    alt_text: '',
    order_index: 1,
    duration_minutes: 15,
  });

  const [teTrans, setTeTrans] = useState({ title: '', content: '' });
  const [hiTrans, setHiTrans] = useState({ title: '', content: '' });
  const [quizQuestions, setQuizQuestions] = useState([
    { question: '', options: ['', '', '', ''], correct: 0 },
  ]);

  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleChange = (e) => {
    setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleFileUpload = async (e, targetField) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const uploadData = new FormData();
    uploadData.append('file', file);

    setUploading(true);
    setError('');
    try {
      const response = await axios.post('/api/upload', uploadData);
      setFormData((prev) => ({
        ...prev,
        [targetField]: response.data.url,
        ...(targetField === 'video_url' && response.data.low_bandwidth_url && !prev.low_bandwidth_video_url
          ? { low_bandwidth_video_url: response.data.low_bandwidth_url }
          : {}),
      }));
      showToast(
        response.data.transcoded
          ? 'Video uploaded & auto-transcoded to 360p low-bandwidth + adaptive HLS!'
          : 'File uploaded and verified!',
        'success'
      );
    } catch (err) {
      setError(err.response?.data?.message || 'File upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!formData.title.trim() || !formData.content.trim()) {
      setError('Lesson title and study notes content are required.');
      return;
    }

    setLoading(true);
    try {
      const translations = {};
      if (teTrans.title.trim() && teTrans.content.trim()) {
        translations.te = { title: teTrans.title.trim(), content: teTrans.content.trim() };
      }
      if (hiTrans.title.trim() && hiTrans.content.trim()) {
        translations.hi = { title: hiTrans.title.trim(), content: hiTrans.content.trim() };
      }

      const lessonRes = await axios.post('/api/lessons', {
        ...formData,
        course_id: parseInt(courseId, 10),
        translations: Object.keys(translations).length ? translations : undefined,
      });

      const createdLessonId = lessonRes.data.lesson.id;
      if (formData.lesson_type === 'quiz') {
        const validQs = quizQuestions.filter(
          (q) => q.question.trim() && q.options.every((o) => o.trim())
        );
        for (const [idx, q] of validQs.entries()) {
          await axios.post('/api/assessments', {
            lesson_id: createdLessonId,
            question: q.question.trim(),
            options: q.options.map((o) => o.trim()),
            correct_answer: Number(q.correct),
            points: 1,
            order_index: idx + 1,
          });
        }
      }

      showToast('Lesson added to course!', 'success');
      navigate(`/courses/${courseId}`);
    } catch (err) {
      setError(err.response?.data?.message || 'Error creating lesson');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Container maxWidth="md" sx={{ py: 4 }}>
      <Button startIcon={<ArrowBack />} onClick={() => navigate(`/courses/${courseId}`)} sx={{ mb: 2 }}>
        Back to Course
      </Button>

      <Paper className="glass-panel" sx={{ p: { xs: 3, sm: 4 } }}>
        <Typography variant="h4" component="h1" fontWeight={800} gutterBottom>
          Add New Lesson
        </Typography>

        {error && (
          <Alert severity="error" sx={{ mb: 3 }}>
            {error}
          </Alert>
        )}

        <Box component="form" onSubmit={handleSubmit}>
          <Grid container spacing={2.5}>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Lesson Title"
                name="title"
                value={formData.title}
                onChange={handleChange}
                required
              />
            </Grid>

            <Grid item xs={12} sm={4}>
              <TextField
                select
                fullWidth
                label="Lesson Type"
                name="lesson_type"
                value={formData.lesson_type}
                onChange={handleChange}
              >
                <MenuItem value="text">Text / Illustrated Notes</MenuItem>
                <MenuItem value="audio">Audio Lesson (Voice)</MenuItem>
                <MenuItem value="video">Video Lesson</MenuItem>
                <MenuItem value="pdf">PDF Document</MenuItem>
                <MenuItem value="image">Diagram / Image</MenuItem>
                <MenuItem value="quiz">Interactive Practice Quiz</MenuItem>
              </TextField>
            </Grid>

            <Grid item xs={6} sm={4}>
              <TextField
                fullWidth
                type="number"
                label="Order Index"
                name="order_index"
                value={formData.order_index}
                onChange={handleChange}
              />
            </Grid>

            <Grid item xs={6} sm={4}>
              <TextField
                fullWidth
                type="number"
                label="Duration (Minutes)"
                name="duration_minutes"
                value={formData.duration_minutes}
                onChange={handleChange}
              />
            </Grid>

            <Grid item xs={12}>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems={{ sm: 'center' }}>
                <TextField
                  fullWidth
                  size="small"
                  label="Audio Narration URL (optional MP3/WAV/OGG)"
                  name="audio_url"
                  value={formData.audio_url}
                  onChange={handleChange}
                />
                <Button
                  variant="outlined"
                  component="label"
                  startIcon={<CloudUpload />}
                  disabled={uploading}
                  sx={{ whiteSpace: 'nowrap' }}
                >
                  Upload Audio
                  <input
                    type="file"
                    hidden
                    accept=".mp3,.wav,.ogg,.m4a"
                    onChange={(e) => handleFileUpload(e, 'audio_url')}
                  />
                </Button>
              </Stack>
            </Grid>

            {formData.lesson_type === 'video' && (
              <Grid item xs={12}>
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems={{ sm: 'center' }}>
                  <TextField
                    fullWidth
                    size="small"
                    label="Video URL"
                    name="video_url"
                    value={formData.video_url}
                    onChange={handleChange}
                  />
                  <Button
                    variant="outlined"
                    component="label"
                    startIcon={<CloudUpload />}
                    disabled={uploading}
                    sx={{ whiteSpace: 'nowrap' }}
                  >
                    Upload Video
                    <input
                      type="file"
                      hidden
                      accept="video/mp4,video/webm"
                      onChange={(e) => handleFileUpload(e, 'video_url')}
                    />
                  </Button>
                </Stack>
              </Grid>
            )}

            {formData.lesson_type === 'pdf' && (
              <Grid item xs={12}>
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems={{ sm: 'center' }}>
                  <TextField
                    fullWidth
                    size="small"
                    label="PDF Document URL"
                    name="pdf_url"
                    value={formData.pdf_url}
                    onChange={handleChange}
                  />
                  <Button
                    variant="outlined"
                    component="label"
                    startIcon={<CloudUpload />}
                    disabled={uploading}
                    sx={{ whiteSpace: 'nowrap' }}
                  >
                    Upload PDF
                    <input
                      type="file"
                      hidden
                      accept="application/pdf"
                      onChange={(e) => handleFileUpload(e, 'pdf_url')}
                    />
                  </Button>
                </Stack>
              </Grid>
            )}

            {formData.lesson_type === 'image' && (
              <>
                <Grid item xs={12} sm={7}>
                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems={{ sm: 'center' }}>
                    <TextField
                      fullWidth
                      size="small"
                      label="Diagram / Image URL"
                      name="image_url"
                      value={formData.image_url}
                      onChange={handleChange}
                    />
                    <Button
                      variant="outlined"
                      component="label"
                      startIcon={<CloudUpload />}
                      disabled={uploading}
                      sx={{ whiteSpace: 'nowrap' }}
                    >
                      Upload Image
                      <input
                        type="file"
                        hidden
                        accept=".jpg,.jpeg,.png,.webp"
                        onChange={(e) => handleFileUpload(e, 'image_url')}
                      />
                    </Button>
                  </Stack>
                </Grid>
                <Grid item xs={12} sm={5}>
                  <TextField
                    fullWidth
                    size="small"
                    label="Accessible Image Alt Text"
                    name="alt_text"
                    value={formData.alt_text}
                    onChange={handleChange}
                  />
                </Grid>
              </>
            )}

            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Lesson Content / Study Notes"
                name="content"
                value={formData.content}
                onChange={handleChange}
                multiline
                rows={6}
                required
              />
            </Grid>

            <Grid item xs={12}>
              <Accordion variant="outlined">
                <AccordionSummary expandIcon={<ExpandMore />}>
                  <Stack direction="row" spacing={1} alignItems="center">
                    <Translate color="primary" fontSize="small" />
                    <Typography fontWeight={700}>
                      Optional Multilingual Lesson Content (Telugu / Hindi)
                    </Typography>
                  </Stack>
                </AccordionSummary>
                <AccordionDetails>
                  <Grid container spacing={2}>
                    <Grid item xs={12} sm={6}>
                      <TextField
                        fullWidth
                        size="small"
                        label="Telugu Lesson Title"
                        value={teTrans.title}
                        onChange={(e) => setTeTrans((p) => ({ ...p, title: e.target.value }))}
                      />
                    </Grid>
                    <Grid item xs={12} sm={6}>
                      <TextField
                        fullWidth
                        size="small"
                        label="Hindi Lesson Title"
                        value={hiTrans.title}
                        onChange={(e) => setHiTrans((p) => ({ ...p, title: e.target.value }))}
                      />
                    </Grid>
                    <Grid item xs={12} sm={6}>
                      <TextField
                        fullWidth
                        size="small"
                        multiline
                        rows={4}
                        label="Telugu Lesson Text"
                        value={teTrans.content}
                        onChange={(e) => setTeTrans((p) => ({ ...p, content: e.target.value }))}
                      />
                    </Grid>
                    <Grid item xs={12} sm={6}>
                      <TextField
                        fullWidth
                        size="small"
                        multiline
                        rows={4}
                        label="Hindi Lesson Text"
                        value={hiTrans.content}
                        onChange={(e) => setHiTrans((p) => ({ ...p, content: e.target.value }))}
                      />
                    </Grid>
                  </Grid>
                </AccordionDetails>
              </Accordion>
            </Grid>

            {formData.lesson_type === 'quiz' && (
              <Grid item xs={12}>
                <Divider sx={{ my: 1 }} />
                <Typography variant="h6" fontWeight={700} gutterBottom>
                  Inline Knowledge Check Questions
                </Typography>
                {quizQuestions.map((q, qIdx) => (
                  <Paper key={qIdx} variant="outlined" sx={{ p: 2, mb: 2 }}>
                    <Stack direction="row" justifyContent="space-between" mb={1}>
                      <Typography fontWeight={700}>Question {qIdx + 1}</Typography>
                      {quizQuestions.length > 1 && (
                        <IconButton
                          color="error"
                          size="small"
                          onClick={() =>
                            setQuizQuestions((prev) => prev.filter((_, i) => i !== qIdx))
                          }
                        >
                          <Delete fontSize="small" />
                        </IconButton>
                      )}
                    </Stack>
                    <TextField
                      fullWidth
                      size="small"
                      label="Question"
                      value={q.question}
                      onChange={(e) => {
                        const next = [...quizQuestions];
                        next[qIdx] = { ...next[qIdx], question: e.target.value };
                        setQuizQuestions(next);
                      }}
                      sx={{ mb: 1.5 }}
                    />
                    <Grid container spacing={1.5}>
                      {q.options.map((opt, oIdx) => (
                        <Grid item xs={12} sm={6} key={oIdx}>
                          <TextField
                            fullWidth
                            size="small"
                            label={`Option ${oIdx + 1}`}
                            value={opt}
                            onChange={(e) => {
                              const next = [...quizQuestions];
                              const opts = [...next[qIdx].options];
                              opts[oIdx] = e.target.value;
                              next[qIdx] = { ...next[qIdx], options: opts };
                              setQuizQuestions(next);
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
                          value={q.correct}
                          onChange={(e) => {
                            const next = [...quizQuestions];
                            next[qIdx] = { ...next[qIdx], correct: Number(e.target.value) };
                            setQuizQuestions(next);
                          }}
                        >
                          {q.options.map((_, oIdx) => (
                            <MenuItem key={oIdx} value={oIdx}>
                              Option {oIdx + 1}
                            </MenuItem>
                          ))}
                        </TextField>
                      </Grid>
                    </Grid>
                  </Paper>
                ))}
                <Button
                  variant="outlined"
                  startIcon={<Add />}
                  onClick={() =>
                    setQuizQuestions((prev) => [
                      ...prev,
                      { question: '', options: ['', '', '', ''], correct: 0 },
                    ])
                  }
                >
                  Add Question
                </Button>
              </Grid>
            )}
          </Grid>

          <Box sx={{ mt: 3.5, display: 'flex', justifyContent: 'flex-end' }}>
            <Button
              type="submit"
              variant="contained"
              size="large"
              startIcon={<Save />}
              disabled={loading || uploading}
              sx={{ fontWeight: 700 }}
            >
              {loading ? 'Saving...' : 'Save Lesson'}
            </Button>
          </Box>
        </Box>
      </Paper>
    </Container>
  );
};

export default AddLesson;
