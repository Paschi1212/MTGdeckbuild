import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { rememberHosting } from '../../lib/table/lobby'
import { randomId } from '../../lib/table/realtime'
import { MODES } from '../../lib/draft/packs'

const PLAYER_CHOICES = [2, 3, 4, 5, 6, 7, 8]
const TYPE_LABEL = { expansion: 'Edition', core: 'Grundset', masters: 'Masters', draft_innovation: 'Draft-Set', funny: 'Un-Set' }

// "Draft öffnen" on the game-table page: mode, a set per round (any edition), players, timer.
export default function DraftSetup({ me, disabled }) {
  const navigate = useNavigate()
  const [sets, setSets] = useState(null)
  const [error, setError] = useState(null)
  const [mode, setMode] = useState('normal')
  const [rounds, setRounds] = useState(['', '', ''])
  const [sameForAll, setSameForAll] = useState(true)
  const [maxPlayers, setMaxPlayers] = useState(8)
  const [timer, setTimer] = useState(true)
  const [isPrivate, setIsPrivate] = useState(false)
  const [name, setName] = useState(`Draft von ${me.name}`)

  useEffect(() => {
    fetch('/.netlify/functions/draft-data?sets=1')
      .then(response => (response.ok ? response.json() : Promise.reject(new Error('Sets nicht verfügbar'))))
      .then(data => {
        setSets(data.sets)
        const latest = data.sets.find(set => set.type === 'expansion')?.code || data.sets[0]?.code || ''
        setRounds([latest, latest, latest])
      })
      .catch(err => setError(err.message))
  }, [])

  const setName_ = (code) => sets?.find(set => set.code === code)?.name || code.toUpperCase()
  const grouped = useMemo(() => {
    const groups = {}
    for (const set of sets || []) (groups[set.released.slice(0, 4)] ||= []).push(set)
    return Object.entries(groups).sort((a, b) => b[0].localeCompare(a[0]))
  }, [sets])

  const chooseRound = (index, code) => setRounds(prev => (sameForAll ? [code, code, code] : prev.map((c, i) => (i === index ? code : c))))

  const create = (event) => {
    event.preventDefault()
    if (!rounds.every(Boolean)) return
    const draftId = randomId()
    rememberHosting(draftId, {
      kind: 'draft',
      name: name.trim() || `Draft von ${me.name}`,
      maxPlayers,
      private: isPrivate,
      createdAt: Date.now(),
      mode,
      sets: rounds,
      setNames: rounds.map(setName_),
      timer
    })
    navigate(`/draft/${draftId}`)
  }

  const select = (index) => (
    <select
      value={rounds[index]}
      onChange={(e) => chooseRound(index, e.target.value)}
      className="w-full text-fg rounded-xl p-2.5 text-sm min-h-[44px]"
      aria-label={sameForAll ? 'Set für alle Runden' : `Set für Booster ${index + 1}`}
    >
      {grouped.map(([year, list]) => (
        <optgroup key={year} label={year}>
          {list.map(set => <option key={set.code} value={set.code}>{set.name} ({set.code.toUpperCase()}) · {TYPE_LABEL[set.type] || set.type}</option>)}
        </optgroup>
      ))}
    </select>
  )

  return (
    <form onSubmit={create} className="card space-y-4">
      <h2 className="text-lg font-bold">Draft öffnen</h2>
      <div className="flex gap-2">
        {Object.entries(MODES).map(([key, info]) => (
          <button
            key={key}
            type="button"
            onClick={() => setMode(key)}
            aria-pressed={mode === key}
            className="flex-1 min-h-[40px] text-sm font-semibold"
            style={{
              background: mode === key ? 'var(--color-accent)' : 'var(--color-surface)',
              color: mode === key ? 'var(--color-bg)' : 'var(--color-text)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-sm)'
            }}
          >
            {info.label}
          </button>
        ))}
      </div>
      <p className="text-xs leading-relaxed" style={{ color: 'var(--color-text-muted)' }}>
        {mode === 'commander'
          ? 'Wie Commander Legends: 3 Booster à 20 Karten mit je 2 Legenden, 2 Karten pro Pick. Deck mind. 60 Karten mit Commander, kein Singleton, 40 Leben.'
          : '3 Booster à 15 Karten (1 Rare/Mythic, 3 Uncommons, 10 Commons, 1 Standardland), 1 Karte pro Pick. Deck mind. 40 Karten, 20 Leben.'}
      </p>

      <label className="block">
        <span className="text-sm block mb-1" style={{ color: 'var(--color-text-secondary)' }}>Name</span>
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} className="w-full text-fg rounded-xl p-2.5 text-sm" />
      </label>

      <div className="space-y-2">
        <span className="text-sm block" style={{ color: 'var(--color-text-secondary)' }}>Edition</span>
        {error && <p className="text-sm" style={{ color: 'var(--r)' }}>{error}</p>}
        {!sets && !error && <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>Lade Editionen …</p>}
        {sets && (sameForAll ? select(0) : [0, 1, 2].map(index => (
          <div key={index} className="flex items-center gap-2">
            <span className="text-xs w-16 flex-shrink-0" style={{ color: 'var(--color-text-muted)' }}>Booster {index + 1}</span>
            {select(index)}
          </div>
        )))}
        <label className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: 'var(--color-text-secondary)' }}>
          <input type="checkbox" checked={sameForAll} onChange={(e) => { setSameForAll(e.target.checked); if (e.target.checked) setRounds([rounds[0], rounds[0], rounds[0]]) }} />
          Alle drei Booster aus derselben Edition
        </label>
      </div>

      <div>
        <span className="text-sm block mb-1" style={{ color: 'var(--color-text-secondary)' }}>Spieler (höchstens)</span>
        <div className="flex gap-1.5">
          {PLAYER_CHOICES.map(n => (
            <button
              key={n}
              type="button"
              onClick={() => setMaxPlayers(n)}
              aria-pressed={maxPlayers === n}
              className="flex-1 min-h-[40px] text-sm font-semibold tabular-nums"
              style={{
                background: maxPlayers === n ? 'var(--color-accent)' : 'var(--color-surface)',
                color: maxPlayers === n ? 'var(--color-bg)' : 'var(--color-text)',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-sm)'
              }}
            >
              {n}
            </button>
          ))}
        </div>
      </div>
      <label className="flex items-start gap-2 text-sm cursor-pointer" style={{ color: 'var(--color-text-secondary)' }}>
        <input type="checkbox" checked={timer} onChange={(e) => setTimer(e.target.checked)} className="mt-1" />
        <span>Pick-Timer – {mode === 'commander' ? '80' : '60'} s für den ersten Pick, danach weniger; läuft er ab, wird automatisch gepickt</span>
      </label>
      <label className="flex items-start gap-2 text-sm cursor-pointer" style={{ color: 'var(--color-text-secondary)' }}>
        <input type="checkbox" checked={isPrivate} onChange={(e) => setIsPrivate(e.target.checked)} className="mt-1" />
        <span>Privat – nicht in der Liste, nur per Link</span>
      </label>
      <button type="submit" className="btn-primary w-full min-h-[44px]" disabled={disabled || !sets || !rounds.every(Boolean)}>Draft öffnen</button>
    </form>
  )
}
