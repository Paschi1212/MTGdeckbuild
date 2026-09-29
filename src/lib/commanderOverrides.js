const STORAGE_KEY = 'mtg_commander_overrides'

function loadOverrides() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')
  } catch {
    return {}
  }
}

export function getCommanderOverride(deckName) {
  if (!deckName) return ''
  return loadOverrides()[deckName] || ''
}

export function setCommanderOverride(deckName, commanderName) {
  if (!deckName) return
  const overrides = loadOverrides()
  overrides[deckName] = commanderName
  localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides))
}
