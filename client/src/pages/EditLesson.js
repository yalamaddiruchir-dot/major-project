import React, { useState, useEffect } from 'react';
import {
    Container,
    Typography,
    Box,
    TextField,
    Button,
    Card,
    CardContent,
    FormControl,
    InputLabel,
    Select,
    MenuItem,
    Alert,
    CircularProgress
} from '@mui/material';
import { ArrowBack, Save } from '@mui/icons-material';
import { useNavigate, useParams } from 'react-router-dom';
import axios from 'axios';

const EditLesson = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const [formData, setFormData] = useState({
        title: '',
        description: '',
        content: '',
        lesson_type: 'video',
        video_url: '',
        duration_minutes: 15,
        course_id: null
    });
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        fetchLesson();
        // eslint-disable-next-line
    }, [id]);

    const fetchLesson = async () => {
        try {
            const response = await axios.get(`/api/lessons/${id}`);
            const lesson = response.data.lesson;
            setFormData({
                title: lesson.title,
                description: lesson.description || '',
                content: lesson.content || '',
                lesson_type: lesson.lesson_type || 'text',
                video_url: lesson.video_url || '',
                duration_minutes: lesson.duration_minutes || 15,
                course_id: lesson.course_id
            });
            setLoading(false);
        } catch (err) {
            console.error('Error fetching lesson:', err);
            setError('Failed to load lesson details');
            setLoading(false);
        }
    };

    const handleChange = (e) => {
        setFormData({
            ...formData,
            [e.target.name]: e.target.value
        });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setSaving(true);
        setError('');

        if (formData.lesson_type === 'video' && !formData.video_url) {
            setError('Video URL is required for video lessons');
            setSaving(false);
            return;
        }

        try {
            await axios.put(`/api/lessons/${id}`, formData);
            navigate(`/admin/courses/edit/${formData.course_id}`);
        } catch (err) {
            setError(err.response?.data?.message || 'Failed to update lesson');
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <Box display="flex" justifyContent="center" alignItems="center" minHeight="60vh">
                <CircularProgress />
            </Box>
        );
    }

    return (
        <Container maxWidth="md" sx={{ py: 8 }}>
            <Button
                startIcon={<ArrowBack />}
                onClick={() => navigate(`/admin/courses/edit/${formData.course_id}`)}
                sx={{ mb: 4 }}
            >
                Back to Course
            </Button>

            <Card className="glass-panel">
                <CardContent sx={{ p: 4 }}>
                    <Box sx={{ mb: 4, textAlign: 'center' }}>
                        <Box sx={{
                            display: 'inline-flex',
                            p: 2,
                            borderRadius: '50%',
                            bgcolor: 'rgba(102, 126, 234, 0.1)',
                            mb: 2
                        }}>
                            <Save sx={{ fontSize: 40, color: '#667eea' }} />
                        </Box>
                        <Typography variant="h4" component="h1" fontWeight="bold">
                            Edit Module
                        </Typography>
                        <Typography color="text.secondary">
                            Update lesson content and details
                        </Typography>
                    </Box>

                    {error && <Alert severity="error" sx={{ mb: 3 }}>{error}</Alert>}

                    <form onSubmit={handleSubmit}>
                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                            <TextField
                                label="Lesson Title"
                                name="title"
                                value={formData.title}
                                onChange={handleChange}
                                required
                                fullWidth
                            />

                            <TextField
                                label="Description"
                                name="description"
                                value={formData.description}
                                onChange={handleChange}
                                multiline
                                rows={2}
                                fullWidth
                            />

                            <FormControl fullWidth>
                                <InputLabel>Lesson Type</InputLabel>
                                <Select
                                    name="lesson_type"
                                    value={formData.lesson_type}
                                    label="Lesson Type"
                                    onChange={handleChange}
                                >
                                    <MenuItem value="text">Text / Article</MenuItem>
                                    <MenuItem value="video">Video</MenuItem>
                                </Select>
                            </FormControl>

                            {formData.lesson_type === 'video' && (
                                <TextField
                                    label="Video URL (YouTube)"
                                    name="video_url"
                                    value={formData.video_url}
                                    onChange={handleChange}
                                    fullWidth
                                    helperText="Enter the full YouTube URL"
                                />
                            )}

                            <TextField
                                label="Content / Notes"
                                name="content"
                                value={formData.content}
                                onChange={handleChange}
                                multiline
                                rows={6}
                                required
                                fullWidth
                                helperText="Enter the main text content or additional notes for this lesson."
                            />

                            <TextField
                                label="Duration (minutes)"
                                name="duration_minutes"
                                type="number"
                                value={formData.duration_minutes}
                                onChange={handleChange}
                                fullWidth
                            />

                            <Button
                                type="submit"
                                variant="contained"
                                size="large"
                                disabled={saving}
                                sx={{
                                    mt: 2,
                                    py: 1.5,
                                    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                                    fontWeight: 'bold'
                                }}
                            >
                                {saving ? <CircularProgress size={24} color="inherit" /> : 'Save Changes'}
                            </Button>
                        </Box>
                    </form>
                </CardContent>
            </Card>
        </Container>
    );
};

export default EditLesson;
