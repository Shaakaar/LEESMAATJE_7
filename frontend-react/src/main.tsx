import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import './index.css';
import LoginPage from './pages/LoginPage';
import { ModelInitProvider } from './lib/ModelInitContext';
import DashboardPage from './pages/DashboardPage';
import LevelPage from './pages/LevelPage';
import PlayPage from './pages/PlayPage';
import ProgressPage from './pages/ProgressPage';
import RequireAuth from './components/RequireAuth';
import StoryPage from './pages/StoryPage';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <ModelInitProvider>
        <Routes>
          <Route path="/" element={<LoginPage />} />
          <Route element={<RequireAuth />}>
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/dashboard/level/:levelId" element={<LevelPage />} />
            <Route path="/play/:levelId/:themeId" element={<PlayPage />} />
            <Route path="/story" element={<StoryPage />} />
            <Route path="/progress" element={<ProgressPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </ModelInitProvider>
    </BrowserRouter>
  </React.StrictMode>
);
