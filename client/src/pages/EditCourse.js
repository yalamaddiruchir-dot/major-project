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
    CircularProgress,
    FormControlLabel,
    Switch
} from '@mui/material';
import { ArrowBack, Edit, AddCircle, Delete, PlayCircle } from '@mui/icons-material';
import { useNavigate, useParams } from 'react-router-dom';
import axios from 'axios';

const EditCourse = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const [formData, setFormData] = useState({
        title: '',
        description: '',
        category: '',
        language: '',
        thumbnail_url: '',
        is_active: true
    });
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        fetchCourse();
        // eslint-disable-next-line
    }, [id]);

    const fetchCourse = async () => {
        try {
            const response = await axios.get(`/api/courses/${id}`);
            const course = response.data.course;
            setFormData({
                title: course.title,
                description: course.description || '',
                category: course.category || '',
                language: course.language || 'english',
                thumbnail_url: course.thumbnail_url || '',
                is_active: course.is_active
            });
            setLoading(false);
        } catch (err) {
            console.error('Error fetching course:', err);
            setError('Failed to load course details');
            setLoading(false);
        }
    };

    const handleChange = (e) => {
        const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
        setFormData({
            ...formData,
            [e.target.name]: value
        });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setSaving(true);
        setError('');

        try {
            await axios.put(`/api/courses/${id}`, formData);
            navigate('/admin'); // Redirect back to dashboard on success
        } catch (err) {
            setError(err.response?.data?.message || 'Failed to update course');
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
                onClick={() => navigate('/admin')}
                sx={{ mb: 4 }}
            >
                Back to Dashboard
            </Button>

            <Card className="glass-panel" sx={{ mb: 6 }}>
                <CardContent sx={{ p: 4 }}>
                    <Box sx={{ mb: 4, textAlign: 'center' }}>
                        <Box sx={{
                            display: 'inline-flex',
                            p: 2,
                            borderRadius: '50%',
                            bgcolor: 'rgba(102, 126, 234, 0.1)',
                            mb: 2
                        }}>
                            <Edit sx={{ fontSize: 40, color: '#667eea' }} />
                        </Box>
                        <Typography variant="h4" component="h1" fontWeight="bold">
                            Edit Course
                        </Typography>
                        <Typography color="text.secondary">
                            Update course details
                        </Typography>
                    </Box>

                    {error && <Alert severity="error" sx={{ mb: 3 }}>{error}</Alert>}

                    <form onSubmit={handleSubmit}>
                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                            <TextField
                                label="Course Title"
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
                                rows={4}
                                required
                                fullWidth
                            />

                            <Box sx={{ display: 'flex', gap: 2 }}>
                                <FormControl fullWidth>
                                    <InputLabel>Category</InputLabel>
                                    <Select
                                        name="category"
                                        value={formData.category}
                                        label="Category"
                                        onChange={handleChange}
                                        required
                                    >
                                        <MenuItem value="Digital Literacy">Digital Literacy</MenuItem>
                                        <MenuItem value="Language">Language</MenuItem>
                                        <MenuItem value="Mathematics">Mathematics</MenuItem>
                                        <MenuItem value="Science">Science</MenuItem>
                                        <MenuItem value="Vocational">Vocational</MenuItem>
                                        <MenuItem value="Other">Other</MenuItem>
                                    </Select>
                                </FormControl>

                                <FormControl fullWidth>
                                    <InputLabel>Language</InputLabel>
                                    <Select
                                        name="language"
                                        value={formData.language}
                                        label="Language"
                                        onChange={handleChange}
                                    >
                                        <MenuItem value="english">English</MenuItem>
                                        <MenuItem value="hindi">Hindi</MenuItem>
                                        <MenuItem value="regional">Regional</MenuItem>
                                    </Select>
                                </FormControl>
                            </Box>

                            <TextField
                                label="Thumbnail URL (Optional)"
                                name="thumbnail_url"
                                value={formData.thumbnail_url}
                                onChange={handleChange}
                                fullWidth
                                helperText="Link to an image for the course card"
                            />

                            <FormControlLabel
                                control={
                                    <Switch
                                        checked={formData.is_active}
                                        onChange={handleChange}
                                        name="is_active"
                                        color="primary"
                                    />
                                }
                                label="Active Course"
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
                                {saving ? <CircularProgress size={24} color="inherit" /> : 'Update Course Details'}
                            </Button>
                        </Box>
                    </form>
                </CardContent>
            </Card>

            {/* Lesson Management Section */}
            <Card className="glass-panel">
                <CardContent sx={{ p: 4 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
                        <Typography variant="h5" component="h2" fontWeight="bold">
                            Course Modules (Lessons)
                        </Typography>
                        <Button
                            variant="outlined"
                            startIcon={<AddCircle />}
                            onClick={() => navigate(`/admin/courses/${id}/lessons/add`)}
                            sx={{
                                border: '2px solid',
                                fontWeight: 'bold',
                                ':hover': { border: '2px solid' }
                            }}
                        >
                            Add Lesson
                        </Button>
                    </Box>

                    {/* Lesson List Logic would go here. For now, we show a state where we can add content. */}
                    {/* In a continued implementation, we would fetch lessons from /api/lessons?course_id={id} */}

                    <Box sx={{
                        p: 4,
                        textAlign: 'center',
                        border: '2px dashed rgba(102, 126, 234, 0.3)',
                        borderRadius: 4,
                        bgcolor: 'rgba(255,255,255,0.3)',
                        transition: '0.3s',
                        ':hover': { bgcolor: 'rgba(255,255,255,0.5)', borderColor: '#667eea' }
                    }}>
                        <Typography color="text.secondary" sx={{ mb: 2, fontWeight: 500 }}>
                            Manage your course content here.
                        </Typography>
                        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                            Add video lessons, text articles, and quizzes to structure your course.
                        </Typography>
                        <Button
                            variant="contained"
                            size="large"
                            onClick={() => navigate(`/admin/courses/${id}/lessons/add`)}
                            className="hover-glow"
                            startIcon={<AddCircle />}
                            sx={{ borderRadius: '50px', px: 4 }}
                        >
                            Create First Module
                        </Button>
                    </Box>
                </CardContent>
            </Card>
        </Container>
    );
};

export default EditCourse;
