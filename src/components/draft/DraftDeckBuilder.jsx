import { useEffect, useMemo, useState } from 'react'
import { MODES, sortPool } from '../../lib/draft/packs'
import { saveDraftDeck } from '../../lib/draftDecks'
import ManaCost from '../ManaCost'

const BASICS = [
  { name: 'Plains', color: 'W', label: 'Ebene' },
  { name: 'Island', color: 'U', label: 'Insel' },
  { name: 'Swamp', color: 'B', label: 'Sumpf' },
  { name: 'Mountain', color: 'R', label: 'Gebirge' },
  { name: 'Forest', color: 'G', label: 'Wald' }
]
// Commander Legends: The Prismatic Piper may always be the commander, drafted or not.
const PIPER = { uid: 'piper', n: 'The Prismatic Piper', ci: '', img: null, t: 'Legendary Creature — Shapeshifter' }

const loadDeck = (key) => { try { return JSON.parse(localStorage.getItem(key) || 'null') } catch { return null } }

// After the draft: a deck from the pool, any number of basic lands, in a commander draft a
// commander (whose colors the deck has to keep to). "Bereit" tells the table; the host sends
// everyone who is ready to the game table.
export default function DraftDeckBuilder({ draftId, me, view, isHost, draft, onHover, settings }) {
  const info = MODES[view.mode]
  const commanderMode = view.mode === 'commander'
  const storeKey = `mtg_draft_deck:${draftId}`
  const [deck, setDeck] = useState(() => loadDeck(storeKey) || { main: [], basics: {}, commander: '' })
  const [ready, setReady] = useState(false)
  const [savedNotice, setSavedNotice] = useState(null)
  useEffect(() => { try { localStorage.setItem(storeKey, JSON.stringify(deck)) } catch {} }, [deck, storeKey])

  const pool = useMemo(() => sortPool(view.pool), [view.pool])
  const legends = pool.filter(card => card.leg)
  const commander = deck.commander === 'piper' ? PIPER : pool.find(card => card.uid === deck.commander) || null
  const main = pool.filter(card => deck.main.includes(card.uid) && card.uid !== deck.commander)
  const rest = pool.filter(card => !deck.main.includes(card.uid) && card.uid !== deck.commander)
  const basicCount = BASICS.reduce((sum, b) => sum + (deck.basics[b.name] || 0), 0)
  const total = main.length + basicCount + (commander ? 1 : 0)
  const identity = commander && commander !== PIPER ? String(commander.ci || '') : null
  const outside = (ci) => identity !== null && [...String(ci || '')].some(color => !identity.includes(color))
  const offColor = main.filter(card => outside(card.ci)).length + BASICS.filter(b => deck.basics[b.name] && outside(b.color)).length
  const enough = total >= info.minDeck && (!commanderMode || commander)

  const toggle = (uid) => setDeck(prev => ({ ...prev, main: prev.main.includes(uid) ? prev.main.filter(id => id !== uid) : [...prev.main, uid] }))
  const setBasic = (name, delta) => setDeck(prev => ({ ...prev, basics: { ...prev.basics, [name]: Math.max(0, (prev.basics[name] || 0) + delta) } }))

  const built = () => {
    const counts = new Map()
    for (const card of main) {
      const entry = counts.get(card.n) || { name: card.n, count: 0, scryfallId: card.id || '' }
      entry.count += 1
      counts.set(card.n, entry)
    }
    for (const b of BASICS) if (deck.basics[b.name]) counts.set(b.name, { name: b.name, count: deck.basics[b.name], scryfallId: '' })
    if (commander) counts.set(commander.n, { name: commander.n, count: 1, scryfallId: commander.id || '' })
    return { label: `Draft · ${me.name}`, commander: commander?.n || '', cards: [...counts.values()] }
  }

  const toggleReady = () => {
    const next = !ready
    setReady(next)
    const deckForTable = built()
    if (next) localStorage.setItem(`mtg_draft_built:${draftId}`, JSON.stringify(deckForTable))
    draft.announce({
      ready: next,
      deck: next ? {
        label: deckForTable.label,
        source: 'draft',
        commander: commander?.n || '',
        commanderImage: commander?.img || null,
        colorIdentity: identity ? [...identity] : [],
        count: total
      } : null
    })
  }

  const saveAsDraft = () => {
    const setNames = settings?.setNames ? [...new Set(settings.setNames)].join(' / ') : ''
    const deckData = built()
    saveDraftDeck({
      name: `${info.label}${setNames ? ` ${setNames}` : ''} – ${new Date().toLocaleDateString('de-DE')}`,
      commander: deckData.commander,
      // The whole pool goes along: deck cards first, the rest after — the editor shows them all.
      cards: [...deckData.cards, ...rest.map(card => ({ name: card.n, count: 1, scryfallId: card.id || '' }))],
      strategyNote: `Gedraftet: ${pool.length} Karten. Im Deck: ${total} (inkl. Standardländer). Nicht im Deck: ${rest.map(card => card.n).join(', ')}`
    })
    setSavedNotice('Als Entwurf gespeichert – unter „Meine Decks → Entwürfe“.')
  }

  const readyPlayers = draft.members.filter(member => member.ready && member.deck)
  const goToTable = () => {
    const seats = readyPlayers
      .map(member => ({ playerId: member.playerId, name: member.name, deck: member.deck, sort: crypto.getRandomValues(new Uint32Array(1))[0] }))
      .sort((a, b) => a.sort - b.sort)
      .map(({ sort, ...seat }) => seat)
    draft.sendToTable({ seats, startedAt: Date.now(), startingLife: info.life })
  }

  const cardTile = (card, inDeck) => (
    <button
      key={card.uid}
      type="button"
      onClick={() => toggle(card.uid)}
      onPointerEnter={(e) => { if (e.pointerType === 'mouse') onHover({ image: card.img, name: card.n }, e) }}
      onPointerMove={(e) => { if (e.pointerType === 'mouse') onHover({ image: card.img, name: card.n }, e) }}
      onPointerLeave={() => onHover(null)}
      title={`${card.n} – ${inDeck ? 'aus dem Deck nehmen' : 'ins Deck'}`}
      className="block"
      style={{ outline: inDeck && outside(card.ci) ? '2px solid var(--r)' : 'none', outlineOffset: 1, borderRadius: 6 }}
    >
      {card.img
        ? <img src={card.img} alt={card.n} loading="lazy" className="w-full block" style={{ borderRadius: 6 }} />
        : <span className="flex items-center justify-center text-center text-[11px] p-1 aspect-[5/7]" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 6 }}>{card.n}</span>}
    </button>
  )

  return (
    <div>
      <div
        className="sticky z-30 flex flex-wrap items-center justify-between gap-3 mb-4 px-4 py-2.5"
        style={{ top: 'var(--nav-h, 0px)', background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)' }}
      >
        <div>
          <div className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{info.label} · Deck bauen</div>
          <div className="font-bold">
            <span className="tabular-nums" style={{ color: total < info.minDeck ? 'var(--gold)' : 'var(--g)' }}>{total}</span>
            <span className="text-fg"> / mind. {info.minDeck} Karten</span>
            {offColor > 0 && <span className="text-sm font-semibold ml-2" style={{ color: 'var(--r)' }}>{offColor} außerhalb der Commander-Farben</span>}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={saveAsDraft} className="btn-secondary text-sm px-4 min-h-[44px]">Als Entwurf speichern</button>
          <button type="button" onClick={toggleReady} disabled={!enough && !ready} className={ready ? 'btn-secondary text-sm px-4 min-h-[44px]' : 'btn-primary text-sm px-5 min-h-[44px]'}>
            {ready ? 'Doch nicht bereit' : enough ? 'Bereit' : commanderMode && !commander ? 'Commander wählen' : `Noch ${info.minDeck - total} Karten`}
          </button>
          {isHost && (
            <button type="button" onClick={goToTable} disabled={readyPlayers.length === 0} className="btn-primary text-sm px-5 min-h-[44px]">
              An den Spieltisch ({readyPlayers.length}/{view.table.length} bereit)
            </button>
          )}
        </div>
      </div>
      {savedNotice && <p className="text-sm mb-3" style={{ color: 'var(--g)' }}>{savedNotice}</p>}

      <div className="flex flex-wrap gap-2 mb-4 text-xs" style={{ color: 'var(--color-text-secondary)' }}>
        {view.table.map(seat => {
          const member = draft.members.find(m => m.playerId === seat.playerId)
          return (
            <span key={seat.playerId} className="px-2 py-1" style={{ border: `1px solid ${member?.ready ? 'var(--g)' : 'var(--color-border)'}`, borderRadius: 'var(--radius-sm)' }}>
              {seat.name}{seat.playerId === me.playerId ? ' (du)' : ''} · {member?.ready ? 'bereit' : member ? 'baut' : 'offline'}
            </span>
          )
        })}
      </div>

      {commanderMode && (
        <section className="card mb-4">
          <h2 className="text-sm font-bold mb-2">Commander</h2>
          <div className="flex flex-wrap items-center gap-3">
            <select
              value={deck.commander}
              onChange={(e) => setDeck(prev => ({ ...prev, commander: e.target.value }))}
              className="text-fg rounded-xl p-2.5 text-sm min-h-[44px]"
              aria-label="Commander wählen"
            >
              <option value="">Commander wählen …</option>
              {legends.map(card => <option key={card.uid} value={card.uid}>{card.n}</option>)}
              <option value="piper">The Prismatic Piper (immer erlaubt)</option>
            </select>
            {identity !== null && <ManaCost cost={[...identity].map(c => `{${c}}`).join('') || '{C}'} size={16} />}
            {commander === PIPER && <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Farbe wählst du am Tisch – keine Farbprüfung.</span>}
          </div>
        </section>
      )}

      <section className="card mb-4">
        <h2 className="text-sm font-bold mb-2">Standardländer <span className="font-normal tabular-nums" style={{ color: 'var(--color-text-muted)' }}>({basicCount})</span></h2>
        <div className="flex flex-wrap gap-3">
          {BASICS.map(b => (
            <div key={b.name} className="flex items-center gap-1.5 text-sm" style={{ color: outside(b.color) && deck.basics[b.name] ? 'var(--r)' : 'var(--color-text)' }}>
              <ManaCost cost={`{${b.color}}`} size={15} />
              <span className="w-16">{b.label}</span>
              <button type="button" onClick={() => setBasic(b.name, -1)} className="btn-secondary text-sm w-9 min-h-[36px] px-0" aria-label={`${b.label} weniger`}>−</button>
              <span className="w-6 text-center tabular-nums">{deck.basics[b.name] || 0}</span>
              <button type="button" onClick={() => setBasic(b.name, 1)} className="btn-secondary text-sm w-9 min-h-[36px] px-0" aria-label={`${b.label} mehr`}>+</button>
            </div>
          ))}
        </div>
      </section>

      <div className="grid lg:grid-cols-2 gap-4 items-start">
        <section className="card">
          <h2 className="text-sm font-bold mb-2">Im Deck <span className="font-normal tabular-nums" style={{ color: 'var(--color-text-muted)' }}>({main.length} + {basicCount} Länder{commander ? ' + Commander' : ''})</span></h2>
          {main.length === 0
            ? <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Klicke rechts auf Karten aus deinem Pool, um sie ins Deck zu legen.</p>
            : <div className="grid gap-1.5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(92px, 1fr))' }}>{main.map(card => cardTile(card, true))}</div>}
        </section>
        <section className="card">
          <h2 className="text-sm font-bold mb-2">Pool <span className="font-normal tabular-nums" style={{ color: 'var(--color-text-muted)' }}>({rest.length})</span></h2>
          {rest.length === 0
            ? <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Alles im Deck.</p>
            : <div className="grid gap-1.5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(92px, 1fr))' }}>{rest.map(card => cardTile(card, false))}</div>}
        </section>
      </div>
    </div>
  )
}
