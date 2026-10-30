import React from 'react';
import { Box } from '@mui/material';
import { School, MenuBook, Science, Computer, Create, Calculate, Psychology, Public } from '@mui/icons-material';

const BackgroundAnimation = () => {
    const icons = [
        { Icon: School, top: '10%', left: '5%', size: 60, delay: '0s', duration: '25s' },
        { Icon: MenuBook, top: '20%', left: '80%', size: 50, delay: '2s', duration: '28s' },
        { Icon: Science, top: '70%', left: '15%', size: 55, delay: '4s', duration: '30s' },
        { Icon: Computer, top: '80%', left: '70%', size: 45, delay: '1s', duration: '22s' },
        { Icon: Create, top: '40%', left: '90%', size: 40, delay: '5s', duration: '26s' },
        { Icon: Calculate, top: '15%', left: '30%', size: 48, delay: '3s', duration: '24s' },
        { Icon: Psychology, top: '60%', left: '50%', size: 65, delay: '6s', duration: '32s' },
        { Icon: Public, top: '30%', left: '10%', size: 52, delay: '2s', duration: '29s' },
    ];

    return (
        <Box sx={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            zIndex: -1,
            overflow: 'hidden',
            pointerEvents: 'none',
        }}>
            {icons.map((item, index) => (
                <Box
                    key={index}
                    className="floating-icon"
                    sx={{
                        position: 'absolute',
                        top: item.top,
                        left: item.left,
                        color: 'rgba(255, 255, 255, 0.1)', // Subtle white for dark backgrounds or dark for light
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
