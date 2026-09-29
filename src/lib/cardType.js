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
