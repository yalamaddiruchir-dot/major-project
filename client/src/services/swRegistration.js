export const registerServiceWorker = () => {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return;
  }

  const isProd = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.PROD)
    || (typeof process !== 'undefined' && process.env && (
      process.env.NODE_ENV === 'production' || process.env.REACT_APP_ENABLE_SW === 'true'
    ));

  if (!isProd) {
    return;
  }

  const doRegister = () => {
    navigator.serviceWorker
      .register('/service-worker.js', { scope: '/' })
      .then((registration) => {
        registration.onupdatefound = () => {
          const installingWorker = registration.installing;
          if (!installingWorker) return;
          installingWorker.onstatechange = () => {
            if (installingWorker.state === 'installed' && navigator.serviceWorker.controller) {
              installingWorker.postMessage({ type: 'SKIP_WAITING' });
            }
          };
        };
      })
      .catch((err) => {
        console.warn('Service worker registration failed:', err);
      });
  };

  if (document.readyState === 'complete') {
    doRegister();
  } else {
    window.addEventListener('load', doRegister);
  }
};
