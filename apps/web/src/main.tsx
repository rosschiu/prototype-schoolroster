import React from 'react';
import ReactDOM from 'react-dom/client';
import { SchedulePlannerPage } from './routes/rostering/SchedulePlannerPage.js';
import './styles.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <SchedulePlannerPage />
  </React.StrictMode>
);
