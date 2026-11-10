import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { ErpApp } from './erp/ErpApp.tsx';
import { AuthProvider } from './auth/AuthContext.tsx';
import './index.css';

/**
 * Two workspaces, one deployment:
 *   /       → multi-tenant lodge management ERP
 *   /cctv   → the existing CCTV / Gemini analysis workspace
 */
const isCctvWorkspace = window.location.pathname.replace(/\/+$/, '') === '/cctv';

createRoot(document.getElementById('root')!).render(
  isCctvWorkspace ? (
    <App initialRoute="monitoring" />
  ) : (
    <AuthProvider>
      <ErpApp />
    </AuthProvider>
  )
);
