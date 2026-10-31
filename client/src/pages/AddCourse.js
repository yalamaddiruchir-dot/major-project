import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Container,
  Typography,
  Box,
  TextField,
  Button,
  Paper,
  MenuItem,
  Alert,
  Grid,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Stack,
} from '@mui/material';
import { ArrowBack, Save, ExpandMore, Translate, UploadFile } from '@mui/icons-material';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';

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

const AddCourse = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showToast } = useToast();

  const [formData, setFormData] = useState({
    title: '',
    description: '',
    category: 'Digital Literacy',
    level: 'beginner',
    language: 'en',
    thumbnail_url: '',
  });
  const [teTrans, setTeTrans] = useState({ title: '', description: '' });
  const [hiTrans, setHiTrans] = useState({ title: '', description: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const dashboardBackPath = user?.role === 'admin' ? '/admin' : '/teacher';

  const handleChange = (e) => {
    setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleThumbnailUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await axios.post('/api/upload?purpose=thumbnail', fd);
      setFormData((prev) => ({ ...prev, thumbnail_url: res.data.url }));
      showToast('Course thumbnail uploaded!', 'success');
    } catch (err) {
      showToast(err.response?.data?.message || 'Thumbnail upload failed', 'error');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!formData.title.trim()) {
      setError('Course title is required.');
      return;
    }

    setLoading(true);
    try {
      const translations = {};
      if (teTrans.title.trim()) {
        translations.te = { title: teTrans.title.trim(), description: teTrans.description.trim() };
      }
      if (hiTrans.title.trim()) {
        translations.hi = { title: hiTrans.title.trim(), description: hiTrans.description.trim() };
      }

      const res = await axios.post('/api/courses', {
        ...formData,
        title: formData.title.trim(),
        translations: Object.keys(translations).length ? translations : undefined,
      });

      showToast('Course created successfully!', 'success');
      navigate(`/courses/${res.data.course.id}`);
    } catch (err) {
      setError(err.response?.data?.message || 'Error creating course');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Container maxWidth="md" sx={{ py: 4 }}>
      <Button startIcon={<ArrowBack />} onClick={() => navigate(dashboardBackPath)} sx={{ mb: 2 }}>
        Back to Dashboard
      </Button>

      <Paper className="glass-panel" sx={{ p: { xs: 3, sm: 4 } }}>
        <Typography variant="h4" component="h1" fontWeight={800} gutterBottom>
          Create New Course
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

            <Grid item xs={12} sm={4}>
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

            <Grid item xs={12} sm={4}>
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

            <Grid item xs={12} sm={4}>
              <TextField
                select
                fullWidth
                label="Difficulty Level"
                name="level"
                value={formData.level}
                onChange={handleChange}
              >
                <MenuItem value="beginner">Beginner</MenuItem>
                <MenuItem value="intermediate">Intermediate</MenuItem>
                <MenuItem value="advanced">Advanced</MenuItem>
              </TextField>
            </Grid>

            <Grid item xs={12}>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems={{ sm: 'center' }}>
                <TextField
                  fullWidth
                  size="small"
                  label="Thumbnail URL (optional)"
                  name="thumbnail_url"
                  value={formData.thumbnail_url}
                  onChange={handleChange}
                />
                <Button variant="outlined" component="label" startIcon={<UploadFile />} sx={{ whiteSpace: 'nowrap' }}>
                  Upload Image
                  <input type="file" hidden accept=".jpg,.jpeg,.png,.webp" onChange={handleThumbnailUpload} />
                </Button>
              </Stack>
            </Grid>

            <Grid item xs={12}>
              <Accordion variant="outlined">
                <AccordionSummary expandIcon={<ExpandMore />}>
                  <Stack direction="row" spacing={1} alignItems="center">
                    <Translate color="primary" fontSize="small" />
                    <Typography fontWeight={700}>
                      Optional Multilingual Course Translations (Telugu / Hindi)
                    </Typography>
                  </Stack>
                </AccordionSummary>
                <AccordionDetails>
                  <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 2 }}>
                    Provide verified teacher-authored translations so students browsing in Telugu or Hindi see localized titles and descriptions.
                  </Typography>
                  <Grid container spacing={2}>
                    <Grid item xs={12} sm={6}>
                      <TextField
                        fullWidth
                        size="small"
                        label="Telugu Title (తెలుగు శీర్షిక)"
                        value={teTrans.title}
                        onChange={(e) => setTeTrans((p) => ({ ...p, title: e.target.value }))}
                      />
                    </Grid>
                    <Grid item xs={12} sm={6}>
                      <TextField
                        fullWidth
                        size="small"
                        label="Hindi Title (हिन्दी शीर्षक)"
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

          <Box sx={{ mt: 3.5, display: 'flex', justifyContent: 'flex-end' }}>
            <Button
              type="submit"
              variant="contained"
              size="large"
              startIcon={<Save />}
              disabled={loading}
              sx={{ fontWeight: 700 }}
            >
              {loading ? 'Creating...' : 'Create Course'}
            </Button>
          </Box>
        </Box>
      </Paper>
    </Container>
  );
};

export default AddCourse;
