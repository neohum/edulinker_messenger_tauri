import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { createElectronAPI } from './tauri/electronAPI';
import './index.css';

if (!(window as any).electronAPI) {
  (window as any).electronAPI = createElectronAPI();
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
