import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Container,
  Typography,
  Box,
  Grid,
  Card,
  CardContent,
  CardActions,
  Button,
  TextField,
  InputAdornment,
  Chip,
  CircularProgress,
} from '@mui/material';
import { Search, School, PlayArrow } from '@mui/icons-material';
import axios from 'axios';

const Courses = () => {
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  // Define fetchCourses outside or use useCallback to avoid infinite loops if added to dependencies
  // But for simplicity in this structure, we can move it inside useEffect or keep it out and suppress if we know what we are doing, 
  // but best practice is to include it. 
  // Let's use simpler approach: define async function inside useEffect.

  useEffect(() => {
    const fetchCourses = async () => {
      try {
        setLoading(true);
        const response = await axios.get('/api/courses', {
          params: { search: searchTerm || undefined },
        });
        setCourses(response.data.courses);
      } catch (error) {
        console.error('Error fetching courses:', error);
      } finally {
        setLoading(false);
      }
    };

    const debounceTimer = setTimeout(() => {
      fetchCourses();
    }, 500); // Debounce search

    return () => clearTimeout(debounceTimer);
  }, [searchTerm]);

  return (
    <Container maxWidth="lg" sx={{ py: 8 }}>
      <Box sx={{ mb: 6, textAlign: 'center' }}>
        <Typography variant="h3" component="h1" gutterBottom fontWeight="bold" className="gradient-text">
          Explore Courses
        </Typography>
        <Typography variant="body1" color="text.secondary" sx={{ fontSize: '1.2rem', maxWidth: '600px', mx: 'auto' }}>
          Discover a wide range of courses tailored to enhance your digital literacy and academic skills.
        </Typography>
      </Box>

      <Box sx={{ mb: 6, maxWidth: '600px', mx: 'auto' }}>
        <TextField
          fullWidth
          placeholder="Search for courses..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          variant="outlined"
          sx={{
            '& .MuiOutlinedInput-root': {
              bgcolor: 'rgba(255,255,255,0.8)',
              borderRadius: '50px',
              '&:hover fieldset': { borderColor: 'primary.main' },
              '&.Mui-focused fieldset': { borderColor: 'primary.main', borderWidth: 2 }
            }
          }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <Search sx={{ color: 'text.secondary', ml: 1 }} />
              </InputAdornment>
            ),
          }}
        />
      </Box>

      {loading ? (
        <Box display="flex" justifyContent="center" py={8}>
          <CircularProgress size={60} />
        </Box>
      ) : (
        <Grid container spacing={4}>
          {courses.map((course, index) => (
            <Grid item xs={12} sm={6} md={4} key={course.id}>
              <Card
                onMouseMove={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const x = e.clientX - rect.left;
                  const y = e.clientY - rect.top;
                  e.currentTarget.style.setProperty('--mouse-x', `${x}px`);
                  e.currentTarget.style.setProperty('--mouse-y', `${y}px`);
                }}
                className={`glass-panel glow-card spotlight-card animate-fade-in delay-${Math.min((index + 1) * 100, 500)}`}
                sx={{
                  height: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                  animationDelay: `${index * 0.1}s`,
                  position: 'relative',
                  overflow: 'hidden'
                }}
              >
                <Box className="spotlight-overlay" />
                <CardContent sx={{ flexGrow: 1, p: 3, position: 'relative', zIndex: 1 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
                    <Box sx={{ p: 1.5, borderRadius: 3, bgcolor: 'rgba(102, 126, 234, 0.1)', mr: 2 }}>
                      <School sx={{ fontSize: 32, color: 'primary.main' }} />
                    </Box>
                    <Typography variant="h6" component="h2" fontWeight="bold" sx={{ lineHeight: 1.3 }}>
                      {course.title}
                    </Typography>
                  </Box>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 3, minHeight: '3em', lineHeight: 1.6 }}>
                    {course.description ?
                      (course.description.length > 100 ? `${course.description.substring(0, 100)}...` : course.description)
                      : 'No description available'}
                  </Typography>
                  <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2 }}>
                    {course.category && (
                      <Chip
                        label={course.category}
                        size="small"
                        sx={{ bgcolor: 'rgba(0, 210, 255, 0.1)', color: '#008ba3', fontWeight: 'bold' }}
                      />
                    )}
                    {course.language && (
                      <Chip
                        label={course.language.toUpperCase()}
                        size="small"
                        variant="outlined"
                        sx={{ borderColor: 'rgba(0,0,0,0.1)' }}
                      />
                    )}
                  </Box>
                  {course.lesson_count !== undefined && (
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', fontWeight: 500 }}>
                      {course.lesson_count} Lessons
                    </Typography>
                  )}
                </CardContent>
                <CardActions sx={{ p: 3, pt: 0 }}>
                  <Button
                    fullWidth
                    variant="contained"
                    component={Link}
                    to={`/courses/${course.id}`}
                    startIcon={<PlayArrow />}
                    sx={{
                      borderRadius: 2,
                      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                      textTransform: 'none',
                      fontWeight: 'bold',
                      py: 1
                    }}
                    className="hover-glow"
                  >
                    View Details
                  </Button>
                </CardActions>
              </Card>
            </Grid>
          ))}
        </Grid>
      )}

      {!loading && courses.length === 0 && (
        <Box textAlign="center" py={8} className="glass-panel" sx={{ borderRadius: 4 }}>
          <School sx={{ fontSize: 60, color: 'text.secondary', opacity: 0.3, mb: 2 }} />
          <Typography variant="h5" color="text.secondary" fontWeight="bold">
            No courses found
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Try adjusting your search terms
          </Typography>
        </Box>
      )}
    </Container>
  );
};

export default Courses;

