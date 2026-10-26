import { useState, useEffect } from 'react'

const EVENT = 'mtg-theme'

function initialTheme() {
  const saved = localStorage.getItem('theme')
  if (saved) return saved
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

// Light/dark. Every component using this hook (the header button, the settings page) stays in
// step: a change in one is announced to the others.
export function useTheme() {
  const [theme, setThemeState] = useState(initialTheme)

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const handleChange = (e) => {
      if (!localStorage.getItem('theme')) setThemeState(e.matches ? 'dark' : 'light')
    }
    const handleOther = () => setThemeState(initialTheme())
    media.addEventListener('change', handleChange)
    window.addEventListener(EVENT, handleOther)
    return () => {
      media.removeEventListener('change', handleChange)
      window.removeEventListener(EVENT, handleOther)
    }
  }, [])

  // 'light' | 'dark' — or 'system' to follow the device again.
  const setTheme = (next) => {
    if (next === 'system') localStorage.removeItem('theme')
    else localStorage.setItem('theme', next)
    setThemeState(initialTheme())
    window.dispatchEvent(new Event(EVENT))
  }
  const toggle = () => setTheme(theme === 'dark' ? 'light' : 'dark')
  const followsSystem = !localStorage.getItem('theme')

  return { theme, toggle, setTheme, followsSystem }
}
