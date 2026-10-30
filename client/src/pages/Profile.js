import React from 'react';
import {
  Container,
  Typography,
  Box,
  Card,
  CardContent,
  Grid,
  Chip,
  Divider,
} from '@mui/material';
import {
  Person,
  Email,
  School,
  Class,
  Badge,
} from '@mui/icons-material';
import { useAuth } from '../context/AuthContext';

const Profile = () => {
  const { user } = useAuth();

  if (!user) {
    return null;
  }

  const InfoItem = ({ icon, label, value }) => (
    <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
      <Box sx={{ mr: 2, color: 'primary.main' }}>{icon}</Box>
      <Box>
        <Typography variant="body2" color="text.secondary">
          {label}
        </Typography>
        <Typography variant="body1" fontWeight="medium">
          {value || 'N/A'}
        </Typography>
      </Box>
    </Box>
  );

  return (
    <Container maxWidth="md" sx={{ py: 4 }}>
      <Typography variant="h4" component="h1" gutterBottom fontWeight="bold">
        My Profile
      </Typography>

      <Card sx={{ mt: 3 }}>
        <CardContent>
          <Grid container spacing={3}>
            <Grid item xs={12} md={6}>
              <InfoItem
                icon={<Person />}
                label="Full Name"
                value={user.full_name}
              />
              <InfoItem
                icon={<Email />}
                label="Email"
                value={user.email}
              />
              <InfoItem
                icon={<Badge />}
                label="Username"
                value={user.username}
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <InfoItem
                icon={<Badge />}
                label="Role"
                value={
                  <Chip
                    label={user.role.toUpperCase()}
                    color={
                      user.role === 'admin'
                        ? 'error'
                        : user.role === 'teacher'
                        ? 'primary'
                        : 'default'
                    }
                    size="small"
                  />
                }
              />
              <InfoItem
                icon={<School />}
                label="School"
                value={user.school_name}
              />
              <InfoItem
                icon={<Class />}
                label="Class/Grade"
                value={user.class_grade}
              />
            </Grid>
          </Grid>

          <Divider sx={{ my: 3 }} />

          <Typography variant="body2" color="text.secondary">
            Member since: {new Date(user.created_at).toLocaleDateString()}
          </Typography>
        </CardContent>
      </Card>
    </Container>
  );
};

export default Profile;

