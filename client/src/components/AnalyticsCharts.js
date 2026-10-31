import React from 'react';
import { Box, Typography, Stack } from '@mui/material';

export const CourseCompletionBarChart = ({ data = [] }) => {
  if (!data.length) {
    return (
      <Typography variant="body2" color="text.secondary">
        No course data available for the selected filters.
      </Typography>
    );
  }

  return (
    <Box role="img" aria-label="Course completion and assessment score chart">
      <Stack spacing={2}>
        {data.slice(0, 8).map((item) => {
          const completion = Math.min(100, Math.max(0, Number(item.completion_percentage || 0)));
          const score = item.average_assessment_percentage !== null && item.average_assessment_percentage !== undefined
            ? Math.min(100, Math.max(0, Number(item.average_assessment_percentage)))
            : null;

          return (
            <Box key={item.course_id}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5, gap: 1 }}>
                <Typography variant="body2" fontWeight={600} noWrap sx={{ maxWidth: '65%' }}>
                  {item.title}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {item.enrolled_students} enrolled • {completion}% complete
                  {score !== null ? ` • Avg quiz ${score}%` : ''}
                </Typography>
              </Box>
              <svg width="100%" height={score !== null ? 24 : 12} aria-hidden="true">
                <rect x="0" y="0" width="100%" height="10" rx="5" fill="#e2e8f0" />
                <rect x="0" y="0" width={`${completion}%`} height="10" rx="5" fill="#1d4ed8" />
                {score !== null && (
                  <>
                    <rect x="0" y="13" width="100%" height="8" rx="4" fill="#e2e8f0" />
                    <rect
                      x="0"
                      y="13"
                      width={`${score}%`}
                      height="8"
                      rx="4"
                      fill={score >= 60 ? '#059669' : '#d97706'}
                    />
                  </>
                )}
              </svg>
            </Box>
          );
        })}
      </Stack>
      <Stack direction="row" spacing={3} mt={2}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Box sx={{ width: 12, height: 12, borderRadius: 1, bgcolor: '#1d4ed8' }} />
          <Typography variant="caption">Course Completion %</Typography>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Box sx={{ width: 12, height: 12, borderRadius: 1, bgcolor: '#059669' }} />
          <Typography variant="caption">Avg Assessment Score %</Typography>
        </Box>
      </Stack>
    </Box>
  );
};

export const ActivityTimelineChart = ({ timeline = [] }) => {
  if (!timeline.length) {
    return (
      <Typography variant="body2" color="text.secondary">
        No learning activity recorded in the past 14 days.
      </Typography>
    );
  }

  const maxInteractions = Math.max(1, ...timeline.map((d) => Number(d.lesson_interactions || 0)));
  const chartHeight = 140;
  const barWidth = Math.max(18, Math.floor(520 / Math.max(timeline.length, 1)) - 8);

  return (
    <Box sx={{ overflowX: 'auto' }}>
      <svg
        viewBox={`0 0 ${Math.max(360, timeline.length * (barWidth + 12))} ${chartHeight + 36}`}
        width="100%"
        height={chartHeight + 36}
        role="img"
        aria-label="Daily student learning activity chart"
      >
        <title>Daily Learning Activity (Last 14 Days)</title>
        {timeline.map((point, idx) => {
          const val = Number(point.lesson_interactions || 0);
          const barH = Math.max(4, Math.round((val / maxInteractions) * (chartHeight - 24)));
          const x = idx * (barWidth + 12) + 12;
          const y = chartHeight - barH;
          const shortDate = String(point.date || '').slice(5);
          return (
            <g key={point.date || idx}>
              <rect x={x} y={y} width={barWidth} height={barH} rx="4" fill="#0284c7" />
              <text x={x + barWidth / 2} y={y - 5} textAnchor="middle" fontSize="11" fill="#0f172a" fontWeight="600">
                {val}
              </text>
              <text x={x + barWidth / 2} y={chartHeight + 18} textAnchor="middle" fontSize="10" fill="#334155">
                {shortDate}
              </text>
            </g>
          );
        })}
      </svg>
    </Box>
  );
};
