import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import { ModelInitProvider } from './lib/ModelInitContext';
import AppRouter from './router/AppRouter';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ModelInitProvider>
      <AppRouter />
    </ModelInitProvider>
  </React.StrictMode>
);
