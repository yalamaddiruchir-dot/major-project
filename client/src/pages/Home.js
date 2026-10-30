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


} from '@mui/material';
import {
  School,
  Computer,
  People,
  TrendingUp,
} from '@mui/icons-material';
import { useAuth } from '../context/AuthContext';

const Home = () => {
  const { isAuthenticated } = useAuth();

  const features = [
    {
      icon: <Computer sx={{ fontSize: 60, color: '#1976d2' }} />,
      title: 'Digital Literacy',
      description: 'Learn essential computer and digital skills tailored for rural students.',
    },
    {
      icon: <School sx={{ fontSize: 60, color: '#1976d2' }} />,
      title: 'Interactive Lessons',
      description: 'Engaging content in local languages to improve learning outcomes.',
    },
    {
      icon: <People sx={{ fontSize: 60, color: '#1976d2' }} />,
      title: 'Teacher Dashboard',
      description: 'Track student progress and manage classes effectively.',
    },
    {
      icon: <TrendingUp sx={{ fontSize: 60, color: '#1976d2' }} />,
      title: 'Progress Tracking',
      description: 'Monitor your learning journey and achievements.',
    },
  ];

  return (
    <Box>
      {/* Hero Section */}
      <Box
        sx={{
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          color: 'white',
          py: 15,
          textAlign: 'center',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <Box
          sx={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            opacity: 0.1,
            backgroundImage: 'url("https://www.transparenttextures.com/patterns/cubes.png")',
          }}
        />
        {/* Floating Shapes Animation */}
        <Box className="floating-shape shape-1" />
        <Box className="floating-shape shape-2" />
        <Box className="floating-shape shape-3" />

        <Container sx={{ position: 'relative', zIndex: 1 }}>
          <Typography variant="h2" component="h1" gutterBottom fontWeight="bold" className="animate-fade-in" sx={{ textShadow: '0 4px 20px rgba(0,0,0,0.2)' }}>
            Digital Learning Platform
          </Typography>
          <Typography variant="h5" component="h2" gutterBottom sx={{ mb: 6, opacity: 0.9, fontWeight: 300, letterSpacing: 1 }} className="animate-fade-in delay-100">
            Empowering Rural Education in Nabha
          </Typography>
          <Typography variant="body1" sx={{ mb: 6, maxWidth: '600px', mx: 'auto', fontSize: '1.2rem', lineHeight: 1.8 }} className="animate-fade-in delay-200">
            Bridging the digital divide by providing quality educational resources
            accessible to students and teachers in rural areas.
          </Typography>
          {!isAuthenticated && (
            <Box sx={{ display: 'flex', gap: 3, justifyContent: 'center' }} className="animate-fade-in delay-300">
              <Button
                variant="contained"
                size="large"
                component={Link}
                to="/register"
                sx={{
                  bgcolor: 'white',
                  color: '#667eea',
                  px: 5,
                  py: 1.8,
                  fontSize: '1.1rem',
                  borderRadius: '50px',
                  fontWeight: 'bold',
                  boxShadow: '0 10px 20px rgba(0,0,0,0.1)',
                  '&:hover': { bgcolor: '#f0f0f0', transform: 'translateY(-3px)', boxShadow: '0 15px 30px rgba(0,0,0,0.15)' },
                  transition: 'all 0.3s'
                }}
              >
                Get Started
              </Button>
              <Button
                variant="outlined"
                size="large"
                component={Link}
                to="/login"
                sx={{
                  borderColor: 'rgba(255,255,255,0.8)',
                  borderWidth: 2,
                  color: 'white',
                  px: 5,
                  py: 1.8,
                  fontSize: '1.1rem',
                  borderRadius: '50px',
                  fontWeight: 'bold',
                  '&:hover': { borderColor: 'white', bgcolor: 'rgba(255,255,255,0.1)', transform: 'translateY(-3px)' },
                  transition: 'all 0.3s'
                }}
              >
                Login
              </Button>
            </Box>
          )}
        </Container>
      </Box>

      {/* Features Section */}
      <Container sx={{ py: 10 }}>
        <Typography variant="h3" component="h2" textAlign="center" gutterBottom fontWeight="bold" className="gradient-text animate-fade-in">
          Key Features
        </Typography>
        <Typography variant="body1" textAlign="center" color="text.secondary" sx={{ mb: 8, fontSize: '1.1rem' }} className="animate-fade-in delay-100">
          Everything you need for effective digital learning
        </Typography>
        <Grid container spacing={4}>
          {features.map((feature, index) => (
            <Grid item xs={12} sm={6} md={3} key={index}>
              <Card
                onMouseMove={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const x = e.clientX - rect.left;
                  const y = e.clientY - rect.top;
                  e.currentTarget.style.setProperty('--mouse-x', `${x}px`);
                  e.currentTarget.style.setProperty('--mouse-y', `${y}px`);
                }}
                className={`glass-panel glow-card spotlight-card animate-fade-in delay-${(index + 2) * 100}`}
                sx={{
                  height: '100%',
                  textAlign: 'center',
                  p: 3,
                  background: 'rgba(255,255,255,0.8)',
                  position: 'relative',
                  overflow: 'hidden',
                  transition: 'all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)'
                }}>
                <Box className="spotlight-overlay" />
                <CardContent sx={{ position: 'relative', zIndex: 1 }}>
                  <Box sx={{
                    mb: 3,
                    transform: 'scale(1)',
                    transition: 'transform 0.4s ease',
                    '&:hover': { transform: 'scale(1.2) rotate(5deg)' }
                  }}>
                    {feature.icon}
                  </Box>
                  <Typography variant="h6" gutterBottom fontWeight="bold">
                    {feature.title}
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.6 }}>
                    {feature.description}
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      </Container>

      {/* CTA Section */}
      {!isAuthenticated && (
        <Box sx={{ bgcolor: '#f8f9fe', py: 10 }}>
          <Container>
            <Box textAlign="center" className="glass-panel" sx={{ p: 8, bgcolor: 'white' }}>
              <Typography variant="h4" gutterBottom fontWeight="bold" color="primary">
                Ready to Start Learning?
              </Typography>
              <Typography variant="body1" color="text.secondary" sx={{ mb: 4, fontSize: '1.1rem' }}>
                Join hundreds of students and teachers already using our platform
              </Typography>
              <Button
                variant="contained"
                size="large"
                component={Link}
                to="/register"
                sx={{
                  px: 6,
                  py: 2,
                  borderRadius: '30px',
                  fontWeight: 'bold',
                  background: 'linear-gradient(90deg, #667eea 0%, #764ba2 100%)',
                  '&:hover': { boxShadow: '0 10px 20px rgba(102, 126, 234, 0.4)', transform: 'translateY(-2px)' }
                }}
              >
                Create Free Account
              </Button>
            </Box>
          </Container>
        </Box>
      )}
    </Box>
  );
};

export default Home;

