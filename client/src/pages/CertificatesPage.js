import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  Container,
  Typography,
  Box,
  Grid,
  Card,
  CardContent,
  Button,
  Chip,
  Stack,
  Skeleton,
  LinearProgress,
  Divider,
} from '@mui/material';
import {
  WorkspacePremium,
  Download,
  VerifiedUser,
  CheckCircle,
} from '@mui/icons-material';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { useToast } from '../context/ToastContext';

const CertificatesPage = () => {
  const { user } = useAuth();
  const { t } = useLanguage();
  const { showToast } = useToast();

  const [certificates, setCertificates] = useState([]);
  const [eligibleCourses, setEligibleCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [downloadingId, setDownloadingId] = useState(null);

  const loadCertificates = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const [certsRes, enrollRes] = await Promise.all([
        axios.get('/api/certificates'),
        axios.get(`/api/users/${user.id}/enrollments`),
      ]);
      const certs = certsRes.data.certificates || [];
      setCertificates(certs);

      const enrollments = enrollRes.data.enrollments || [];
      const eligibilityChecks = await Promise.all(
        enrollments.map((en) =>
          axios
            .get(`/api/certificates/eligibility/${en.course_id}`)
            .then((r) => ({ course: en, ...r.data }))
            .catch(() => null)
        )
      );
      setEligibleCourses(eligibilityChecks.filter(Boolean));
    } catch (_e) {
      showToast('Unable to load certificates right now.', 'warning');
    } finally {
      setLoading(false);
    }
  }, [showToast, user?.id]);

  useEffect(() => {
    loadCertificates();
  }, [loadCertificates]);

  const handleDownloadPdf = async (cert) => {
    setDownloadingId(cert.id);
    try {
      const res = await axios.get(`/api/certificates/${cert.id}/download`, {
        responseType: 'blob',
      });
      const blob = new Blob([res.data], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Certificate-${cert.certificate_code}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch (_error) {
      showToast('Failed to download PDF certificate.', 'error');
    } finally {
      setDownloadingId(null);
    }
  };

  const handleIssueCertificate = async (courseId) => {
    try {
      await axios.post('/api/certificates/generate', { course_id: Number(courseId) });
      showToast('Certificate issued!', 'success');
      loadCertificates();
    } catch (error) {
      showToast(error.response?.data?.message || 'Eligibility criteria not yet satisfied.', 'warning');
    }
  };

  if (loading) {
    return (
      <Container maxWidth="lg" sx={{ py: 5 }}>
        <Skeleton variant="text" width={280} height={46} sx={{ mb: 2 }} />
        <Grid container spacing={3}>
          {[1, 2].map((n) => (
            <Grid item xs={12} md={6} key={n}>
              <Skeleton variant="rounded" height={200} />
            </Grid>
          ))}
        </Grid>
      </Container>
    );
  }

  const issuedCourseIds = new Set(certificates.map((c) => Number(c.course_id)));
  const pendingEligibility = eligibleCourses.filter((item) => !issuedCourseIds.has(Number(item.course.course_id)));

  return (
    <Container maxWidth="lg" sx={{ py: 5 }}>
      <Box sx={{ mb: 4 }}>
        <Typography variant="h4" component="h1" fontWeight={800} className="gradient-text" gutterBottom>
          {t('certificates.title')}
        </Typography>
        <Typography variant="body1" color="text.secondary">
          {t('certificates.subtitle')}
        </Typography>
      </Box>

      {certificates.length === 0 ? (
        <Card className="glass-panel" sx={{ p: 5, mb: 5, textAlign: 'center' }}>
          <WorkspacePremium sx={{ fontSize: 58, color: 'text.secondary', opacity: 0.45, mb: 1 }} />
          <Typography variant="h6" fontWeight={700} gutterBottom>
            {t('certificates.noCertificates')}
          </Typography>
        </Card>
      ) : (
        <Grid container spacing={3} sx={{ mb: 5 }}>
          {certificates.map((cert) => (
            <Grid item xs={12} md={6} key={cert.id}>
              <Card
                className="glass-panel glow-card"
                sx={{ borderLeft: '6px solid #059669', height: '100%' }}
              >
                <CardContent>
                  <Stack direction="row" justifyContent="space-between" alignItems="center" mb={1.5}>
                    <Chip
                      icon={<WorkspacePremium />}
                      label={cert.certificate_code}
                      color="success"
                      size="small"
                    />
                    <Typography variant="caption" color="text.secondary">
                      {t('certificates.completionDate')}: {new Date(cert.issued_at).toLocaleDateString()}
                    </Typography>
                  </Stack>

                  <Typography variant="h6" fontWeight={800} gutterBottom>
                    {cert.course_title}
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
                    {t('certificates.issuedTo')}: <strong>{cert.student_name}</strong>
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                    {t('certificates.institution')}: {cert.institution_name}
                    {cert.final_score_percentage !== null && cert.final_score_percentage !== undefined
                      ? ` • Score: ${cert.final_score_percentage}%`
                      : ''}
                  </Typography>

                  <Stack direction="row" spacing={1.5} flexWrap="wrap">
                    <Button
                      variant="contained"
                      color="success"
                      startIcon={<Download />}
                      disabled={downloadingId === cert.id}
                      onClick={() => handleDownloadPdf(cert)}
                    >
                      {t('certificates.downloadPdf')}
                    </Button>
                    <Button
                      variant="outlined"
                      component={Link}
                      to={`/verify-certificate?code=${encodeURIComponent(cert.certificate_code)}`}
                      startIcon={<VerifiedUser />}
                    >
                      Verify
                    </Button>
                  </Stack>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      )}

      {pendingEligibility.length > 0 && (
        <>
          <Divider sx={{ mb: 4 }} />
          <Typography variant="h5" component="h2" fontWeight={800} gutterBottom sx={{ mb: 2.5 }}>
            Certificate Eligibility Tracker
          </Typography>
          <Grid container spacing={3}>
            {pendingEligibility.map((item) => {
              const lessonPct =
                item.total_lessons > 0
                  ? Math.round((item.completed_lessons / item.total_lessons) * 100)
                  : 0;
              return (
                <Grid item xs={12} md={6} key={item.course.course_id}>
                  <Card className="glass-panel">
                    <CardContent>
                      <Typography variant="h6" fontWeight={700} gutterBottom>
                        {item.course.course_title}
                      </Typography>
                      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                        Lessons Completed: {item.completed_lessons} / {item.total_lessons}
                        {item.required_assessments > 0
                          ? ` • Exams Passed: ${item.passed_assessments} / ${item.required_assessments}`
                          : ''}
                      </Typography>
                      <LinearProgress
                        variant="determinate"
                        value={lessonPct}
                        sx={{ height: 8, borderRadius: 4, mb: 2 }}
                      />
                      {item.eligible ? (
                        <Button
                          variant="contained"
                          color="success"
                          startIcon={<CheckCircle />}
                          onClick={() => handleIssueCertificate(item.course.course_id)}
                        >
                          {t('certificates.claimCertificate')}
                        </Button>
                      ) : (
                        <Button
                          variant="outlined"
                          size="small"
                          component={Link}
                          to={`/courses/${item.course.course_id}`}
                        >
                          Continue Course
                        </Button>
                      )}
                    </CardContent>
                  </Card>
                </Grid>
              );
            })}
          </Grid>
        </>
      )}
    </Container>
  );
};

export default CertificatesPage;
