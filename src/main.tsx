import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Clear and unregister any active Service Workers to avoid aggressive caching and blank screens on GitHub Pages
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then((registrations) => {
    for (const registration of registrations) {
      registration.unregister().then(() => {
        console.log('[PWA] Service Worker unregistered to prevent cache/blank screen issues.');
      });
    }
  }).catch((err) => {
    console.error('[PWA] Failed to unregister service worker:', err);
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
