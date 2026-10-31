import React, { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import {
  AppBar,
  Toolbar,
  Typography,
  Button,
  Box,
  IconButton,
  Menu,
  MenuItem,
  Drawer,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Chip,
  Divider,
  Select,
  Tooltip,
  Badge,
} from '@mui/material';
import {
  AccountCircle,
  Dashboard as DashboardIcon,
  School,
  Person,
  Security,
  Menu as MenuIcon,
  CloudOff,
  CloudDone,
  Sync,
  Speed,
  TextFields,
  Quiz,
  WorkspacePremium,
  VerifiedUser,
  Storage,
  Logout,
} from '@mui/icons-material';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { usePreferences } from '../context/PreferencesContext';
import { useOffline } from '../context/OfflineContext';

const Navbar = () => {
  const { isAuthenticated, user, logout } = useAuth();
  const { language, setLanguage, t, supportedLanguages } = useLanguage();
  const { lowBandwidthMode, toggleLowBandwidthMode, fontScale, cycleFontScale } = usePreferences();
  const { isOffline, pendingSyncCount, syncing } = useOffline();

  const navigate = useNavigate();
  const location = useLocation();
  const [anchorEl, setAnchorEl] = useState(null);
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleAccountMenu = (event) => setAnchorEl(event.currentTarget);
  const handleCloseMenu = () => setAnchorEl(null);

  const handleLogout = async () => {
    handleCloseMenu();
    setMobileOpen(false);
    await logout();
    navigate('/');
  };

  const navItems = isAuthenticated
    ? [
        { to: '/dashboard', label: t('nav.dashboard'), icon: <DashboardIcon fontSize="small" /> },
        { to: '/courses', label: t('nav.courses'), icon: <School fontSize="small" /> },
        { to: '/assessments', label: t('nav.assessments'), icon: <Quiz fontSize="small" /> },
        ...(user?.role === 'student'
          ? [{ to: '/certificates', label: t('nav.certificates'), icon: <WorkspacePremium fontSize="small" /> }]
          : []),
        { to: '/offline', label: t('nav.offline'), icon: <Storage fontSize="small" /> },
        ...(user?.role === 'teacher' || user?.role === 'admin'
          ? [{ to: '/teacher', label: t('nav.teacher'), icon: <Person fontSize="small" /> }]
          : []),
        ...(user?.role === 'admin'
          ? [{ to: '/admin', label: t('nav.admin'), icon: <Security fontSize="small" /> }]
          : []),
      ]
    : [
        { to: '/verify-certificate', label: t('nav.verifyCertificate'), icon: <VerifiedUser fontSize="small" /> },
      ];

  return (
    <>
      <a href="#main-content" className="skip-link">
        {t('skipToContent')}
      </a>

      <AppBar
        position="sticky"
        component="header"
        sx={{
          background: 'linear-gradient(90deg, #1e3a8a 0%, #1d4ed8 100%)',
          boxShadow: '0 2px 10px rgba(15, 23, 42, 0.15)',
        }}
      >
        <Toolbar sx={{ gap: 1, minHeight: { xs: 56, sm: 64 }, flexWrap: 'nowrap' }}>
          {/* Mobile menu button */}
          <IconButton
            color="inherit"
            edge="start"
            aria-label="open navigation menu"
            onClick={() => setMobileOpen(true)}
            sx={{ display: { md: 'none' }, minWidth: 44, minHeight: 44 }}
          >
            <MenuIcon />
          </IconButton>

          <School sx={{ mr: 1, display: { xs: 'none', sm: 'inline-flex' } }} aria-hidden="true" />
          <Typography
            variant="h6"
            component={Link}
            to="/"
            sx={{
              fontWeight: 700,
              textDecoration: 'none',
              color: 'inherit',
              fontSize: { xs: '1rem', sm: '1.15rem' },
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              mr: 'auto',
            }}
          >
            {t('appTitle')}
          </Typography>

          {/* Desktop Navigation Links */}
          <Box
            component="nav"
            aria-label="Primary navigation"
            sx={{ display: { xs: 'none', md: 'flex' }, alignItems: 'center', gap: 0.5 }}
          >
            {navItems.map((item) => {
              const active = location.pathname === item.to || location.pathname.startsWith(`${item.to}/`);
              return (
                <Button
                  key={item.to}
                  color="inherit"
                  component={Link}
                  to={item.to}
                  startIcon={item.icon}
                  aria-current={active ? 'page' : undefined}
                  sx={{
                    textTransform: 'none',
                    fontWeight: active ? 700 : 500,
                    bgcolor: active ? 'rgba(255,255,255,0.16)' : 'transparent',
                    borderRadius: 2,
                    px: 1.25,
                  }}
                >
                  {item.label}
                </Button>
              );
            })}
          </Box>

          {/* Offline / Sync Status Indicator */}
          {isAuthenticated && (
            <Tooltip
              title={
                isOffline
                  ? t('nav.offlineMode')
                  : pendingSyncCount > 0
                    ? `${pendingSyncCount} ${t('nav.pendingSync')}`
                    : t('nav.online')
              }
            >
              <Chip
                component={Link}
                to="/offline"
                clickable
                size="small"
                icon={
                  isOffline ? (
                    <CloudOff sx={{ color: '#fff !important' }} />
                  ) : pendingSyncCount > 0 || syncing ? (
                    <Sync sx={{ color: '#fff !important' }} />
                  ) : (
                    <CloudDone sx={{ color: '#fff !important' }} />
                  )
                }
                label={
                  isOffline
                    ? t('nav.offlineMode')
                    : pendingSyncCount > 0
                      ? `${pendingSyncCount}`
                      : t('nav.online')
                }
                sx={{
                  bgcolor: isOffline
                    ? '#b45309'
                    : pendingSyncCount > 0
                      ? '#0369a1'
                      : 'rgba(255,255,255,0.18)',
                  color: '#ffffff',
                  fontWeight: 600,
                  display: { xs: 'none', sm: 'inline-flex' },
                }}
              />
            </Tooltip>
          )}

          {/* Low-Bandwidth Toggle */}
          <Tooltip title={lowBandwidthMode ? t('nav.lowBandwidthActive') : t('nav.lowBandwidth')}>
            <Button
              size="small"
              color="inherit"
              onClick={toggleLowBandwidthMode}
              aria-pressed={lowBandwidthMode}
              aria-label={t('nav.lowBandwidth')}
              startIcon={<Speed fontSize="small" />}
              sx={{
                display: { xs: 'none', lg: 'inline-flex' },
                textTransform: 'none',
                borderRadius: 2,
                border: '1px solid rgba(255,255,255,0.35)',
                bgcolor: lowBandwidthMode ? '#065f46' : 'transparent',
                px: 1.2,
              }}
            >
              {lowBandwidthMode ? t('nav.lowBandwidthActive') : t('nav.lowBandwidth')}
            </Button>
          </Tooltip>

          {/* Text Resizing Accessibility Control */}
          <Tooltip title={`${t('nav.textSize')}: ${Math.round(fontScale * 100)}%`}>
            <IconButton
              color="inherit"
              onClick={cycleFontScale}
              aria-label={`${t('nav.textSize')} ${Math.round(fontScale * 100)}%`}
              sx={{ display: { xs: 'none', sm: 'inline-flex' }, minWidth: 40, minHeight: 40 }}
            >
              <Badge badgeContent={`${Math.round(fontScale * 100)}%`} color="secondary" sx={{ '& .MuiBadge-badge': { fontSize: '0.6rem' } }}>
                <TextFields fontSize="small" />
              </Badge>
            </IconButton>
          </Tooltip>

          {/* Language Selector (English / తెలుగు / हिन्दी) */}
          <Select
            size="small"
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            SelectDisplayProps={{ 'aria-label': t('nav.language') }}
            inputProps={{ 'aria-label': t('nav.language') }}
            sx={{
              color: '#ffffff',
              fontWeight: 600,
              fontSize: '0.875rem',
              '.MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.4)' },
              '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#ffffff' },
              '.MuiSvgIcon-root': { color: '#ffffff' },
              minWidth: { xs: 88, sm: 108 },
              height: 36,
            }}
          >
            {supportedLanguages.map((lang) => (
              <MenuItem key={lang.code} value={lang.code}>
                {lang.nativeLabel}
              </MenuItem>
            ))}
          </Select>

          {/* Account Menu or Login/Register */}
          {isAuthenticated ? (
            <>
              <Button
                color="inherit"
                aria-label="account menu"
                aria-controls="menu-appbar"
                aria-haspopup="true"
                onClick={handleAccountMenu}
                startIcon={<AccountCircle />}
                sx={{
                  textTransform: 'none',
                  fontWeight: 600,
                  minWidth: 44,
                  minHeight: 44,
                  px: { xs: 1, md: 1.5 },
                }}
              >
                <Box component="span" sx={{ display: { xs: 'none', md: 'inline' } }}>
                  {user?.username}
                </Box>
              </Button>
              <Menu
                id="menu-appbar"
                anchorEl={anchorEl}
                open={Boolean(anchorEl)}
                onClose={handleCloseMenu}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
                transformOrigin={{ vertical: 'top', horizontal: 'right' }}
              >
                <MenuItem disabled sx={{ opacity: '1 !important', fontWeight: 700 }}>
                  {user?.full_name} ({user?.role})
                </MenuItem>
                <Divider />
                <MenuItem component={Link} to="/profile" onClick={handleCloseMenu}>
                  {t('nav.profile')}
                </MenuItem>
                <MenuItem component={Link} to="/offline" onClick={handleCloseMenu}>
                  {t('nav.offline')}
                </MenuItem>
                <MenuItem component={Link} to="/verify-certificate" onClick={handleCloseMenu}>
                  {t('nav.verifyCertificate')}
                </MenuItem>
                <Divider />
                <MenuItem onClick={handleLogout}>{t('nav.logout')}</MenuItem>
              </Menu>
            </>
          ) : (
            <Box sx={{ display: { xs: 'none', sm: 'flex' }, gap: 1 }}>
              <Button color="inherit" component={Link} to="/login" sx={{ textTransform: 'none', fontWeight: 600 }}>
                {t('nav.login')}
              </Button>
              <Button
                variant="contained"
                component={Link}
                to="/register"
                sx={{
                  bgcolor: '#ffffff',
                  color: '#1e3a8a',
                  textTransform: 'none',
                  fontWeight: 700,
                  '&:hover': { bgcolor: '#e2e8f0' },
                }}
              >
                {t('nav.register')}
              </Button>
            </Box>
          )}
        </Toolbar>
      </AppBar>

      {/* Mobile Navigation Drawer */}
      <Drawer
        anchor="left"
        open={mobileOpen}
        onClose={() => setMobileOpen(false)}
        PaperProps={{ sx: { width: 280 } }}
      >
        <Box sx={{ p: 2, bgcolor: '#1e3a8a', color: '#ffffff' }}>
          <Typography variant="subtitle1" fontWeight={700}>
            {t('appTitle')}
          </Typography>
          <Typography variant="caption" sx={{ opacity: 0.9, display: 'block' }}>
            {isOffline ? t('nav.offlineMode') : t('nav.online')}
            {pendingSyncCount > 0 ? ` • ${pendingSyncCount} ${t('nav.pendingSync')}` : ''}
          </Typography>
        </Box>

        <List>
          {navItems.map((item) => (
            <ListItemButton
              key={item.to}
              component={Link}
              to={item.to}
              onClick={() => setMobileOpen(false)}
              selected={location.pathname === item.to}
              sx={{ minHeight: 48 }}
            >
              <ListItemIcon>{item.icon}</ListItemIcon>
              <ListItemText primary={item.label} />
            </ListItemButton>
          ))}

          {!isAuthenticated && (
            <>
              <ListItemButton component={Link} to="/login" onClick={() => setMobileOpen(false)} sx={{ minHeight: 48 }}>
                <ListItemIcon><AccountCircle fontSize="small" /></ListItemIcon>
                <ListItemText primary={t('nav.login')} />
              </ListItemButton>
              <ListItemButton component={Link} to="/register" onClick={() => setMobileOpen(false)} sx={{ minHeight: 48 }}>
                <ListItemIcon><School fontSize="small" /></ListItemIcon>
                <ListItemText primary={t('nav.register')} />
              </ListItemButton>
            </>
          )}

          <Divider sx={{ my: 1 }} />

          <ListItemButton onClick={toggleLowBandwidthMode} sx={{ minHeight: 48 }}>
            <ListItemIcon><Speed fontSize="small" color={lowBandwidthMode ? 'success' : 'inherit'} /></ListItemIcon>
            <ListItemText
              primary={lowBandwidthMode ? t('nav.lowBandwidthActive') : t('nav.lowBandwidth')}
            />
          </ListItemButton>

          <ListItemButton onClick={cycleFontScale} sx={{ minHeight: 48 }}>
            <ListItemIcon><TextFields fontSize="small" /></ListItemIcon>
            <ListItemText primary={`${t('nav.textSize')}: ${Math.round(fontScale * 100)}%`} />
          </ListItemButton>

          {isAuthenticated && (
            <>
              <Divider sx={{ my: 1 }} />
              <ListItemButton component={Link} to="/profile" onClick={() => setMobileOpen(false)} sx={{ minHeight: 48 }}>
                <ListItemIcon><Person fontSize="small" /></ListItemIcon>
                <ListItemText primary={t('nav.profile')} />
              </ListItemButton>
              <ListItemButton onClick={handleLogout} sx={{ minHeight: 48 }}>
                <ListItemIcon><Logout fontSize="small" color="error" /></ListItemIcon>
                <ListItemText primary={t('nav.logout')} />
              </ListItemButton>
            </>
          )}
        </List>
      </Drawer>
    </>
  );
};

export default Navbar;
