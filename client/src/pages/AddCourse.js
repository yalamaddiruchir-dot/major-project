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
    CircularProgress
} from '@mui/material';
import { ArrowBack, AddBox } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

const AddCourse = () => {
    const navigate = useNavigate();
    const [formData, setFormData] = useState({
        title: '',
        description: '',
        category: '',
        language: 'english',
        thumbnail_url: ''
    });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const handleChange = (e) => {
        setFormData({
            ...formData,
            [e.target.name]: e.target.value
        });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        try {
            await axios.post('/api/courses', formData);
            navigate('/admin'); // Redirect back to dashboard on success
        } catch (err) {
            setError(err.response?.data?.message || 'Failed to create course');
            setLoading(false);
        }
    };

    return (
        <Container maxWidth="md" sx={{ py: 8 }}>
            <Button
                startIcon={<ArrowBack />}
                onClick={() => navigate('/admin')}
                sx={{ mb: 4 }}
            >
                Back to Dashboard
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
                            <AddBox sx={{ fontSize: 40, color: '#667eea' }} />
                        </Box>
                        <Typography variant="h4" component="h1" fontWeight="bold">
                            Add New Course
                        </Typography>
                        <Typography color="text.secondary">
                            Create a new course for students
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

                            <Button
                                type="submit"
                                variant="contained"
                                size="large"
                                disabled={loading}
                                sx={{
                                    mt: 2,
                                    py: 1.5,
                                    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                                    fontWeight: 'bold'
                                }}
                            >
                                {loading ? <CircularProgress size={24} color="inherit" /> : 'Create Course'}
                            </Button>
                        </Box>
                    </form>
                </CardContent>
            </Card>
        </Container>
    );
};

export default AddCourse;
