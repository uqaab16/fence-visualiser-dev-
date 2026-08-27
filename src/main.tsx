import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import posthog from 'posthog-js';
import App from './App.tsx';
import './index.css';

const posthogKey = import.meta.env.VITE_POSTHOG_KEY;
if (posthogKey) {
  posthog.init(posthogKey, {
    api_host: 'https://us.i.posthog.com',
    // Session Replay
    session_recording: {
      maskAllInputs: true,       // mask typed values so PII never appears in replays
      maskTextSelector: 'input, textarea', // belt-and-suspenders: mask text in those elements too
    },
    // Autocapture covers clicks, page views, and form interactions automatically
    autocapture: true,
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
