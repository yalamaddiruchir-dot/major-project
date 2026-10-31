import React, { useState, useEffect } from 'react';
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
  Skeleton,
  Grid,
  Stack,
  Accordion,
  AccordionSummary,
  AccordionDetails,
} from '@mui/material';
import { ArrowBack, Save, CloudUpload, ExpandMore, Translate } from '@mui/icons-material';
import axios from 'axios';
import { useToast } from '../context/ToastContext';

const EditLesson = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [courseId, setCourseId] = useState(null);
  const [formData, setFormData] = useState({
    title: '',
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
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchLesson = async () => {
      try {
        const response = await axios.get(`/api/lessons/${id}`);
        const lesson = response.data.lesson;
        setCourseId(lesson.course_id);
        setFormData({
          title: lesson.title || '',
          content: lesson.content || '',
          lesson_type: lesson.lesson_type || 'text',
          video_url: lesson.video_url || '',
          audio_url: lesson.audio_url || '',
          pdf_url: lesson.pdf_url || '',
          image_url: lesson.image_url || '',
          alt_text: lesson.alt_text || '',
          order_index: lesson.order_index || 1,
          duration_minutes: lesson.duration_minutes || 15,
        });

        const trMap = lesson.translations || {};
        if (trMap.te) setTeTrans({ title: trMap.te.title || '', content: trMap.te.content || '' });
        if (trMap.hi) setHiTrans({ title: trMap.hi.title || '', content: trMap.hi.content || '' });
      } catch (_err) {
        setError('Failed to load lesson details.');
      } finally {
        setLoading(false);
      }
    };
    fetchLesson();
  }, [id]);

  const handleChange = (e) => {
    setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleFileUpload = async (e, targetField) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.append('file', file);
    setUploading(true);
    try {
      const res = await axios.post('/api/upload', fd);
      setFormData((prev) => ({
        ...prev,
        [targetField]: res.data.url,
        ...(targetField === 'video_url' && res.data.low_bandwidth_url && !prev.low_bandwidth_video_url
          ? { low_bandwidth_video_url: res.data.low_bandwidth_url }
          : {}),
      }));
      showToast(
        res.data.transcoded
          ? 'Video uploaded & auto-transcoded to 360p low-bandwidth + adaptive HLS!'
          : 'File uploaded!',
        'success'
      );
    } catch (err) {
      showToast(err.response?.data?.message || 'File upload failed', 'error');
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      const translations = {};
      if (teTrans.title.trim() && teTrans.content.trim()) {
        translations.te = { title: teTrans.title.trim(), content: teTrans.content.trim() };
      }
      if (hiTrans.title.trim() && hiTrans.content.trim()) {
        translations.hi = { title: hiTrans.title.trim(), content: hiTrans.content.trim() };
      }

      await axios.put(`/api/lessons/${id}`, {
        ...formData,
        translations: Object.keys(translations).length ? translations : undefined,
      });
      showToast('Lesson updated!', 'success');
      navigate(courseId ? `/courses/${courseId}` : '/teacher');
    } catch (err) {
      setError(err.response?.data?.message || 'Error updating lesson');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Container maxWidth="md" sx={{ py: 5 }}>
        <Skeleton variant="rounded" height={360} />
      </Container>
    );
  }

  return (
    <Container maxWidth="md" sx={{ py: 4 }}>
      <Button
        startIcon={<ArrowBack />}
        onClick={() => navigate(courseId ? `/courses/${courseId}` : '/teacher')}
        sx={{ mb: 2 }}
      >
        Back to Course
      </Button>

      <Paper className="glass-panel" sx={{ p: { xs: 3, sm: 4 } }}>
        <Typography variant="h4" component="h1" fontWeight={800} gutterBottom>
          Edit Lesson
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
                <MenuItem value="text">Text / Notes</MenuItem>
                <MenuItem value="audio">Audio Lesson</MenuItem>
                <MenuItem value="video">Video Lesson</MenuItem>
                <MenuItem value="pdf">PDF Document</MenuItem>
                <MenuItem value="image">Diagram / Image</MenuItem>
                <MenuItem value="quiz">Interactive Quiz</MenuItem>
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
                  label="Audio Narration URL"
                  name="audio_url"
                  value={formData.audio_url}
                  onChange={handleChange}
                />
                <Button variant="outlined" component="label" startIcon={<CloudUpload />} disabled={uploading}>
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
                <Button variant="outlined" component="label" startIcon={<CloudUpload />} disabled={uploading}>
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
                <Button variant="outlined" component="label" startIcon={<CloudUpload />} disabled={uploading}>
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
                      Multilingual Lesson Content (Telugu / Hindi)
                    </Typography>
                  </Stack>
                </AccordionSummary>
                <AccordionDetails>
                  <Grid container spacing={2}>
                    <Grid item xs={12} sm={6}>
                      <TextField
                        fullWidth
                        size="small"
                        label="Telugu Title"
                        value={teTrans.title}
                        onChange={(e) => setTeTrans((p) => ({ ...p, title: e.target.value }))}
                      />
                    </Grid>
                    <Grid item xs={12} sm={6}>
                      <TextField
                        fullWidth
                        size="small"
                        label="Hindi Title"
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
                        label="Telugu Content"
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
                        label="Hindi Content"
                        value={hiTrans.content}
                        onChange={(e) => setHiTrans((p) => ({ ...p, content: e.target.value }))}
                      />
                    </Grid>
                  </Grid>
                </AccordionDetails>
              </Accordion>
            </Grid>
          </Grid>

          <Box sx={{ mt: 3.5, display: 'flex', justifyContent: 'flex-end' }}>
            <Button type="submit" variant="contained" size="large" startIcon={<Save />} disabled={saving || uploading}>
              {saving ? 'Saving...' : 'Save Changes'}
            </Button>
          </Box>
        </Box>
      </Paper>
    </Container>
  );
};

export default EditLesson;
