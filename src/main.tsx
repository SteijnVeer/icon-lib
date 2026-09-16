import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './style.css';

createRoot(document.documentElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
