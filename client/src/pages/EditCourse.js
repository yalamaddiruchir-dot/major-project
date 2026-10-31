import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
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
  List,
  ListItem,
  ListItemText,
  IconButton,
  Stack,
  Divider,
  Accordion,
  AccordionSummary,
  AccordionDetails,
} from '@mui/material';
import {
  ArrowBack,
  Save,
  Add,
  Edit,
  Delete,
  ArrowUpward,
  ArrowDownward,
  ExpandMore,
  Translate,
} from '@mui/icons-material';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import ConfirmDialog from '../components/ConfirmDialog';

const CATEGORIES = [
  'Digital Literacy',
  'Computer Science',
  'Mathematics',
  'Science',
  'Language',
  'Vocational',
  'Office Applications',
  'Digital Communication',
];

const EditCourse = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showToast } = useToast();

  const [formData, setFormData] = useState({
    title: '',
    description: '',
    category: 'Digital Literacy',
    language: 'en',
    thumbnail_url: '',
  });
  const [teTrans, setTeTrans] = useState({ title: '', description: '' });
  const [hiTrans, setHiTrans] = useState({ title: '', description: '' });
  const [lessons, setLessons] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [deleteLessonTarget, setDeleteLessonTarget] = useState(null);

  const dashboardBackPath = user?.role === 'admin' ? '/admin' : '/teacher';

  const fetchCourse = useCallback(async () => {
    setLoading(true);
    try {
      const response = await axios.get(`/api/courses/${id}`);
      const course = response.data.course;
      setFormData({
        title: course.title || '',
        description: course.description || '',
        category: course.category || 'Digital Literacy',
        language: course.language || 'en',
        thumbnail_url: course.thumbnail_url || '',
      });
      setLessons(course.lessons || []);

      const trMap = course.translations || {};
      if (trMap.te) setTeTrans({ title: trMap.te.title || '', description: trMap.te.description || '' });
      if (trMap.hi) setHiTrans({ title: trMap.hi.title || '', description: trMap.hi.description || '' });
    } catch (_err) {
      setError('Failed to load course details.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchCourse();
  }, [fetchCourse]);

  const handleChange = (e) => {
    setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      const translations = {};
      if (teTrans.title.trim()) {
        translations.te = { title: teTrans.title.trim(), description: teTrans.description.trim() };
      }
      if (hiTrans.title.trim()) {
        translations.hi = { title: hiTrans.title.trim(), description: hiTrans.description.trim() };
      }

      await axios.put(`/api/courses/${id}`, {
        ...formData,
        translations: Object.keys(translations).length ? translations : undefined,
      });
      showToast('Course updated successfully!', 'success');
      fetchCourse();
    } catch (err) {
      setError(err.response?.data?.message || 'Error updating course');
    } finally {
      setSaving(false);
    }
  };

  const handleMoveLesson = async (index, direction) => {
    const targetIdx = index + direction;
    if (targetIdx < 0 || targetIdx >= lessons.length) return;
    const reordered = [...lessons];
    const [moved] = reordered.splice(index, 1);
    reordered.splice(targetIdx, 0, moved);
    setLessons(reordered);

    try {
      await Promise.all(
        reordered.map((l, idx) => axios.put(`/api/lessons/${l.id}`, { order_index: idx + 1 }))
      );
      showToast('Lesson order saved.', 'info');
    } catch (_e) {
      showToast('Could not save lesson order.', 'error');
      fetchCourse();
    }
  };

  const handleDeleteLesson = async () => {
    if (!deleteLessonTarget) return;
    try {
      await axios.delete(`/api/lessons/${deleteLessonTarget.id}`);
      showToast('Lesson deleted.', 'info');
      setDeleteLessonTarget(null);
      fetchCourse();
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to delete lesson', 'error');
    }
  };

  if (loading) {
    return (
      <Container maxWidth="md" sx={{ py: 5 }}>
        <Skeleton variant="rounded" height={380} />
      </Container>
    );
  }

  return (
    <Container maxWidth="md" sx={{ py: 4 }}>
      <Stack direction="row" justifyContent="space-between" mb={2}>
        <Button startIcon={<ArrowBack />} onClick={() => navigate(dashboardBackPath)}>
          Back to Dashboard
        </Button>
        <Button variant="outlined" component={Link} to={`/courses/${id}`}>
          View Live Course
        </Button>
      </Stack>

      <Paper className="glass-panel" sx={{ p: { xs: 3, sm: 4 }, mb: 4 }}>
        <Typography variant="h4" component="h1" fontWeight={800} gutterBottom>
          Edit Course
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
                label="Course Title"
                name="title"
                value={formData.title}
                onChange={handleChange}
                required
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Course Description"
                name="description"
                value={formData.description}
                onChange={handleChange}
                multiline
                rows={4}
                required
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                select
                fullWidth
                label="Category"
                name="category"
                value={formData.category}
                onChange={handleChange}
              >
                {CATEGORIES.map((option) => (
                  <MenuItem key={option} value={option}>
                    {option}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                select
                fullWidth
                label="Primary Language"
                name="language"
                value={formData.language}
                onChange={handleChange}
              >
                <MenuItem value="en">English (en)</MenuItem>
                <MenuItem value="te">తెలుగు / Telugu (te)</MenuItem>
                <MenuItem value="hi">हिन्दी / Hindi (hi)</MenuItem>
              </TextField>
            </Grid>

            <Grid item xs={12}>
              <Accordion variant="outlined">
                <AccordionSummary expandIcon={<ExpandMore />}>
                  <Stack direction="row" spacing={1} alignItems="center">
                    <Translate color="primary" fontSize="small" />
                    <Typography fontWeight={700}>
                      Multilingual Course Translations (Telugu / Hindi)
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
                        rows={2}
                        label="Telugu Description"
                        value={teTrans.description}
                        onChange={(e) => setTeTrans((p) => ({ ...p, description: e.target.value }))}
                      />
                    </Grid>
                    <Grid item xs={12} sm={6}>
                      <TextField
                        fullWidth
                        size="small"
                        multiline
                        rows={2}
                        label="Hindi Description"
                        value={hiTrans.description}
                        onChange={(e) => setHiTrans((p) => ({ ...p, description: e.target.value }))}
                      />
                    </Grid>
                  </Grid>
                </AccordionDetails>
              </Accordion>
            </Grid>
          </Grid>

          <Box sx={{ mt: 3, display: 'flex', justifyContent: 'flex-end' }}>
            <Button type="submit" variant="contained" startIcon={<Save />} disabled={saving}>
              {saving ? 'Saving...' : 'Save Course Changes'}
            </Button>
          </Box>
        </Box>
      </Paper>

      <Paper className="glass-panel" sx={{ p: { xs: 3, sm: 4 } }}>
        <Stack direction="row" justifyContent="space-between" alignItems="center" mb={2}>
          <Typography variant="h5" fontWeight={800}>
            Course Lessons ({lessons.length})
          </Typography>
          <Button
            variant="contained"
            size="small"
            component={Link}
            to={`/teacher/courses/${id}/lessons/add`}
            startIcon={<Add />}
          >
            Add Lesson
          </Button>
        </Stack>
        <Divider sx={{ mb: 1 }} />

        {lessons.length === 0 ? (
          <Typography color="text.secondary" sx={{ py: 2 }}>
            No lessons added to this course yet.
          </Typography>
        ) : (
          <List disablePadding>
            {lessons.map((lesson, idx) => (
              <ListItem
                key={lesson.id}
                divider={idx < lessons.length - 1}
                sx={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1 }}
              >
                <ListItemText
                  primary={`${idx + 1}. ${lesson.title}`}
                  secondary={`Type: ${(lesson.lesson_type || 'text').toUpperCase()} • ${lesson.duration_minutes || 0} min`}
                />
                <Stack direction="row" spacing={0.5}>
                  <IconButton
                    size="small"
                    disabled={idx === 0}
                    aria-label="Move lesson up"
                    onClick={() => handleMoveLesson(idx, -1)}
                  >
                    <ArrowUpward fontSize="small" />
                  </IconButton>
                  <IconButton
                    size="small"
                    disabled={idx === lessons.length - 1}
                    aria-label="Move lesson down"
                    onClick={() => handleMoveLesson(idx, 1)}
                  >
                    <ArrowDownward fontSize="small" />
                  </IconButton>
                  <Button
                    size="small"
                    component={Link}
                    to={`/teacher/lessons/edit/${lesson.id}`}
                    startIcon={<Edit />}
                  >
                    Edit
                  </Button>
                  <IconButton
                    color="error"
                    size="small"
                    aria-label={`Delete lesson ${lesson.title}`}
                    onClick={() => setDeleteLessonTarget(lesson)}
                  >
                    <Delete fontSize="small" />
                  </IconButton>
                </Stack>
              </ListItem>
            ))}
          </List>
        )}
      </Paper>

      <ConfirmDialog
        open={Boolean(deleteLessonTarget)}
        title="Delete Lesson?"
        message={`Are you sure you want to delete lesson "${deleteLessonTarget?.title}"?`}
        confirmLabel="Delete"
        onConfirm={handleDeleteLesson}
        onCancel={() => setDeleteLessonTarget(null)}
      />
    </Container>
  );
};

export default EditCourse;
