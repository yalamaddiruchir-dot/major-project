import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Container,
  Typography,
  Box,
  Card,
  CardContent,
  TextField,
  Button,
  Alert,
  Stack,
  Divider,
  Chip,
} from '@mui/material';
import { VerifiedUser, Search, WorkspacePremium } from '@mui/icons-material';
import axios from 'axios';
import { useLanguage } from '../context/LanguageContext';

const VerifyCertificate = () => {
  const [searchParams] = useSearchParams();
  const initialCode = searchParams.get('code') || '';
  const { t } = useLanguage();

  const [code, setCode] = useState(initialCode);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const verifyCode = async (targetCode) => {
    const cleaned = String(targetCode || '').trim().toUpperCase();
    if (!cleaned) return;
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const res = await axios.get(`/api/certificates/verify/${encodeURIComponent(cleaned)}`);
      setResult(res.data.certificate);
    } catch (err) {
      setError(err.response?.data?.message || t('certificates.verifiedInvalid'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (initialCode) {
      verifyCode(initialCode);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialCode]);

  const handleSubmit = (e) => {
    e.preventDefault();
    verifyCode(code);
  };

  return (
    <Container maxWidth="sm" sx={{ py: 6 }}>
      <Card className="glass-panel">
        <CardContent sx={{ p: { xs: 3, sm: 4 } }}>
          <Stack direction="row" spacing={1.5} alignItems="center" mb={1}>
            <VerifiedUser color="primary" sx={{ fontSize: 34 }} />
            <Typography variant="h4" component="h1" fontWeight={800}>
              {t('certificates.verifyTitle')}
            </Typography>
          </Stack>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            {t('certificates.verifySubtitle')}
          </Typography>

          <Box component="form" onSubmit={handleSubmit} sx={{ display: 'flex', gap: 1.5, mb: 3 }}>
            <TextField
              fullWidth
              label={t('certificates.certificateIdInput')}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              required
            />
            <Button
              type="submit"
              variant="contained"
              disabled={loading}
              startIcon={<Search />}
              sx={{ px: 3, fontWeight: 700 }}
            >
              {t('certificates.verifyBtn')}
            </Button>
          </Box>

          {error && <Alert severity="error">{error}</Alert>}

          {result && (
            <Box sx={{ mt: 2, p: 2.5, bgcolor: '#ecfdf5', borderRadius: 2, border: '1px solid #6ee7b7' }}>
              <Stack direction="row" spacing={1} alignItems="center" mb={1.5}>
                <WorkspacePremium color="success" />
                <Typography variant="h6" fontWeight={800} color="success.dark">
                  {t('certificates.verifiedValid')}
                </Typography>
              </Stack>
              <Divider sx={{ mb: 2 }} />
              <Stack spacing={1}>
                <Typography variant="body2">
                  <strong>Certificate ID:</strong> {result.certificate_code}
                </Typography>
                <Typography variant="body2">
                  <strong>{t('certificates.issuedTo')}:</strong> {result.student_name}
                </Typography>
                <Typography variant="body2">
                  <strong>{t('certificates.courseName')}:</strong> {result.course_title}
                </Typography>
                <Typography variant="body2">
                  <strong>{t('certificates.institution')}:</strong> {result.institution_name}
                </Typography>
                <Typography variant="body2">
                  <strong>{t('certificates.completionDate')}:</strong>{' '}
                  {new Date(result.issued_at).toLocaleDateString()}
                </Typography>
                {result.final_score_percentage !== null && result.final_score_percentage !== undefined && (
                  <Typography variant="body2">
                    <strong>Final Score:</strong> {result.final_score_percentage}%
                  </Typography>
                )}
                <Box sx={{ pt: 1 }}>
                  <Chip
                    size="small"
                    variant="outlined"
                    label={`HMAC Signature: ${result.verification_signature}`}
                  />
                </Box>
              </Stack>
            </Box>
          )}
        </CardContent>
      </Card>
    </Container>
  );
};

export default VerifyCertificate;
