// Priority order matters: e.g. "Artifact Creature" should file under Creature,
// not Artifact, so Creature must be checked before Artifact.
const TYPE_PRIORITY = [
  'Creature',
  'Planeswalker',
  'Battle',
  'Land',
  'Instant',
  'Sorcery',
  'Artifact',
  'Enchantment'
]

export function classifyType(typeLine) {
  if (!typeLine) return 'Sonstige'

  for (const type of TYPE_PRIORITY) {
    if (typeLine.includes(type)) return type
  }

  return 'Sonstige'
}

// The only cards a Commander deck (Singleton format) may legally hold more than one
// copy of — used to guard against a duplicate "add" request silently creating an
// illegal 2nd copy of e.g. a nonbasic land.
export const BASIC_LAND_NAMES = new Set(['Plains', 'Island', 'Swamp', 'Mountain', 'Forest', 'Wastes'])

/**
 * Could this card lead a Commander deck (CR 903.3)? A legendary creature, a legendary Vehicle
 * or Spacecraft (allowed since Edge of Eternities, 2025), a card saying "can be your commander",
 * or a Background (only next to a commander with "Choose a Background"). Judged from the type
 * line of the front face and the rules text.
 */
export function canBeCommander(info) {
  const front = String(info?.typeLine || '').split('//')[0]
  if (!/Legendary/.test(front)) return /can be your commander/i.test(info?.oracleText || '')
  return /Creature|Vehicle|Spacecraft|Background/.test(front) || /can be your commander/i.test(info?.oracleText || '')
}
