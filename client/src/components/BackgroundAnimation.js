import React from 'react';
import { Box } from '@mui/material';
import { School, MenuBook, Science, Computer, Calculate } from '@mui/icons-material';
import { usePreferences } from '../context/PreferencesContext';

const BackgroundAnimation = () => {
  const { lowBandwidthMode } = usePreferences();

  if (lowBandwidthMode) {
    return null;
  }

  const icons = [
    { Icon: School, top: '12%', left: '6%', size: 54, delay: '0s', duration: '26s' },
    { Icon: MenuBook, top: '22%', left: '84%', size: 46, delay: '2s', duration: '28s' },
    { Icon: Science, top: '72%', left: '12%', size: 50, delay: '4s', duration: '30s' },
    { Icon: Computer, top: '78%', left: '76%', size: 44, delay: '1s', duration: '24s' },
    { Icon: Calculate, top: '18%', left: '34%', size: 44, delay: '3s', duration: '27s' },
  ];

  return (
    <Box
      aria-hidden="true"
      sx={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        zIndex: -1,
        overflow: 'hidden',
        pointerEvents: 'none',
      }}
    >
      {icons.map((item, index) => (
        <Box
          key={index}
          className="floating-icon"
          sx={{
            position: 'absolute',
            top: item.top,
            left: item.left,
            color: 'rgba(30, 64, 175, 0.08)',
            animationDelay: item.delay,
            animationDuration: item.duration,
          }}
        >
          <item.Icon sx={{ fontSize: item.size }} />
        </Box>
      ))}
    </Box>
  );
};

export default BackgroundAnimation;
