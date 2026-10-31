import React, { useState, useEffect } from 'react';
import {
  Container,
  Typography,
  Box,
  Card,
  CardContent,
  TextField,
  Grid,
  Button,
  Chip,
  MenuItem,
  FormControlLabel,
  Switch,
  Divider,
  Alert,
} from '@mui/material';
import { Save, LockReset } from '@mui/icons-material';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { usePreferences } from '../context/PreferencesContext';
import { useToast } from '../context/ToastContext';

const Profile = () => {
  const { user, updateUserState } = useAuth();
  const { language, setLanguage, t, supportedLanguages } = useLanguage();
  const { lowBandwidthMode, setLowBandwidthMode } = usePreferences();
  const { showToast } = useToast();

  const [formData, setFormData] = useState({
    full_name: '',
    email: '',
    school_name: '',
    class_grade: '',
    preferred_language: language || 'en',
    low_bandwidth_mode: lowBandwidthMode,
  });
  const [saving, setSaving] = useState(false);

  const [pwdData, setPwdData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmNewPassword: '',
  });
  const [pwdError, setPwdError] = useState('');
  const [changingPwd, setChangingPwd] = useState(false);

  useEffect(() => {
    if (user) {
      setFormData({
        full_name: user.full_name || '',
        email: user.email || '',
        school_name: user.school_name || '',
        class_grade: user.class_grade || '',
        preferred_language: user.preferred_language || language || 'en',
        low_bandwidth_mode: Boolean(user.low_bandwidth_mode ?? lowBandwidthMode),
      });
    }
  }, [language, lowBandwidthMode, user]);

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    if (!user?.id) return;
    setSaving(true);
    try {
      const res = await axios.put('/api/auth/profile', formData);
      updateUserState(res.data.user);
      setLanguage(formData.preferred_language);
      setLowBandwidthMode(formData.low_bandwidth_mode);
      showToast('Profile settings saved!', 'success');
    } catch (error) {
      showToast(error.response?.data?.message || 'Could not update profile.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    setPwdError('');
    if (pwdData.newPassword.length < 8) {
      setPwdError('New password must be at least 8 characters long.');
      return;
    }
    if (pwdData.newPassword !== pwdData.confirmNewPassword) {
      setPwdError('New passwords do not match.');
      return;
    }

    setChangingPwd(true);
    try {
      const res = await axios.put('/api/auth/password', {
        current_password: pwdData.currentPassword,
        new_password: pwdData.newPassword,
      });
      updateUserState(user, res.data.token);
      setPwdData({ currentPassword: '', newPassword: '', confirmNewPassword: '' });
      showToast('Password updated and previous sessions revoked!', 'success');
    } catch (error) {
      setPwdError(error.response?.data?.message || 'Password change failed.');
    } finally {
      setChangingPwd(false);
    }
  };

  return (
    <Container maxWidth="md" sx={{ py: 5 }}>
      <Typography variant="h4" component="h1" fontWeight={800} gutterBottom className="gradient-text">
        {t('profile.title')}
      </Typography>
      <Typography variant="body1" color="text.secondary" sx={{ mb: 4 }}>
        {t('profile.preferences')}
      </Typography>

      <Card className="glass-panel" sx={{ mb: 4 }}>
        <CardContent sx={{ p: { xs: 3, sm: 4 } }} component="form" onSubmit={handleSaveProfile}>
          <Box sx={{ mb: 3, display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
            <Typography variant="h6" fontWeight={800}>
              @{user?.username}
            </Typography>
            <Chip label={user?.role} color="primary" size="small" />
          </Box>

          <Grid container spacing={2.5}>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label={t('auth.fullName')}
                value={formData.full_name}
                onChange={(e) => setFormData((p) => ({ ...p, full_name: e.target.value }))}
                required
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                type="email"
                label={t('auth.email')}
                value={formData.email}
                onChange={(e) => setFormData((p) => ({ ...p, email: e.target.value }))}
                required
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label={t('auth.schoolName')}
                value={formData.school_name}
                onChange={(e) => setFormData((p) => ({ ...p, school_name: e.target.value }))}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label={t('auth.classGrade')}
                value={formData.class_grade}
                onChange={(e) => setFormData((p) => ({ ...p, class_grade: e.target.value }))}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                select
                fullWidth
                label={t('nav.language')}
                value={formData.preferred_language}
                onChange={(e) => setFormData((p) => ({ ...p, preferred_language: e.target.value }))}
              >
                {supportedLanguages.map((l) => (
                  <MenuItem key={l.code} value={l.code}>
                    {l.nativeLabel}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid item xs={12} sm={6} sx={{ display: 'flex', alignItems: 'center' }}>
              <FormControlLabel
                control={
                  <Switch
                    checked={formData.low_bandwidth_mode}
                    onChange={(e) => setFormData((p) => ({ ...p, low_bandwidth_mode: e.target.checked }))}
                  />
                }
                label={t('nav.lowBandwidth')}
              />
            </Grid>
          </Grid>

          <Box sx={{ mt: 3, display: 'flex', justifyContent: 'flex-end' }}>
            <Button type="submit" variant="contained" startIcon={<Save />} disabled={saving}>
              {saving ? t('common.loading') : t('profile.saveProfile')}
            </Button>
          </Box>
        </CardContent>
      </Card>

      <Card className="glass-panel">
        <CardContent sx={{ p: { xs: 3, sm: 4 } }} component="form" onSubmit={handleChangePassword}>
          <Typography variant="h6" fontWeight={800} gutterBottom>
            {t('profile.changePassword')}
          </Typography>
          <Divider sx={{ mb: 2.5 }} />

          {pwdError && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {pwdError}
            </Alert>
          )}

          <Grid container spacing={2.5}>
            <Grid item xs={12} sm={4}>
              <TextField
                fullWidth
                type="password"
                label={t('profile.currentPassword')}
                value={pwdData.currentPassword}
                onChange={(e) => setPwdData((p) => ({ ...p, currentPassword: e.target.value }))}
                required
              />
            </Grid>
            <Grid item xs={12} sm={4}>
              <TextField
                fullWidth
                type="password"
                label={t('profile.newPassword')}
                value={pwdData.newPassword}
                onChange={(e) => setPwdData((p) => ({ ...p, newPassword: e.target.value }))}
                required
              />
            </Grid>
            <Grid item xs={12} sm={4}>
              <TextField
                fullWidth
                type="password"
                label={t('auth.confirmPassword')}
                value={pwdData.confirmNewPassword}
                onChange={(e) => setPwdData((p) => ({ ...p, confirmNewPassword: e.target.value }))}
                required
              />
            </Grid>
          </Grid>

          <Box sx={{ mt: 3, display: 'flex', justifyContent: 'flex-end' }}>
            <Button
              type="submit"
              variant="outlined"
              color="primary"
              startIcon={<LockReset />}
              disabled={changingPwd}
            >
              {changingPwd ? t('common.loading') : t('profile.updatePasswordBtn')}
            </Button>
          </Box>
        </CardContent>
      </Card>
    </Container>
  );
};

export default Profile;
