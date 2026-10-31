import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  Container,
  TextField,
  Button,
  Typography,
  Box,
  Alert,
  CircularProgress,
  Grid,
} from '@mui/material';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';

const USERNAME_RE = /^[a-zA-Z0-9_.-]{3,40}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const Register = () => {
  const { language, t } = useLanguage();
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
  const { register, user, isAuthenticated, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!authLoading && isAuthenticated && user) {
      navigate('/dashboard', { replace: true });
    }
  }, [authLoading, isAuthenticated, user, navigate]);

  const handleChange = (e) => {
    setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }));
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!formData.full_name.trim()) {
      setError(t('auth.validation.fullNameRequired'));
      return;
    }
    if (!USERNAME_RE.test(formData.username.trim())) {
      setError(t('auth.validation.usernameFormat'));
      return;
    }
    if (!EMAIL_RE.test(formData.email.trim())) {
      setError(t('auth.validation.emailInvalid'));
      return;
    }
    if (formData.password.length < 8) {
      setError(t('auth.validation.passwordLength'));
      return;
    }
    if (formData.password !== formData.confirmPassword) {
      setError(t('auth.validation.passwordMismatch'));
      return;
    }

    setLoading(true);
    const { confirmPassword, ...registerData } = formData;
    const result = await register({
      ...registerData,
      username: registerData.username.trim(),
      email: registerData.email.trim(),
      full_name: registerData.full_name.trim(),
      preferred_language: language,
    });
    setLoading(false);

    if (result.success) {
      navigate('/dashboard');
    } else {
      setError(result.message || 'Registration failed. Please try again.');
    }
  };

  return (
    <Container maxWidth="md" sx={{ py: 6 }}>
      <Box className="glass-panel" sx={{ p: { xs: 3, sm: 5 } }}>
        <Box sx={{ mb: 4, textAlign: 'center' }}>
          <Typography variant="h4" component="h1" gutterBottom fontWeight={800} className="gradient-text">
            {t('auth.registerTitle')}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {t('auth.registerSubtitle')}
          </Typography>
        </Box>

        {error && (
          <Alert severity="error" role="alert" sx={{ mb: 3 }}>
            {error}
          </Alert>
        )}

        <Box component="form" onSubmit={handleSubmit} noValidate>
          <Grid container spacing={2.5}>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                id="reg-full-name"
                label={t('auth.fullName')}
                name="full_name"
                value={formData.full_name}
                onChange={handleChange}
                required
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                id="reg-username"
                label={t('auth.username')}
                name="username"
                autoComplete="username"
                value={formData.username}
                onChange={handleChange}
                required
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                id="reg-email"
                label={t('auth.email')}
                name="email"
                type="email"
                autoComplete="email"
                value={formData.email}
                onChange={handleChange}
                required
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                id="reg-school"
                label={t('auth.schoolName')}
                name="school_name"
                value={formData.school_name}
                onChange={handleChange}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                id="reg-grade"
                label={t('auth.classGrade')}
                name="class_grade"
                value={formData.class_grade}
                onChange={handleChange}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                id="reg-password"
                label={t('auth.password')}
                name="password"
                type="password"
                autoComplete="new-password"
                value={formData.password}
                onChange={handleChange}
                required
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                id="reg-confirm-password"
                label={t('auth.confirmPassword')}
                name="confirmPassword"
                type="password"
                autoComplete="new-password"
                value={formData.confirmPassword}
                onChange={handleChange}
                required
              />
            </Grid>
          </Grid>

          <Button
            type="submit"
            fullWidth
            variant="contained"
            size="large"
            disabled={loading}
            sx={{ mt: 4, mb: 2.5, py: 1.4, fontWeight: 700, textTransform: 'none', fontSize: '1rem' }}
          >
            {loading ? <CircularProgress size={22} color="inherit" /> : t('auth.createAccountBtn')}
          </Button>
        </Box>

        <Box textAlign="center">
          <Typography variant="body2" color="text.secondary">
            {t('auth.haveAccount')}{' '}
            <Link to="/login" style={{ fontWeight: 700, color: '#1d4ed8', textDecoration: 'underline' }}>
              {t('auth.loginHere')}
            </Link>
          </Typography>
        </Box>
      </Box>
    </Container>
  );
};

export default Register;
