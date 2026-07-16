import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@/styles/tokens/colors.css';
import '@/styles/tokens/typography.css';
import '@/styles/tokens/spacing.css';
import '@/index.css';
import App from '@/App';
import { AuthProvider } from '@/lib/auth';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </StrictMode>,
);
