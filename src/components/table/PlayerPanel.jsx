import { useState } from 'react'
import ManaCost from '../ManaCost'
import { artCrop } from '../../lib/table/decks'
import { PLAYER_COUNTERS, COMMANDER_DAMAGE_LETHAL, lethalReason } from '../../lib/table/game'

// One player's corner of the table: life big in the middle, counters and commander damage
// below. Everyone can change everyone's numbers — like reaching over at the kitchen table.

function StepButton({ label, onClick, size = 'md', title }) {
  const sizes = { md: 'w-11 h-11 text-lg', sm: 'w-9 h-9 text-sm' }
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      className={`${sizes[size]} flex items-center justify-center font-semibold tabular-nums flex-shrink-0`}
      style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', color: 'var(--color-text)' }}
    >
      {label}
    </button>
  )
}

function Row({ label, value, warn, onMinus, onPlus, children, minusTitle, plusTitle }) {
  return (
    <div className="flex items-center gap-2 py-1">
      {children}
      <span className="flex-1 min-w-0 text-sm leading-tight" style={{ color: 'var(--color-text-secondary)' }}>{label}</span>
      <StepButton size="sm" label="−" onClick={onMinus} title={minusTitle} />
      <span className="w-8 text-center text-base font-bold tabular-nums" style={{ color: warn ? 'var(--r)' : 'var(--color-text)' }}>{value}</span>
      <StepButton size="sm" label="+" onClick={onPlus} title={plusTitle} />
    </div>
  )
}

