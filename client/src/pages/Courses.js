import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Container,
  Typography,
  Box,
  Grid,
  Card,
  CardContent,
  CardActions,
  CardMedia,
  Button,
  TextField,
  InputAdornment,
  Chip,
  Skeleton,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Pagination,
  Stack,
  Alert,
} from '@mui/material';
import { Search, School, PlayArrow, OfflinePin, Image as ImageIcon } from '@mui/icons-material';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { usePreferences } from '../context/PreferencesContext';
import { useOffline } from '../context/OfflineContext';
import { resolveEntityTranslation, getLanguageDisplayName } from '../i18n/translations';
import { getOfflineCoursesList } from '../services/offlineDb';

const CATEGORIES = [
  'Digital Literacy',
  'Computer Science',
  'Mathematics',
  'Science',
  'Language',
  'Vocational',
  'Office Applications',
  'Digital Communication',
];

const PAGE_LIMIT = 9;

const Courses = () => {
  const { user } = useAuth();
  const { language, t, supportedLanguages } = useLanguage();
  const { lowBandwidthMode } = usePreferences();
  const { isOffline, offlineCourseIds } = useOffline();

  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [category, setCategory] = useState('');
  const [langFilter, setLangFilter] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [revealedImages, setRevealedImages] = useState({});

  useEffect(() => {
    let active = true;
    const fetchCourses = async () => {
      setLoading(true);
      try {
        const response = await axios.get('/api/courses', {
          params: {
            search: searchTerm.trim() || undefined,
            category: category || undefined,
            language: langFilter || undefined,
            page,
            limit: PAGE_LIMIT,
          },
        });
        if (!active) return;
        setCourses(response.data.courses || []);
        setTotalPages(response.data.pagination?.totalPages || 1);
      } catch (_error) {
        // Offline fallback from IndexedDB
        if (user?.id) {
          try {
            const cached = await getOfflineCoursesList(user.id);
            if (!active) return;
            const list = cached.map((item) => ({
              ...item.course,
              lesson_count: item.lessonCount || item.course?.lessons?.length || 0,
            }));
            setCourses(list);
            setTotalPages(1);
          } catch (_e) {
            if (active) setCourses([]);
          }
        }
      } finally {
        if (active) setLoading(false);
      }
    };

    const timer = setTimeout(fetchCourses, 250);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [searchTerm, category, langFilter, page, user?.id]);

  const handleClearFilters = () => {
    setSearchTerm('');
    setCategory('');
    setLangFilter('');
    setPage(1);
  };

  return (
    <Container maxWidth="lg" sx={{ py: 5 }}>
      {isOffline && (
        <Alert severity="warning" sx={{ mb: 3 }}>
          {t('lesson.offlineBanner')}
        </Alert>
      )}

      <Box sx={{ mb: 4, textAlign: 'center' }}>
        <Typography variant="h4" component="h1" gutterBottom fontWeight={800} className="gradient-text">
          {t('courses.title')}
        </Typography>
        <Typography variant="body1" color="text.secondary" sx={{ maxWidth: 640, mx: 'auto' }}>
          {t('courses.subtitle')}
        </Typography>
      </Box>

      {/* Search & Filter Controls */}
      <Card className="glass-panel" sx={{ p: 2.5, mb: 4 }}>
        <Grid container spacing={2} alignItems="center">
          <Grid item xs={12} md={6}>
            <TextField
              fullWidth
              size="small"
              label={t('courses.searchPlaceholder')}
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setPage(1);
              }}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <Search fontSize="small" />
                  </InputAdornment>
                ),
              }}
            />
          </Grid>
          <Grid item xs={6} md={3}>
            <FormControl fullWidth size="small">
              <InputLabel id="cat-filter-label">{t('courses.allCategories')}</InputLabel>
              <Select
                labelId="cat-filter-label"
                value={category}
                label={t('courses.allCategories')}
                onChange={(e) => {
                  setCategory(e.target.value);
                  setPage(1);
                }}
              >
                <MenuItem value="">{t('courses.allCategories')}</MenuItem>
                {CATEGORIES.map((cat) => (
                  <MenuItem key={cat} value={cat}>
                    {cat}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={6} md={3}>
            <FormControl fullWidth size="small">
              <InputLabel id="lang-filter-label">{t('courses.allLanguages')}</InputLabel>
              <Select
                labelId="lang-filter-label"
                value={langFilter}
                label={t('courses.allLanguages')}
                onChange={(e) => {
                  setLangFilter(e.target.value);
                  setPage(1);
                }}
              >
                <MenuItem value="">{t('courses.allLanguages')}</MenuItem>
                {supportedLanguages.map((l) => (
                  <MenuItem key={l.code} value={l.code}>
                    {l.nativeLabel}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
        </Grid>
      </Card>

      {loading ? (
        <Grid container spacing={3}>
          {[1, 2, 3, 4, 5, 6].map((n) => (
            <Grid item xs={12} sm={6} md={4} key={n}>
              <Skeleton variant="rounded" height={260} />
            </Grid>
          ))}
        </Grid>
      ) : courses.length === 0 ? (
        <Card className="glass-panel" sx={{ p: 5, textAlign: 'center' }}>
          <School sx={{ fontSize: 56, color: 'text.secondary', opacity: 0.4, mb: 1.5 }} />
          <Typography variant="h6" fontWeight={700} gutterBottom>
            {t('courses.noCoursesFound')}
          </Typography>
          <Button variant="outlined" onClick={handleClearFilters} sx={{ mt: 1 }}>
            {t('courses.clearFilters')}
          </Button>
        </Card>
      ) : (
        <>
          <Grid container spacing={3}>
            {courses.map((course) => {
              const localized = resolveEntityTranslation(course, language);
              const isOfflineReady = offlineCourseIds.includes(Number(course.id));
              const showThumb = course.thumbnail_url && (!lowBandwidthMode || revealedImages[course.id]);

              return (
                <Grid item xs={12} sm={6} md={4} key={course.id}>
                  <Card className="glass-panel glow-card" sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                    {showThumb && (
                      <CardMedia
                        component="img"
                        height="140"
                        image={course.thumbnail_url}
                        alt={`${localized.title} cover`}
                        loading="lazy"
                      />
                    )}
                    {course.thumbnail_url && lowBandwidthMode && !revealedImages[course.id] && (
                      <Box sx={{ px: 2, pt: 1.5 }}>
                        <Button
                          size="small"
                          startIcon={<ImageIcon fontSize="small" />}
                          onClick={() => setRevealedImages((prev) => ({ ...prev, [course.id]: true }))}
                        >
                          {t('lesson.loadMediaBtn')}
                        </Button>
                      </Box>
                    )}

                    <CardContent sx={{ flexGrow: 1 }}>
                      <Stack direction="row" spacing={1} flexWrap="wrap" mb={1.5}>
                        {course.category && (
                          <Chip label={course.category} size="small" color="primary" variant="outlined" />
                        )}
                        <Chip
                          label={getLanguageDisplayName(localized.activeLanguage)}
                          size="small"
                          variant="outlined"
                        />
                        {isOfflineReady && (
                          <Chip
                            icon={<OfflinePin />}
                            label={t('dashboard.availableOffline')}
                            size="small"
                            color="success"
                          />
                        )}
                      </Stack>

                      <Typography variant="h6" component="h2" fontWeight={700} gutterBottom>
                        {localized.title}
                      </Typography>

                      <Typography variant="body2" color="text.secondary" sx={{ mb: 2, lineHeight: 1.6 }}>
                        {localized.description
                          ? localized.description.length > 130
                            ? `${localized.description.slice(0, 130)}...`
                            : localized.description
                          : 'Interactive course modules designed for rural classrooms.'}
                      </Typography>

                      <Typography variant="caption" color="text.secondary" fontWeight={700}>
                        {t('courses.lessonsCount', { count: course.lesson_count ?? 0 })}
                      </Typography>
                    </CardContent>

                    <CardActions sx={{ p: 2, pt: 0 }}>
                      <Button
                        fullWidth
                        variant="contained"
                        component={Link}
                        to={`/courses/${course.id}`}
                        startIcon={<PlayArrow />}
                        sx={{ fontWeight: 700, textTransform: 'none' }}
                      >
                        {t('courses.viewDetails')}
                      </Button>
                    </CardActions>
                  </Card>
                </Grid>
              );
            })}
          </Grid>

          {totalPages > 1 && (
            <Box sx={{ display: 'flex', justifyContent: 'center', mt: 5 }}>
              <Pagination
                count={totalPages}
                page={page}
                onChange={(_e, value) => setPage(value)}
                color="primary"
                shape="rounded"
              />
            </Box>
          )}
        </>
      )}
    </Container>
  );
};

export default Courses;
