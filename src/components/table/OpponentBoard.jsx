import { useState } from 'react'
import BoardHeader from './BoardHeader'
import ZoneViewer from './ZoneViewer'
import { Battlefield, TableCard } from './TableCard'

function Pile({ label, count, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick || !count}
      className="text-xs px-2 min-h-[32px] tabular-nums"
      style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', color: 'var(--color-text-secondary)', cursor: onClick && count ? 'pointer' : 'default' }}
    >
      {label} <strong style={{ color: 'var(--color-text)' }}>{count}</strong>
    </button>
  )
}

// Another player's side of the table — exactly as they laid it out, scaled to fit.
export default function OpponentBoard({ seat, seats, player, snapshot, isActive, isMonarch, online, dispatch, onDetails, onHover, compact = false }) {
  const [viewing, setViewing] = useState(null) // 'graveyard' | 'exile'
  const board = snapshot || { battlefield: [], graveyard: [], exile: [], command: [], hand: 0, library: 0 }
  return (
    <section
      className="flex flex-col overflow-hidden"
      style={{ background: 'var(--color-surface)', border: `${isActive ? 2 : 1}px solid ${isActive ? 'var(--gold)' : 'var(--color-border)'}`, borderRadius: 'var(--radius-md)' }}
    >
      <BoardHeader seat={seat} seats={seats} player={player} isMonarch={isMonarch} online={online} dispatch={dispatch} onDetails={onDetails} />
      <div className="p-2">
        <Battlefield cards={board.battlefield} onHover={onHover} maxHeight={compact ? '22vh' : '30vh'} emptyText={snapshot ? 'Noch nichts ausgespielt' : 'Board wird geladen …'} />
      </div>
      <div className="flex flex-wrap items-center gap-2 px-2 pb-2">
        {board.command.map(card => <TableCard key={card.iid} card={card} width={30} onHover={onHover} />)}
        <Pile label="Hand" count={board.hand} />
        <Pile label="Bibliothek" count={board.library} />
        <Pile label="Friedhof" count={board.graveyard.length} onClick={() => setViewing('graveyard')} />
        <Pile label="Exil" count={board.exile.length} onClick={() => setViewing('exile')} />
      </div>
      {viewing && (
        <ZoneViewer
          title={`${viewing === 'graveyard' ? 'Friedhof' : 'Exil'} von ${seat.name}`}
          cards={[...board[viewing]].reverse()}
          onClose={() => setViewing(null)}
          onHover={onHover}
        />
      )}
    </section>
  )
}
