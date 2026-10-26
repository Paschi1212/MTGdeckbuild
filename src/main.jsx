import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { applyAppearance } from './lib/appearance'
import './index.css'
import './themes.css'

// Style, table look and light/dark on <html> before the first paint — no flash of the default.
applyAppearance()
try {
  const theme = localStorage.getItem('theme') || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
  document.documentElement.setAttribute('data-theme', theme)
} catch { /* storage blocked: useTheme sets it after mount */ }

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
