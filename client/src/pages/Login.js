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
} from '@mui/material';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';

const getRoleHomePath = (role) => {
  if (role === 'admin') return '/admin';
  if (role === 'teacher') return '/teacher';
  return '/dashboard';
};

const Login = () => {
  const [formData, setFormData] = useState({ username: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login, user, isAuthenticated, loading: authLoading } = useAuth();
  const { t, setLanguage } = useLanguage();
  const navigate = useNavigate();

  useEffect(() => {
    if (!authLoading && isAuthenticated && user) {
      navigate(getRoleHomePath(user.role), { replace: true });
    }
  }, [authLoading, isAuthenticated, user, navigate]);

  const handleChange = (e) => {
    setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }));
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!formData.username.trim()) {
      setError(t('auth.validation.usernameRequired'));
      return;
    }
    if (!formData.password) {
      setError(t('auth.validation.passwordRequired'));
      return;
    }

    setLoading(true);
    const result = await login(formData.username.trim(), formData.password);
    setLoading(false);

    if (result.success) {
      if (result.user?.preferred_language) {
        setLanguage(result.user.preferred_language);
      }
      navigate(getRoleHomePath(result.user?.role), { replace: true });
    } else {
      setError(result.message || 'Login failed. Please try again.');
    }
  };

  return (
    <Container
      maxWidth="xs"
      sx={{ py: 6, display: 'flex', flexDirection: 'column', justifyContent: 'center', minHeight: '78vh' }}
    >
      <Box className="glass-panel" sx={{ p: { xs: 3, sm: 4 } }}>
        <Box sx={{ mb: 3, textAlign: 'center' }}>
          <Typography variant="h4" component="h1" gutterBottom fontWeight={800} className="gradient-text">
            {t('auth.welcomeBack')}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {t('auth.loginSubtitle')}
          </Typography>
        </Box>

        {error && (
          <Alert severity="error" role="alert" sx={{ mb: 2.5 }}>
            {error}
          </Alert>
        )}

        <Box component="form" onSubmit={handleSubmit} noValidate>
          <TextField
            fullWidth
            id="login-username"
            label={t('auth.usernameOrEmail')}
            name="username"
            autoComplete="username"
            value={formData.username}
            onChange={handleChange}
            margin="normal"
            required
            autoFocus
          />
          <TextField
            fullWidth
            id="login-password"
            label={t('auth.password')}
            name="password"
            type="password"
            autoComplete="current-password"
            value={formData.password}
            onChange={handleChange}
            margin="normal"
            required
          />
          <Button
            type="submit"
            fullWidth
            variant="contained"
            size="large"
            disabled={loading}
            sx={{ mt: 3, mb: 2.5, py: 1.4, fontWeight: 700, textTransform: 'none', fontSize: '1rem' }}
          >
            {loading ? <CircularProgress size={22} color="inherit" /> : t('auth.signInBtn')}
          </Button>
        </Box>

        <Box textAlign="center">
          <Typography variant="body2" color="text.secondary">
            {t('auth.noAccount')}{' '}
            <Link to="/register" style={{ fontWeight: 700, color: '#1d4ed8', textDecoration: 'underline' }}>
              {t('auth.createAccountLink')}
            </Link>
          </Typography>
        </Box>
      </Box>
    </Container>
  );
};

export default Login;
