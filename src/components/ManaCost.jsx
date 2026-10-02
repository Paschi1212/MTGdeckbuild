import { Fragment } from 'react'

// A card's mana cost drawn the way it's printed: one pip per symbol in the card's own
// symbol tints ("{X}{G}{U}" → X, G, U pips). Reads at a glance in a 99-card list where
// "CMC 3" can't tell a {2}{G} from a {G}{U}{R} card — and X spells stand out for decks
// built around them.
const PIP_TINT = { W: 'var(--pip-w)', U: 'var(--pip-u)', B: 'var(--pip-b)', R: 'var(--pip-r)', G: 'var(--pip-g)' }

function Pip({ symbol, size }) {
  const [first, second] = symbol.split('/')
  const colored = (s) => PIP_TINT[s] !== undefined

  let background = 'var(--pip-c)'
  let label = symbol
  if (colored(first) && colored(second)) {
    background = `linear-gradient(135deg, ${PIP_TINT[first]} 50%, ${PIP_TINT[second]} 50%)`
    label = ''
  } else if (colored(first)) {
    background = PIP_TINT[first]
    label = second === 'P' ? 'Φ' : first
  } else if (second && colored(second)) {
    // {2/W}-style hybrid: generic half shown as the number, tinted by its color.
    background = PIP_TINT[second]
    label = first
  }

  return (
    <span
      title={`{${symbol}}`}
      className="inline-flex items-center justify-center rounded-full font-bold leading-none flex-shrink-0"
      style={{
        width: size,
        height: size,
        background,
        color: 'var(--pip-ink)',
        fontSize: Math.round(size * 0.62),
        boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.18)'
      }}
    >
      {label}
    </span>
  )
}

export default function ManaCost({ cost, size = 16 }) {
  if (!cost) return null
  const faces = cost.split(' // ')
  return (
    <span className="inline-flex items-center gap-[3px]" aria-label={`Manakosten ${cost}`}>
      {faces.map((face, faceIndex) => (
        <Fragment key={faceIndex}>
          {faceIndex > 0 && <span className="text-xs px-0.5" style={{ color: 'var(--color-text-muted)' }}>/</span>}
          {[...face.matchAll(/\{([^}]+)\}/g)].map((match, i) => (
            <Pip key={i} symbol={match[1]} size={size} />
          ))}
        </Fragment>
      ))}
    </span>
  )
}
