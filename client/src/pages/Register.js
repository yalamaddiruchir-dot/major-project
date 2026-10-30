import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  Container,
  Paper,
  TextField,
  Button,
  Typography,
  Box,
  Alert,
  CircularProgress,
  Grid,
} from '@mui/material';
import { useAuth } from '../context/AuthContext';

const Register = () => {
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    password: '',
    confirmPassword: '',
    full_name: '',
    school_name: '',
    class_grade: '',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { register } = useAuth();
  const navigate = useNavigate();

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (formData.password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    setLoading(true);

    const { confirmPassword, ...registerData } = formData;
    const result = await register(registerData);

    if (result.success) {
      navigate('/dashboard');
    } else {
      setError(result.message || 'Registration failed. Please try again.');
    }

    setLoading(false);
  };

  return (
    <Container maxWidth="md" sx={{ py: 8, minHeight: '80vh', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
      <Box className="glass-panel" sx={{ p: 5, borderRadius: 4 }}>
        <Box sx={{ mb: 5, textAlign: 'center' }}>
          <Typography variant="h4" component="h1" gutterBottom fontWeight="bold" className="gradient-text">
            Join the Community
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Start your learning journey with us today
          </Typography>
        </Box>

        {error && (
          <Alert severity="error" sx={{ mb: 3, borderRadius: 2 }}>
            {error}
          </Alert>
        )}

        <Box component="form" onSubmit={handleSubmit}>
          <Grid container spacing={3}>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Full Name"
                name="full_name"
                value={formData.full_name}
                onChange={handleChange}
                required
                variant="outlined"
                sx={{ backgroundColor: 'rgba(255,255,255,0.5)', borderRadius: 1 }}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Username"
                name="username"
                value={formData.username}
                onChange={handleChange}
                required
                variant="outlined"
                sx={{ backgroundColor: 'rgba(255,255,255,0.5)', borderRadius: 1 }}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Email"
                name="email"
                type="email"
                value={formData.email}
                onChange={handleChange}
                required
                variant="outlined"
                sx={{ backgroundColor: 'rgba(255,255,255,0.5)', borderRadius: 1 }}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="School Name"
                name="school_name"
                value={formData.school_name}
                onChange={handleChange}
                variant="outlined"
                sx={{ backgroundColor: 'rgba(255,255,255,0.5)', borderRadius: 1 }}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Class/Grade"
                name="class_grade"
                value={formData.class_grade}
                onChange={handleChange}
                variant="outlined"
                sx={{ backgroundColor: 'rgba(255,255,255,0.5)', borderRadius: 1 }}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Password"
                name="password"
                type="password"
                value={formData.password}
                onChange={handleChange}
                required
                variant="outlined"
                sx={{ backgroundColor: 'rgba(255,255,255,0.5)', borderRadius: 1 }}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Confirm Password"
                name="confirmPassword"
                type="password"
                value={formData.confirmPassword}
                onChange={handleChange}
                required
                variant="outlined"
                sx={{ backgroundColor: 'rgba(255,255,255,0.5)', borderRadius: 1 }}
              />
            </Grid>
          </Grid>

          <Button
            type="submit"
            fullWidth
            variant="contained"
            size="large"
            sx={{
              mt: 5,
              mb: 3,
              py: 1.5,
              borderRadius: 2,
              background: 'linear-gradient(90deg, #667eea 0%, #764ba2 100%)',
              fontWeight: 'bold',
              textTransform: 'none',
              fontSize: '1rem'
            }}
            disabled={loading}
            className="hover-glow"
          >
            {loading ? <CircularProgress size={24} color="inherit" /> : 'Create Account'}
          </Button>
        </Box>

        <Box textAlign="center">
          <Typography variant="body2" color="text.secondary">
            Already have an account?{' '}
            <Link to="/login" style={{ textDecoration: 'none', fontWeight: 'bold' }}>
              <span className="gradient-text">Login here</span>
            </Link>
          </Typography>
        </Box>
      </Box>
    </Container>
  );
};

export default Register;

