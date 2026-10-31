import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { translations, SUPPORTED_LANGUAGES, normalizeLang } from '../i18n/translations';

const LanguageContext = createContext();

const STORAGE_KEY = 'rural_learning_ui_lang';

export const useLanguage = () => {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useLanguage must be used within LanguageProvider');
  return ctx;
};

export const LanguageProvider = ({ children }) => {
  const [language, setLanguageState] = useState(() => {
    try {
      return normalizeLang(localStorage.getItem(STORAGE_KEY) || 'en');
    } catch (_e) {
      return 'en';
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, language);
    } catch (_e) {
      // ignore storage errors
    }
    if (typeof document !== 'undefined') {
      document.documentElement.lang = language;
    }
  }, [language]);

  const setLanguage = useCallback((nextLang) => {
    setLanguageState(normalizeLang(nextLang));
  }, []);

  const t = useCallback(
    (keyPath, vars = {}) => {
      const segments = String(keyPath).split('.');
      let current = translations[language] || translations.en;
      for (const seg of segments) {
        if (current && Object.prototype.hasOwnProperty.call(current, seg)) {
          current = current[seg];
        } else {
          current = null;
          break;
        }
      }
      if (typeof current !== 'string') {
        let fallback = translations.en;
        for (const seg of segments) {
          fallback = fallback ? fallback[seg] : null;
        }
        current = typeof fallback === 'string' ? fallback : keyPath;
      }

      return Object.entries(vars).reduce(
        (acc, [k, v]) => acc.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v ?? '')),
        current
      );
    },
    [language]
  );

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t, supportedLanguages: SUPPORTED_LANGUAGES }}>
      {children}
    </LanguageContext.Provider>
  );
};
