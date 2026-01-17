import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import App from './App'
import AccountPage from './pages/AccountPage'
import { calculateTransform } from './utils/coordinateTransform'

// Initialize coordinate transform on startup
calculateTransform();
console.log('Elden Ring Route Viewer initialized');

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<App />} />
        <Route path="/account" element={<AccountPage />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
)

