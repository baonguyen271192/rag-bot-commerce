import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { AuthProvider } from './lib/auth'
import { CONSOLE_PREFIX, IS_PORTAL } from './lib/console'
import App from './App.jsx'
import './index.css'

// Nhận diện màu riêng cho 2 cổng (xem index.css `[data-console="portal"]`) — set 1 LẦN
// trước render, cùng cơ chế attribute đã dùng cho `data-theme` (dark/light).
document.documentElement.dataset.console = IS_PORTAL ? 'portal' : 'admin'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter basename={CONSOLE_PREFIX}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
)