export default function PlayerPanel({ seat, player, seats, isMe, isActive, isMonarch, online, dispatch }) {
  const [addingCounter, setAddingCounter] = useState(false)
  if (!player) return null
  const name = seat.name
  const deck = seat.deck || {}
  const lethal = lethalReason(player)
  const art = artCrop(deck.commanderImage)
  const life = (delta) => dispatch('life', { target: seat.playerId, delta })
  const shownCounters = PLAYER_COUNTERS.filter(counter => (player.counters[counter.key] || 0) > 0)
  const hiddenCounters = PLAYER_COUNTERS.filter(counter => !(player.counters[counter.key] > 0))
  const opponents = seats.filter(other => other.playerId !== seat.playerId)

  return (
    <section
      className="flex flex-col overflow-hidden"
      style={{
        background: 'var(--color-surface)',
        border: `${isActive ? 2 : 1}px solid ${isActive ? 'var(--gold)' : 'var(--color-border)'}`,
        borderRadius: 'var(--radius-md)',
        opacity: player.out ? 0.55 : 1
      }}
      aria-label={`${name}${isActive ? ' – am Zug' : ''}`}
    >
      {/* Commander art strip: who sits here, at a glance */}
      {/* Always dark (with or without art), so the white text on it reads in both themes. */}
      <header className="relative h-20 flex-shrink-0" style={{ background: '#1d1f24' }}>
        {art && <img src={art} alt="" className="absolute inset-0 w-full h-full object-cover" style={{ objectPosition: 'center 30%' }} />}
        <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(0,0,0,0.15) 0%, rgba(0,0,0,0.78) 100%)' }} />
        <div className="absolute inset-x-0 bottom-0 px-3 pb-2 flex items-end justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-white font-bold leading-tight">
              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: online ? 'var(--g)' : 'rgba(255,255,255,0.35)' }} title={online ? 'online' : 'nicht verbunden'} />
              <span className="truncate">{name}{isMe && <span className="font-normal text-white/70"> (du)</span>}</span>
            </div>
            <div className="text-xs text-white/80 truncate">{deck.commander || 'ohne Commander'}</div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {deck.colorIdentity?.length > 0 && <ManaCost cost={deck.colorIdentity.map(c => `{${c}}`).join('')} size={16} />}
            <button
              type="button"
              onClick={() => dispatch('monarch', { target: isMonarch ? null : seat.playerId })}
              className="text-lg leading-none"
              style={{ opacity: isMonarch ? 1 : 0.35, filter: isMonarch ? 'none' : 'grayscale(1)' }}
              title={isMonarch ? 'Monarch – antippen zum Entfernen' : 'Zum Monarchen machen'}
              aria-pressed={isMonarch}
            >
              👑
            </button>
          </div>
        </div>
      </header>

      {/* Life */}
      <div className="flex items-center justify-center gap-2 px-3 py-3">
        <StepButton label="−5" onClick={() => life(-5)} title={`${name}: 5 Leben weniger`} />
        <StepButton label="−" onClick={() => life(-1)} title={`${name}: 1 Leben weniger`} />
        <div className="w-24 text-center">
          <div className="text-5xl font-bold tabular-nums leading-none" style={{ color: player.life <= 0 ? 'var(--r)' : 'var(--color-text)' }}>{player.life}</div>
          <div className="text-[11px] mt-1" style={{ color: 'var(--color-text-muted)' }}>Leben</div>
        </div>
        <StepButton label="+" onClick={() => life(1)} title={`${name}: 1 Leben mehr`} />
        <StepButton label="+5" onClick={() => life(5)} title={`${name}: 5 Leben mehr`} />
      </div>

      {lethal && !player.out && (
        <p className="mx-3 mb-2 px-2 py-1 text-xs font-semibold text-center" style={{ color: 'var(--r)', border: '1px solid var(--r)', borderRadius: 'var(--radius-sm)' }}>
          {lethal} – ausgeschieden?
        </p>
      )}

      <div className="px-3 pb-3 flex flex-col gap-3">
        {/* Player counters */}
        <div>
          {shownCounters.map(counter => (
            <Row
              key={counter.key}
              label={counter.label}
              value={player.counters[counter.key]}
              warn={counter.lethal && player.counters[counter.key] >= counter.lethal}
              onMinus={() => dispatch('counter', { target: seat.playerId, key: counter.key, delta: -1 })}
              onPlus={() => dispatch('counter', { target: seat.playerId, key: counter.key, delta: 1 })}
              minusTitle={`${name}: ${counter.label} −1`}
              plusTitle={`${name}: ${counter.label} +1`}
            />
          ))}
          {hiddenCounters.length > 0 && (
            addingCounter ? (
              <div className="flex flex-wrap gap-2 pt-1">
                {hiddenCounters.map(counter => (
                  <button
                    key={counter.key}
                    type="button"
                    onClick={() => { dispatch('counter', { target: seat.playerId, key: counter.key, delta: 1 }); setAddingCounter(false) }}
                    className="btn-secondary text-xs px-3 min-h-[36px]"
                  >
                    {counter.label} +1
                  </button>
                ))}
                <button type="button" onClick={() => setAddingCounter(false)} className="text-xs underline" style={{ color: 'var(--color-text-muted)' }}>abbrechen</button>
              </div>
            ) : (
              <button type="button" onClick={() => setAddingCounter(true)} className="text-xs underline pt-1" style={{ color: 'var(--color-text-secondary)' }}>
                + Zähler (Gift, Energie, Erfahrung, Rad)
              </button>
            )
          )}
        </div>

        {/* Commander damage this player has taken, per opposing commander */}
        {opponents.length > 0 && (
          <div>
            <h4 className="text-xs font-semibold mb-1" style={{ color: 'var(--color-text-muted)' }}>
              Commander-Schaden erhalten <span className="font-normal">(zieht auch Leben ab)</span>
            </h4>
            {opponents.map(source => {
              const damage = player.commanderDamage[source.playerId] || 0
              const thumb = artCrop(source.deck?.commanderImage)
              return (
                <Row
                  key={source.playerId}
                  label={<>{source.deck?.commander || source.name} <span style={{ color: 'var(--color-text-muted)' }}>· {source.name}</span></>}
                  value={damage}
                  warn={damage >= COMMANDER_DAMAGE_LETHAL}
                  onMinus={() => dispatch('cmd', { target: seat.playerId, source: source.playerId, delta: -1 })}
                  onPlus={() => dispatch('cmd', { target: seat.playerId, source: source.playerId, delta: 1 })}
                  minusTitle={`${name}: Commander-Schaden von ${source.name} −1`}
                  plusTitle={`${name}: Commander-Schaden von ${source.name} +1`}
                >
                  {thumb
                    ? <img src={thumb} alt="" className="w-8 h-6 object-cover flex-shrink-0" style={{ borderRadius: 3 }} />
                    : <span className="w-8 h-6 flex-shrink-0" style={{ background: 'var(--color-bg)', borderRadius: 3 }} />}
                </Row>
              )
            })}
          </div>
        )}

        {/* Commander tax + out of the game */}
        <div className="flex items-center justify-between gap-3 pt-2" style={{ borderTop: '1px solid var(--color-border)' }}>
          <div className="flex items-center gap-2">
            <span className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>Commander-Steuer</span>
            <StepButton size="sm" label="−" onClick={() => dispatch('tax', { target: seat.playerId, delta: -2 })} title={`${name}: Commander-Steuer −2`} />
            <span className="w-8 text-center font-bold tabular-nums" style={{ color: 'var(--color-text)' }}>+{player.tax}</span>
            <StepButton size="sm" label="+" onClick={() => dispatch('tax', { target: seat.playerId, delta: 2 })} title={`${name}: Commander-Steuer +2`} />
          </div>
          <button
            type="button"
            onClick={() => dispatch('out', { target: seat.playerId, value: !player.out })}
            className="text-xs underline"
            style={{ color: player.out ? 'var(--g)' : 'var(--color-text-muted)' }}
          >
            {player.out ? 'zurück ins Spiel' : 'ausgeschieden'}
          </button>
        </div>
      </div>
    </section>
  )
}
