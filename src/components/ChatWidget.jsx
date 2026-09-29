import { useState, useRef, useEffect } from 'react'
import { readApiError } from '../lib/apiError'

const HISTORY_LIMIT = 10

export default function ChatWidget({ commander, cards, onAction, contextNote, embedded = false, collectionSampleNames, bulkBuild = false, onReply }) {
  const [open, setOpen] = useState(embedded)
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const scrollRef = useRef(null)

  useEffect(() => {
    if (!open) return
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, loading, open])

  const handleSend = async () => {
    const trimmed = input.trim()
    if (!trimmed || loading) return

    const history = messages.slice(-HISTORY_LIMIT).map(m => ({ role: m.role, text: m.text }))
    setMessages(prev => [...prev, { role: 'user', text: trimmed }])
    setInput('')
    setLoading(true)
    setError(null)

    try {
      const response = await fetch('/.netlify/functions/chat-assistant', {
        method: 'POST',
        body: JSON.stringify({ commander, cards, message: trimmed, history, enableActions: !!onAction, contextNote, collectionSampleNames, bulkBuild })
      })

      if (response.ok) {
        const data = await response.json()
        if (data.actions?.length) {
          const landActions = data.actions.filter(a => a.isLand === true)
          console.log(
            `[ChatWidget] received ${data.actions.length} actions — land actions: ${landActions.length}, land quantity sum: ${landActions.reduce((s, a) => s + (a.quantity || 1), 0)}, total quantity sum: ${data.actions.reduce((s, a) => s + (a.quantity || 1), 0)}`,
            data.actions
          )
        }
        setMessages(prev => [...prev, { role: 'assistant', text: data.reply }])
        if (onAction && data.actions?.length) {
          data.actions.forEach(onAction)
        }
        if (onReply && data.reply) {
          onReply(data.reply)
        }
      } else {
        setError(await readApiError(response))
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-[90] w-14 h-14 rounded-full flex items-center justify-center text-2xl shadow-lg transition hover:-translate-y-1"
        style={{ backgroundColor: 'var(--u)', boxShadow: '0 12px 28px -8px rgba(79,168,245,0.6)' }}
        title="Deck-Assistent öffnen"
      >
        💬
      </button>
    )
  }

  return (
    <div
      className={embedded ? 'flex flex-col rounded-2xl overflow-hidden' : 'fixed bottom-6 right-6 z-[90] flex flex-col rounded-2xl overflow-hidden'}
      style={embedded
        ? {
          width: '100%',
          height: 560,
          backgroundColor: 'var(--surface-solid)',
          border: '1px solid var(--border)'
        }
        : {
          width: 360,
          maxWidth: '90vw',
          height: 500,
          maxHeight: '70vh',
          backgroundColor: 'var(--surface-solid)',
          border: '1px solid var(--border)',
          boxShadow: '0 24px 48px -16px rgba(0,0,0,0.6)'
        }}
    >
      <div
        className="flex items-center justify-between px-4 py-3 flex-shrink-0"
        style={{ borderBottom: '1px solid var(--border)' }}
      >
        <div className="font-bold text-white text-sm">🤖 Deck-Assistent</div>
        {!embedded && (
          <button onClick={() => setOpen(false)} className="text-cmd-muted hover:text-white text-lg leading-none">✕</button>
        )}
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {messages.length === 0 && (
          <p className="text-xs text-cmd-muted leading-relaxed">
            {commander
              ? onAction
                ? `Frag mich zu deinem Deck mit ${commander} — z.B. "Was fehlt noch?" oder sag direkt "Füge Sol Ring hinzu"/"Entferne X" und ich ändere das Deck für dich.`
                : `Frag mich zu deinem Deck mit ${commander} — z.B. "Was fehlt noch?" oder "Womit kann ich Karte X ersetzen?"`
              : 'Frag mich alles rund um Commander-Deckbau — sobald ein Deck offen ist, kenne ich auch den Kontext.'}
          </p>
        )}

        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className="rounded-xl px-3 py-2 text-sm leading-snug max-w-[85%] whitespace-pre-wrap"
              style={m.role === 'user'
                ? { backgroundColor: 'var(--u)', color: '#000' }
                : { backgroundColor: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)' }}
            >
              {m.text}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="rounded-xl px-3 py-2 text-sm text-cmd-muted" style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)' }}>
              {bulkBuild ? '…baut Kartenladung auf, kann etwas dauern' : '…denkt nach'}
            </div>
          </div>
        )}

        {error && (
          <div className="rounded-xl px-3 py-2 text-xs" style={{ backgroundColor: 'rgba(239,106,99,0.1)', border: '1px solid rgba(239,106,99,0.35)', color: 'var(--r)' }}>
            {error}
          </div>
        )}
      </div>

      <div className="flex gap-2 p-3 flex-shrink-0" style={{ borderTop: '1px solid var(--border)' }}>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Frage stellen…"
          disabled={loading}
          className="flex-1 text-white rounded-xl px-3 py-2 text-sm"
          style={{ backgroundColor: 'rgba(255,255,255,0.06)', border: '1px solid var(--border)' }}
        />
        <button
          onClick={handleSend}
          disabled={loading || !input.trim()}
          className="btn-primary px-4 text-sm"
        >
          ➤
        </button>
      </div>
    </div>
  )
}
