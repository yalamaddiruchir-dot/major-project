import React from 'react';
import { Link } from 'react-router-dom';
import {
  Container,
  Typography,
  Button,
  Box,
  Grid,
  Card,
  CardContent,
  Stack,
} from '@mui/material';
import {
  CloudDownload,
  Translate,
  GraphicEq,
  WorkspacePremium,
  VerifiedUser,
} from '@mui/icons-material';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';

const Home = () => {
  const { isAuthenticated } = useAuth();
  const { t } = useLanguage();

  const features = [
    {
      icon: <CloudDownload sx={{ fontSize: 48, color: '#1d4ed8' }} aria-hidden="true" />,
      title: t('home.featureOfflineTitle'),
      description: t('home.featureOfflineDesc'),
    },
    {
      icon: <Translate sx={{ fontSize: 48, color: '#0284c7' }} aria-hidden="true" />,
      title: t('home.featureMultilingualTitle'),
      description: t('home.featureMultilingualDesc'),
    },
    {
      icon: <GraphicEq sx={{ fontSize: 48, color: '#059669' }} aria-hidden="true" />,
      title: t('home.featureAudioTitle'),
      description: t('home.featureAudioDesc'),
    },
    {
      icon: <WorkspacePremium sx={{ fontSize: 48, color: '#b45309' }} aria-hidden="true" />,
      title: t('home.featureCertTitle'),
      description: t('home.featureCertDesc'),
    },
  ];

  return (
    <Box>
      {/* Accessible Hero Section (no external network texture dependencies) */}
      <Box
        sx={{
          background: 'linear-gradient(135deg, #1e3a8a 0%, #1d4ed8 55%, #0369a1 100%)',
          color: '#ffffff',
          py: { xs: 8, md: 12 },
          textAlign: 'center',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <Container maxWidth="md" sx={{ position: 'relative', zIndex: 1 }}>
          <Typography
            variant="h3"
            component="h1"
            gutterBottom
            fontWeight={800}
            sx={{ fontSize: { xs: '2rem', sm: '2.6rem', md: '3.2rem' }, lineHeight: 1.2 }}
          >
            {t('home.heroTitle')}
          </Typography>
          <Typography
            variant="h6"
            component="p"
            sx={{ mb: 3, opacity: 0.95, fontWeight: 500, fontSize: { xs: '1.05rem', md: '1.3rem' } }}
          >
            {t('home.heroTagline')}
          </Typography>
          <Typography
            variant="body1"
            sx={{ mb: 5, maxWidth: 680, mx: 'auto', opacity: 0.92, lineHeight: 1.75 }}
          >
            {t('home.heroDescription')}
          </Typography>

          <Stack
            direction={{ xs: 'column', sm: 'row' }}
            spacing={2}
            justifyContent="center"
            alignItems="center"
          >
            {isAuthenticated ? (
              <Button
                variant="contained"
                size="large"
                component={Link}
                to="/dashboard"
                sx={{
                  bgcolor: '#ffffff',
                  color: '#1e3a8a',
                  px: 4,
                  py: 1.5,
                  fontWeight: 700,
                  borderRadius: 2,
                  '&:hover': { bgcolor: '#f1f5f9' },
                }}
              >
                {t('home.goToDashboard')}
              </Button>
            ) : (
              <>
                <Button
                  variant="contained"
                  size="large"
                  component={Link}
                  to="/register"
                  sx={{
                    bgcolor: '#ffffff',
                    color: '#1e3a8a',
                    px: 4,
                    py: 1.5,
                    fontWeight: 700,
                    borderRadius: 2,
                    '&:hover': { bgcolor: '#f1f5f9' },
                  }}
                >
                  {t('home.getStarted')}
                </Button>
                <Button
                  variant="outlined"
                  size="large"
                  component={Link}
                  to="/login"
                  sx={{
                    borderColor: '#ffffff',
                    borderWidth: 2,
                    color: '#ffffff',
                    px: 4,
                    py: 1.5,
                    fontWeight: 700,
                    borderRadius: 2,
                    '&:hover': { borderColor: '#ffffff', bgcolor: 'rgba(255,255,255,0.12)' },
                  }}
                >
                  {t('home.signIn')}
                </Button>
              </>
            )}

            <Button
              variant="text"
              size="large"
              component={Link}
              to="/verify-certificate"
              startIcon={<VerifiedUser />}
              sx={{ color: '#ffffff', fontWeight: 600, textTransform: 'none' }}
            >
              {t('home.verifyCertificateBtn')}
            </Button>
          </Stack>
        </Container>
      </Box>

      {/* Key Features */}
      <Container maxWidth="lg" sx={{ py: { xs: 6, md: 9 } }}>
        <Typography variant="h4" component="h2" textAlign="center" fontWeight={800} gutterBottom className="gradient-text">
          {t('home.keyFeatures')}
        </Typography>
        <Typography variant="body1" textAlign="center" color="text.secondary" sx={{ mb: 6, maxWidth: 640, mx: 'auto' }}>
          {t('home.keyFeaturesSub')}
        </Typography>

        <Grid container spacing={3}>
          {features.map((feature, index) => (
            <Grid item xs={12} sm={6} md={3} key={index}>
              <Card className="glass-panel glow-card" sx={{ height: '100%', textAlign: 'center', p: 2 }}>
                <CardContent>
                  <Box sx={{ mb: 2 }}>{feature.icon}</Box>
                  <Typography variant="h6" component="h3" gutterBottom fontWeight={700}>
                    {feature.title}
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.65 }}>
                    {feature.description}
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      </Container>

      {!isAuthenticated && (
        <Container maxWidth="md" sx={{ pb: 8 }}>
          <Card className="glass-panel" sx={{ p: { xs: 3, sm: 5 }, textAlign: 'center' }}>
            <Typography variant="h5" component="h2" fontWeight={800} gutterBottom color="primary">
              {t('home.ctaTitle')}
            </Typography>
            <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
              {t('home.ctaSubtitle')}
            </Typography>
            <Button
              variant="contained"
              size="large"
              component={Link}
              to="/register"
              sx={{ px: 4, py: 1.4, fontWeight: 700, borderRadius: 2 }}
            >
              {t('home.getStarted')}
            </Button>
          </Card>
        </Container>
      )}
    </Box>
  );
};

export default Home;
