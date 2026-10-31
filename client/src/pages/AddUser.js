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
} from '@mui/material';
import { ArrowBack, PersonAdd } from '@mui/icons-material';
import axios from 'axios';
import { useToast } from '../context/ToastContext';

const AddUser = () => {
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [formData, setFormData] = useState({
    username: '',
    email: '',
    password: '',
    full_name: '',
    role: 'teacher',
    school_name: '',
    class_grade: '',
    preferred_language: 'en',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleChange = (e) => {
    setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (formData.password.length < 8) {
      setError('Password must be at least 8 characters long.');
      return;
    }

    setLoading(true);
    try {
      await axios.post('/api/users', formData);
      showToast(`Created ${formData.role} account "${formData.username}".`, 'success');
      navigate('/admin/users');
    } catch (err) {
      setError(err.response?.data?.message || 'Error creating user account');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Container maxWidth="md" sx={{ py: 4 }}>
      <Button startIcon={<ArrowBack />} onClick={() => navigate('/admin/users')} sx={{ mb: 2 }}>
        Back to User Management
      </Button>

      <Paper className="glass-panel" sx={{ p: { xs: 3, sm: 4 } }}>
        <Typography variant="h4" component="h1" fontWeight={800} gutterBottom>
          Create Teacher or Student Account
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          Administrators provision verified Teacher and Student accounts here.
        </Typography>

        {error && (
          <Alert severity="error" sx={{ mb: 3 }}>
            {error}
          </Alert>
        )}

        <Box component="form" onSubmit={handleSubmit}>
          <Grid container spacing={2.5}>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Full Name"
                name="full_name"
                value={formData.full_name}
                onChange={handleChange}
                required
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                select
                fullWidth
                label="Account Role"
                name="role"
                value={formData.role}
                onChange={handleChange}
              >
                <MenuItem value="teacher">Teacher</MenuItem>
                <MenuItem value="student">Student</MenuItem>
              </TextField>
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Username"
                name="username"
                value={formData.username}
                onChange={handleChange}
                required
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                type="email"
                label="Email Address"
                name="email"
                value={formData.email}
                onChange={handleChange}
                required
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                type="password"
                label="Initial Password (min 8 chars)"
                name="password"
                value={formData.password}
                onChange={handleChange}
                required
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                select
                fullWidth
                label="Preferred Language"
                name="preferred_language"
                value={formData.preferred_language}
                onChange={handleChange}
              >
                <MenuItem value="en">English</MenuItem>
                <MenuItem value="te">తెలుగు (Telugu)</MenuItem>
                <MenuItem value="hi">हिन्दी (Hindi)</MenuItem>
              </TextField>
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="School Name"
                name="school_name"
                value={formData.school_name}
                onChange={handleChange}
              />
            </Grid>
            {formData.role === 'student' && (
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  label="Class / Grade"
                  name="class_grade"
                  value={formData.class_grade}
                  onChange={handleChange}
                />
              </Grid>
            )}
          </Grid>

          <Box sx={{ mt: 3.5, display: 'flex', justifyContent: 'flex-end' }}>
            <Button
              type="submit"
              variant="contained"
              size="large"
              startIcon={<PersonAdd />}
              disabled={loading}
              sx={{ fontWeight: 700 }}
            >
              {loading ? 'Creating...' : 'Create User'}
            </Button>
          </Box>
        </Box>
      </Paper>
    </Container>
  );
};

export default AddUser;
