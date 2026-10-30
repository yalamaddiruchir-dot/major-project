import React, { useState } from 'react';
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
} from '@mui/material';
import { ArrowBack, AddCircle, CloudUpload } from '@mui/icons-material';
import { useNavigate, useParams } from 'react-router-dom';
import axios from 'axios';

const AddLesson = () => {
    const { courseId } = useParams();
    const navigate = useNavigate();
    const [formData, setFormData] = useState({
        title: '',
        description: '',
        content: '',
        lesson_type: 'video',
        video_url: '',
        duration_minutes: 15,
        course_id: courseId
    });
    const [loading, setLoading] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [error, setError] = useState('');
    const [quiz, setQuiz] = useState({ question: '', options: ['', '', '', ''], correct_answer: '0', points: 1 });

    const handleChange = (e) => {
        setFormData({
            ...formData,
            [e.target.name]: e.target.value
        });
    };

    const handleFileChange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        setUploading(true);
        setError('');

        const uploadData = new FormData();
        uploadData.append('file', file);

        try {
            const response = await axios.post('/api/upload', uploadData, {
                headers: {
                    'Content-Type': 'multipart/form-data'
                }
            });

            setFormData(prev => ({
                ...prev,
                video_url: response.data.url
            }));
        } catch (err) {
            setError('File upload failed. Please try again.');
            console.error(err);
        } finally {
            setUploading(false);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        // Basic validation for video URL
        if (formData.lesson_type === 'video' && !formData.video_url) {
            setError('Video URL is required for video lessons');
            setLoading(false);
            return;
        }

        const question = quiz.question.trim();
        const options = quiz.options.map((option) => option.trim());
        if (question && (options.some((option) => !option) || !Number.isInteger(Number(quiz.points)) || Number(quiz.points) < 1 || Number(quiz.points) > 100)) {
            setError('Complete all four answer options and choose a point value between 1 and 100.');
            setLoading(false);
            return;
        }

        try {
            const lessonResponse = await axios.post('/api/lessons', formData);
            if (question) {
                try {
                    await axios.post('/api/assessments', {
                        lesson_id: lessonResponse.data.lesson.id,
                        question,
                        options,
                        correct_answer: Number(quiz.correct_answer),
                        points: Number(quiz.points),
                    });
                } catch (assessmentError) {
                    setError(`Lesson created, but the assessment could not be saved: ${assessmentError.response?.data?.message || 'Please try again from the lesson editor.'}`);
                    setLoading(false);
                    return;
                }
            }
            navigate(`/admin/courses/edit/${courseId}`);
        } catch (err) {
            setError(err.response?.data?.message || 'Failed to create lesson');
            setLoading(false);
        }
    };

    return (
        <Container maxWidth="md" sx={{ py: 8 }}>
            <Button
                startIcon={<ArrowBack />}
                onClick={() => navigate(`/admin/courses/edit/${courseId}`)}
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
                            <AddCircle sx={{ fontSize: 40, color: '#667eea' }} />
                        </Box>
                        <Typography variant="h4" component="h1" fontWeight="bold">
                            Add New Module
                        </Typography>
                        <Typography color="text.secondary">
                            Create a new lesson for this course
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
                                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                                    <Button
                                        variant="outlined"
                                        component="label"
                                        startIcon={uploading ? <CircularProgress size={20} /> : <CloudUpload />}
                                        disabled={uploading}
                                    >
                                        {uploading ? 'Uploading...' : 'Upload Video'}
                                        <input
                                            type="file"
                                            hidden
                                            accept="video/*"
                                            onChange={handleFileChange}
                                        />
                                    </Button>

                                    <TextField
                                        label="Video URL"
                                        name="video_url"
                                        value={formData.video_url}
                                        onChange={handleChange}
                                        fullWidth
                                        helperText="Upload a video or enter a YouTube URL"
                                        InputProps={{
                                            readOnly: uploading,
                                        }}
                                    />
                                </Box>
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

                            <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, p: 2 }}>
                                <Typography variant="h6" fontWeight="bold" gutterBottom>Optional Lesson Quiz</Typography>
                                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>Add one multiple-choice question. Leave the question blank if this lesson does not need a quiz.</Typography>
                                <TextField
                                    label="Question"
                                    value={quiz.question}
                                    onChange={(event) => setQuiz((current) => ({ ...current, question: event.target.value }))}
                                    fullWidth
                                    multiline
                                    rows={2}
                                    sx={{ mb: 2 }}
                                />
                                {quiz.options.map((option, index) => (
                                    <TextField
                                        key={index}
                                        label={`Option ${index + 1}`}
                                        value={option}
                                        onChange={(event) => setQuiz((current) => ({ ...current, options: current.options.map((item, itemIndex) => itemIndex === index ? event.target.value : item) }))}
                                        fullWidth
                                        sx={{ mb: 1.5 }}
                                    />
                                ))}
                                <FormControl fullWidth sx={{ mb: 2 }}>
                                    <InputLabel>Correct answer</InputLabel>
                                    <Select
                                        value={quiz.correct_answer}
                                        label="Correct answer"
                                        onChange={(event) => setQuiz((current) => ({ ...current, correct_answer: event.target.value }))}
                                    >
                                        {quiz.options.map((_option, index) => <MenuItem key={index} value={String(index)}>Option {index + 1}</MenuItem>)}
                                    </Select>
                                </FormControl>
                                <TextField
                                    label="Points"
                                    type="number"
                                    value={quiz.points}
                                    onChange={(event) => setQuiz((current) => ({ ...current, points: event.target.value }))}
                                    inputProps={{ min: 1, max: 100 }}
                                    fullWidth
                                />
                            </Box>

                            <Button
                                type="submit"
                                variant="contained"
                                size="large"
                                disabled={loading || uploading}
                                sx={{
                                    mt: 2,
                                    py: 1.5,
                                    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                                    fontWeight: 'bold'
                                }}
                            >
                                {loading ? <CircularProgress size={24} color="inherit" /> : 'Create Module'}
                            </Button>
                        </Box>
                    </form>
                </CardContent>
            </Card>
        </Container>
    );
};

export default AddLesson;
