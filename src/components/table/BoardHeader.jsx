import ManaCost from '../ManaCost'
import { artCrop } from '../../lib/table/decks'
import { PLAYER_COUNTERS, COMMANDER_DAMAGE_LETHAL, lethalReason } from '../../lib/table/game'

// The strip on top of every board: who sits there (commander art), life with quick ±, the
// counters and commander damage that matter right now. Everything else: "Details".
// Always dark (art behind it), so the white text reads in both color schemes.

function LifeButton({ label, onClick, title }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      className="w-9 h-9 flex items-center justify-center font-bold text-base flex-shrink-0"
      style={{ background: 'rgba(255,255,255,0.12)', color: '#fff', borderRadius: 'var(--radius-sm)', border: '1px solid rgba(255,255,255,0.18)' }}
    >
      {label}
    </button>
  )
}

export default function BoardHeader({ seat, seats, player, isMe, isMonarch, online, dispatch, onDetails }) {
  if (!player) return null
  const deck = seat.deck || {}
  const art = artCrop(deck.commanderImage)
  const lethal = lethalReason(player)
  const counters = PLAYER_COUNTERS.filter(counter => (player.counters[counter.key] || 0) > 0)
  const damage = Object.entries(player.commanderDamage).filter(([, value]) => value > 0)
  const nameOf = (playerId) => seats.find(s => s.playerId === playerId)?.deck?.commander?.split(',')[0] || seats.find(s => s.playerId === playerId)?.name || '?'
  const life = (delta) => dispatch('life', { target: seat.playerId, delta })

  return (
    <div className="relative flex items-center gap-3 px-3 py-2 overflow-hidden" style={{ background: '#1d1f24', color: '#fff', opacity: player.out ? 0.6 : 1 }}>
      {art && <img src={art} alt="" className="absolute inset-0 w-full h-full object-cover" style={{ opacity: 0.38, objectPosition: 'center 30%' }} />}
      <div className="absolute inset-0" style={{ background: 'linear-gradient(90deg, rgba(20,21,25,0.92) 0%, rgba(20,21,25,0.55) 100%)' }} />

      <div className="relative min-w-0 flex-1">
        <div className="flex items-center gap-1.5 font-bold leading-tight">
          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: online ? '#3fb950' : 'rgba(255,255,255,0.35)' }} title={online ? 'online' : 'nicht verbunden'} />
          <span className="truncate">{seat.name}{isMe && <span className="font-normal" style={{ color: 'rgba(255,255,255,0.7)' }}> (du)</span>}</span>
          {deck.colorIdentity?.length > 0 && <ManaCost cost={deck.colorIdentity.map(c => `{${c}}`).join('')} size={13} />}
        </div>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.78)' }}>
          <span className="truncate max-w-[14rem]">{deck.commander || 'ohne Commander'}</span>
          {player.tax > 0 && <span>Steuer +{player.tax}</span>}
          {counters.map(counter => (
            <span key={counter.key} style={{ color: counter.lethal && player.counters[counter.key] >= counter.lethal ? '#ff7b72' : '#fff' }}>
              {counter.label} {player.counters[counter.key]}
            </span>
          ))}
          {damage.map(([source, value]) => (
            <span key={source} style={{ color: value >= COMMANDER_DAMAGE_LETHAL ? '#ff7b72' : '#fff' }}>⚔ {nameOf(source)} {value}</span>
          ))}
          {lethal && !player.out && <span style={{ color: '#ff7b72', fontWeight: 700 }}>{lethal}!</span>}
          {player.out && <span style={{ fontWeight: 700 }}>ausgeschieden</span>}
        </div>
      </div>

      <div className="relative flex items-center gap-1.5 flex-shrink-0">
        <LifeButton label="−" onClick={() => life(-1)} title={`${seat.name}: 1 Leben weniger`} />
        <span className="w-12 text-center text-2xl font-bold tabular-nums" style={{ color: player.life <= 0 ? '#ff7b72' : '#fff' }} title="Leben">{player.life}</span>
        <LifeButton label="+" onClick={() => life(1)} title={`${seat.name}: 1 Leben mehr`} />
        <button
          type="button"
          onClick={() => dispatch('monarch', { target: isMonarch ? null : seat.playerId })}
          className="w-9 h-9 text-lg leading-none"
          style={{ opacity: isMonarch ? 1 : 0.35, filter: isMonarch ? 'none' : 'grayscale(1)' }}
          title={isMonarch ? 'Monarch – antippen zum Entfernen' : 'Zum Monarchen machen'}
          aria-pressed={isMonarch}
        >
          👑
        </button>
        <button
          type="button"
          onClick={onDetails}
          className="w-9 h-9 text-lg font-bold leading-none"
          style={{ background: 'rgba(255,255,255,0.12)', color: '#fff', borderRadius: 'var(--radius-sm)', border: '1px solid rgba(255,255,255,0.18)' }}
          title="Details: Leben ±5, Zähler, Commander-Schaden, Steuer"
          aria-label={`Details zu ${seat.name}`}
        >
          ⋯
        </button>
      </div>
    </div>
  )
}
