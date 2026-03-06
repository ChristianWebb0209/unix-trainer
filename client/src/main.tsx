import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.tsx'

// Suppress uncaught "Request timed out" from LSP client (language servers can be slow to initialize)
window.addEventListener("unhandledrejection", (event) => {
  const msg = event.reason?.message ?? String(event.reason);
  if (msg.includes("Request timed out")) {
    event.preventDefault();
    console.warn("[LSP] Request timed out; language server may be slow. Completions may appear after a moment.");
  }
});

// In dev, auto sign-in as dev user when VITE_DEV_USER_ID is set (after running npm run dev:seed-user)
if (import.meta.env.DEV && import.meta.env.VITE_DEV_USER_ID) {
  try {
    const devId = String(import.meta.env.VITE_DEV_USER_ID).trim()
    if (devId) {
      localStorage.setItem('user_id', devId)
      if (!localStorage.getItem('user_name')) localStorage.setItem('user_name', 'Dev')
      if (!localStorage.getItem('user_email')) localStorage.setItem('user_email', 'dev@local.dev')
    }
  } catch {
    // ignore
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
