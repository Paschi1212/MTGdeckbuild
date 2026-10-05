import { useCallback, useEffect, useRef, useState } from 'react'
import { joinChannel } from './realtime'

// Lobbies live only as long as someone is in them: everything is presence on live channels.
//   "lobbies"        – every open, non-private lobby, announced by its host
//   "lobby:<id>"     – who is in the lobby, with deck and "ready"; the host announces settings
// A lobby whose host leaves simply disappears — nothing to clean up.

export const MAX_PLAYERS_CHOICES = [2, 3, 4, 5, 6]

const HOST_PREFIX = 'mtg_table_host:'

// The creator's settings for a lobby, kept in this browser so a reload stays the host.
export function rememberHosting(lobbyId, settings) {
  try { localStorage.setItem(HOST_PREFIX + lobbyId, JSON.stringify(settings)) } catch {}
}

export function hostingSettings(lobbyId) {
  try { return JSON.parse(localStorage.getItem(HOST_PREFIX + lobbyId) || 'null') } catch { return null }
}

export function forgetHosting(lobbyId) {
  try { localStorage.removeItem(HOST_PREFIX + lobbyId) } catch {}
}

/** All open lobbies, live. */
export function useOpenLobbies(me) {
  const [lobbies, setLobbies] = useState([])
  const [status, setStatus] = useState('connecting')
  useEffect(() => {
    const channel = joinChannel('lobbies', {
      playerId: me.playerId,
      onStatus: setStatus,
      onPresence: (entries) => setLobbies(entries
        .map(entry => entry.lobby)
        .filter(lobby => lobby && lobby.phase === 'open')
        .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0)))
    })
    return () => channel.leave()
  }, [me.playerId])
  return { lobbies, status }
}

/**
 * Being in a lobby. `hosting`: this browser's host settings ({ name, maxPlayers, private,
 * createdAt }) or null for a guest. `onStart(payload)` fires for everyone when the host starts.
 */
export function useLobby(lobbyId, me, { hosting, onStart }) {
  const [members, setMembers] = useState([])
  const [status, setStatus] = useState('connecting')
  const [mine, setMine] = useState({ deck: null, ready: false })
  const lobbyChannel = useRef(null)
  const listChannel = useRef(null)
  const onStartRef = useRef(onStart)
  onStartRef.current = onStart
  const joinedAt = useRef(Date.now())

  const presenceFor = useCallback((state) => ({
    playerId: me.playerId,
    name: me.name,
    joinedAt: joinedAt.current,
    deck: state.deck,
    ready: Boolean(state.ready && state.deck),
    ...(hosting ? { isHost: true, lobby: { id: lobbyId, ...hosting, hostId: me.playerId, hostName: me.name } } : {})
  }), [me.playerId, me.name, hosting, lobbyId])

  useEffect(() => {
    const channel = joinChannel(`lobby:${lobbyId}`, {
      playerId: me.playerId,
      presence: presenceFor({ deck: null, ready: false }),
      onPresence: (entries) => setMembers(entries.sort((a, b) => (a.joinedAt || 0) - (b.joinedAt || 0))),
      onStatus: setStatus,
      onBroadcast: { start: (payload) => onStartRef.current?.(payload) }
    })
    lobbyChannel.current = channel
    // The host also announces the lobby in the public list (unless it is private).
    if (hosting && !hosting.private) {
      listChannel.current = joinChannel('lobbies', { playerId: me.playerId })
    }
    return () => {
      channel.leave()
      listChannel.current?.leave()
      listChannel.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lobbyId, me.playerId, Boolean(hosting)])

  // Keep the public list entry current: players, commanders, free seats.
  useEffect(() => {
    if (!hosting || hosting.private || !listChannel.current) return
    listChannel.current.track({
      lobby: {
        id: lobbyId,
        name: hosting.name,
        hostName: me.name,
        maxPlayers: hosting.maxPlayers,
        createdAt: hosting.createdAt,
        phase: 'open',
        players: members.map(member => ({ name: member.name, commander: member.deck?.commander || null }))
      }
    })
  }, [hosting, lobbyId, me.name, members])

  const update = useCallback((patch) => {
    setMine(prev => {
      const next = { ...prev, ...patch }
      lobbyChannel.current?.track(presenceFor(next))
      return next
    })
  }, [presenceFor])

  /** Host only: starts the game for every ready player, in a random seating order. */
  const start = useCallback(() => {
    // First come, first seated, up to the lobby's size.
    const ready = members.filter(member => member.ready && member.deck).slice(0, hosting?.maxPlayers || 6)
    const seats = ready
      .map(member => ({ playerId: member.playerId, name: member.name, deck: member.deck, sort: crypto.getRandomValues(new Uint32Array(1))[0] }))
      .sort((a, b) => a.sort - b.sort)
      .map(({ sort, ...seat }) => seat)
    const payload = { seats, startedAt: Date.now() }
    lobbyChannel.current?.send('start', payload)
    listChannel.current?.track(null)
    onStartRef.current?.(payload)
  }, [members, hosting])

  const host = members.find(member => member.isHost) || null
  return { members, status, mine, update, start, host, lobby: host?.lobby || null }
}
