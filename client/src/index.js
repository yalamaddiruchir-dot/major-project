import React from 'react';
import ReactDOM from 'react-dom/client';
import '@fontsource/noto-sans-telugu/400.css';
import '@fontsource/noto-sans-telugu/700.css';
import '@fontsource/noto-sans-devanagari/400.css';
import '@fontsource/noto-sans-devanagari/700.css';
import './index.css';
import App from './App';
import { registerServiceWorker } from './services/swRegistration';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

registerServiceWorker();
