import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

const PreferencesContext = createContext();

const LOW_BW_KEY = 'rural_learning_low_bandwidth';
const FONT_SCALE_KEY = 'rural_learning_font_scale';

const detectSlowConnection = () => {
  if (typeof navigator === 'undefined') return false;
  const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  if (!conn) return false;
  if (conn.saveData) return true;
  return ['slow-2g', '2g'].includes(conn.effectiveType);
};

export const usePreferences = () => {
  const ctx = useContext(PreferencesContext);
  if (!ctx) throw new Error('usePreferences must be used within PreferencesProvider');
  return ctx;
};

export const PreferencesProvider = ({ children }) => {
  const [lowBandwidthMode, setLowBandwidthState] = useState(() => {
    try {
      const saved = localStorage.getItem(LOW_BW_KEY);
      if (saved !== null) return saved === 'true';
    } catch (_e) {
      // ignore
    }
    return detectSlowConnection();
  });

  const [fontScale, setFontScaleState] = useState(() => {
    try {
      const saved = Number(localStorage.getItem(FONT_SCALE_KEY));
      if ([1, 1.15, 1.3].includes(saved)) return saved;
    } catch (_e) {
      // ignore
    }
    return 1;
  });

  useEffect(() => {
    try {
      localStorage.setItem(LOW_BW_KEY, String(lowBandwidthMode));
    } catch (_e) {
      // ignore
    }
    if (typeof document !== 'undefined') {
      document.body.dataset.lowBandwidth = String(lowBandwidthMode);
    }
  }, [lowBandwidthMode]);

  useEffect(() => {
    try {
      localStorage.setItem(FONT_SCALE_KEY, String(fontScale));
    } catch (_e) {
      // ignore
    }
    if (typeof document !== 'undefined') {
      document.documentElement.style.fontSize = `${Math.round(fontScale * 100)}%`;
    }
  }, [fontScale]);

  const setLowBandwidthMode = useCallback((val) => {
    setLowBandwidthState(Boolean(val));
  }, []);

  const toggleLowBandwidthMode = useCallback(() => {
    setLowBandwidthState((prev) => !prev);
  }, []);

  const cycleFontScale = useCallback(() => {
    setFontScaleState((prev) => (prev === 1 ? 1.15 : prev === 1.15 ? 1.3 : 1));
  }, []);

  const setFontScale = useCallback((scale) => {
    if ([1, 1.15, 1.3].includes(Number(scale))) {
      setFontScaleState(Number(scale));
    }
  }, []);

  return (
    <PreferencesContext.Provider
      value={{
        lowBandwidthMode,
        setLowBandwidthMode,
        toggleLowBandwidthMode,
        fontScale,
        setFontScale,
        cycleFontScale,
      }}
    >
      {children}
    </PreferencesContext.Provider>
  );
};
