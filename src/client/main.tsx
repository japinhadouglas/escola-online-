import React from 'react';
import ReactDOM from 'react-dom/client';
import { AuthProvider } from './context/AuthContext';
import { SocketProvider } from './context/SocketContext';
import { WebRTCProvider } from './context/WebRTCContext';
import { App } from './App';
import './index.css';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <AuthProvider>
      <SocketProvider>
        <WebRTCProvider>
          <App />
        </WebRTCProvider>
      </SocketProvider>
    </AuthProvider>
  </React.StrictMode>
);

// PWA: registra o Service Worker em produção (permite instalar no celular
// e abre como app a partir do ícone da tela inicial)
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      /* offline opcional — falha silenciosa */
    });
  });
}
