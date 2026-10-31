import React, { useRef, useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  IconButton,
  Slider,
  Button,
  Select,
  MenuItem,
  Chip,
  LinearProgress,
  Stack,
} from '@mui/material';
import {
  PlayArrow,
  Pause,
  Replay10,
  Forward10,
  VolumeUp,
  VolumeOff,
  Download,
  OfflinePin,
  CloudDownload,
} from '@mui/icons-material';
import {
  hasOfflineMedia,
  getOfflineMediaObjectUrl,
  saveMediaBlobOffline,
} from '../services/offlineDb';

const SPEEDS = [0.75, 1, 1.25, 1.5, 2];

const formatSeconds = (sec) => {
  const s = Math.max(0, Math.floor(Number(sec) || 0));
  const mins = Math.floor(s / 60);
  const rem = s % 60;
  return `${mins}:${rem < 10 ? '0' : ''}${rem}`;
};

const AudioLessonPlayer = ({
  userId,
  courseId,
  lessonId,
  title,
  canonicalUrl,
  signedUrl,
  initialPositionSeconds = 0,
  lowBandwidthMode = false,
  onProgressTick,
  onCompleted,
}) => {
  const audioRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(initialPositionSeconds || 0);
  const [duration, setDuration] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [muted, setMuted] = useState(false);
  const [offlineSrc, setOfflineSrc] = useState(null);
  const [isSavedOffline, setIsSavedOffline] = useState(false);
  const [downloadingPct, setDownloadingPct] = useState(null);
  const [loadAuthorized, setLoadAuthorized] = useState(!lowBandwidthMode);
  const lastReportedPercentRef = useRef(0);

  useEffect(() => {
    let active = true;
    const checkCached = async () => {
      if (!userId || !canonicalUrl) return;
      try {
        const cached = await hasOfflineMedia(userId, canonicalUrl);
        if (active) setIsSavedOffline(cached);
        if (cached) {
          const objUrl = await getOfflineMediaObjectUrl(userId, canonicalUrl);
          if (active && objUrl) {
            setOfflineSrc(objUrl);
            setLoadAuthorized(true);
          }
        }
      } catch (_e) {
        // ignore
      }
    };
    checkCached();
    return () => {
      active = false;
    };
  }, [userId, canonicalUrl]);

  const effectiveSrc = offlineSrc || signedUrl || canonicalUrl;

  const togglePlay = async () => {
    const el = audioRef.current;
    if (!el) return;
    if (playing) {
      el.pause();
      setPlaying(false);
    } else {
      try {
        await el.play();
        setPlaying(true);
      } catch (_err) {
        setPlaying(false);
      }
    }
  };

  const skipBy = (delta) => {
    const el = audioRef.current;
    if (!el) return;
    const next = Math.min(duration || Infinity, Math.max(0, el.currentTime + delta));
    el.currentTime = next;
    setCurrentTime(next);
  };

  const handleSpeedChange = (e) => {
    const val = Number(e.target.value);
    setSpeed(val);
    if (audioRef.current) {
      audioRef.current.playbackRate = val;
    }
  };

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    if (audioRef.current) {
      audioRef.current.muted = next;
    }
  };

  const handleSaveOffline = async () => {
    if (!userId || !canonicalUrl) return;
    setDownloadingPct(1);
    try {
      await saveMediaBlobOffline(userId, {
        canonicalUrl,
        downloadUrl: signedUrl || canonicalUrl,
        courseId,
        lessonId,
        onProgress: (pct) => setDownloadingPct(pct),
      });
      setIsSavedOffline(true);
      const objUrl = await getOfflineMediaObjectUrl(userId, canonicalUrl);
      if (objUrl) {
        setOfflineSrc(objUrl);
        setLoadAuthorized(true);
      }
    } finally {
      setDownloadingPct(null);
    }
  };

  const handleTimeUpdate = () => {
    const el = audioRef.current;
    if (!el) return;
    setCurrentTime(el.currentTime);
    if (el.duration > 0) {
      const pct = Math.min(100, Math.round((el.currentTime / el.duration) * 100));
      if (onProgressTick && pct - lastReportedPercentRef.current >= 20) {
        lastReportedPercentRef.current = pct;
        onProgressTick(pct, Math.floor(el.currentTime));
      }
    }
  };

  const handleEnded = () => {
    setPlaying(false);
    if (onCompleted) onCompleted();
  };

  const directDownloadHref = (signedUrl || canonicalUrl || '').includes('?')
    ? `${signedUrl || canonicalUrl}&download=1`
    : `${signedUrl || canonicalUrl}?download=1`;

  return (
    <Card className="glass-panel" sx={{ mb: 3 }}>
      <CardContent>
        <Stack direction="row" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={1} mb={2}>
          <Typography variant="h6" fontWeight={700}>
            {title || 'Audio Lesson'}
          </Typography>
          <Stack direction="row" spacing={1} alignItems="center">
            {isSavedOffline && (
              <Chip
                icon={<OfflinePin />}
                label="Available Offline"
                color="success"
                size="small"
              />
            )}
            {!isSavedOffline && userId && (
              <Button
                size="small"
                variant="outlined"
                startIcon={<CloudDownload />}
                disabled={downloadingPct !== null}
                onClick={handleSaveOffline}
              >
                {downloadingPct !== null ? `Saving ${downloadingPct}%` : 'Save Audio Offline'}
              </Button>
            )}
            <Button
              size="small"
              variant="text"
              component="a"
              href={offlineSrc || directDownloadHref}
              download
              startIcon={<Download />}
            >
              Download Audio
            </Button>
          </Stack>
        </Stack>

        {downloadingPct !== null && (
          <LinearProgress variant="determinate" value={downloadingPct} sx={{ mb: 2, borderRadius: 2 }} />
        )}

        {!loadAuthorized && !offlineSrc ? (
          <Box sx={{ p: 2, bgcolor: '#f1f5f9', borderRadius: 2, textAlign: 'center' }}>
            <Typography variant="body2" sx={{ mb: 1.5 }}>
              Low-Bandwidth Mode is active. Click below to stream this audio lesson or save it offline first.
            </Typography>
            <Button variant="contained" size="small" onClick={() => setLoadAuthorized(true)}>
              Load Audio Player
            </Button>
          </Box>
        ) : (
          <Box>
            <audio
              ref={audioRef}
              src={effectiveSrc}
              preload={offlineSrc ? 'auto' : 'metadata'}
              onLoadedMetadata={() => {
                if (audioRef.current) {
                  setDuration(audioRef.current.duration || 0);
                  if (initialPositionSeconds > 0 && initialPositionSeconds < audioRef.current.duration) {
                    audioRef.current.currentTime = initialPositionSeconds;
                  }
                }
              }}
              onTimeUpdate={handleTimeUpdate}
              onPlay={() => setPlaying(true)}
              onPause={() => setPlaying(false)}
              onEnded={handleEnded}
            />

            <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap">
              <IconButton
                onClick={() => skipBy(-10)}
                aria-label="Rewind 10 seconds"
                sx={{ minWidth: 44, minHeight: 44 }}
              >
                <Replay10 />
              </IconButton>

              <IconButton
                color="primary"
                onClick={togglePlay}
                aria-label={playing ? 'Pause audio' : 'Play audio'}
                sx={{
                  bgcolor: 'primary.main',
                  color: '#fff',
                  minWidth: 48,
                  minHeight: 48,
                  '&:hover': { bgcolor: 'primary.dark' },
                }}
              >
                {playing ? <Pause /> : <PlayArrow />}
              </IconButton>

              <IconButton
                onClick={() => skipBy(10)}
                aria-label="Forward 10 seconds"
                sx={{ minWidth: 44, minHeight: 44 }}
              >
                <Forward10 />
              </IconButton>

              <Box sx={{ flexGrow: 1, minWidth: 150, px: 1 }}>
                <Slider
                  aria-label="Audio playback position"
                  min={0}
                  max={duration > 0 ? duration : 100}
                  value={Math.min(currentTime, duration > 0 ? duration : 100)}
                  onChange={(_e, val) => {
                    const num = Number(val);
                    setCurrentTime(num);
                    if (audioRef.current) audioRef.current.currentTime = num;
                  }}
                />
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: -1 }}>
                  <Typography variant="caption">{formatSeconds(currentTime)}</Typography>
                  <Typography variant="caption">{formatSeconds(duration)}</Typography>
                </Box>
              </Box>

              <Select
                size="small"
                value={speed}
                onChange={handleSpeedChange}
                inputProps={{ 'aria-label': 'Playback speed' }}
                sx={{ minWidth: 78 }}
              >
                {SPEEDS.map((s) => (
                  <MenuItem key={s} value={s}>
                    {s}x
                  </MenuItem>
                ))}
              </Select>

              <IconButton
                onClick={toggleMute}
                aria-label={muted ? 'Unmute audio' : 'Mute audio'}
                sx={{ minWidth: 44, minHeight: 44 }}
              >
                {muted ? <VolumeOff /> : <VolumeUp />}
              </IconButton>
            </Stack>
          </Box>
        )}
      </CardContent>
    </Card>
  );
};

export default AudioLessonPlayer;
