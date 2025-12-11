import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { calculateTransform } from './utils/coordinateTransform'

// Initialize coordinate transform on startup
calculateTransform();
console.log('Elden Ring Route Viewer initialized');

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

