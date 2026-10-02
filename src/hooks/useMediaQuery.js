import { useEffect, useState } from 'react'

// True while the CSS media query matches — for layouts that differ in structure (not just
// styling) between phone and desktop, like the editor's sidebar vs. tab bar.
export function useMediaQuery(query) {
  const [matches, setMatches] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches)

  useEffect(() => {
    const media = window.matchMedia(query)
    const update = () => setMatches(media.matches)
    update()
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [query])

  return matches
}
