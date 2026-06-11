import { useEffect, useMemo, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import type { Card, ReplayEntryType, RoomView, RoundReplayEntry } from '@darkmode-vandtia/shared';
import { getMinimumRankLabel, getReplayEntryText, getRoomStatusLabel } from './labels';
import { readStoredSession, saveSession, type PlayerSession, type SessionState } from './session';
import { getStatusSummary, type SessionRestoreState } from './status';
import './App.css';

type AckResponse<T> = { ok: true; data: T } | { ok: false; error: string };
type ReplayFilter = 'all' | ReplayEntryType;

const replayFilters: { value: ReplayFilter; label: string }[] = [
  { value: 'all', label: 'All actions' },
  { value: 'play', label: 'Played cards' },
  { value: 'burn', label: 'Burns' },
  { value: 'chance_draw', label: 'Chance draws' },
  { value: 'pickup', label: 'Pickups' },
  { value: 'illegal_reveal', label: 'Reveal penalties' }
];

const emptyReplayEntries: RoundReplayEntry[] = [];

const serverUrl = import.meta.env.VITE_SERVER_URL ?? 'http://localhost:3001';

function App() {
  const socket = useMemo<Socket>(() => io(serverUrl, { transports: ['websocket'] }), []);
  const [room, setRoom] = useState<RoomView | null>(null);
  const [session, setSession] = useState<SessionState>(() => readStoredSession());
  const [name, setName] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [maxPlayers, setMaxPlayers] = useState(3);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [needsSync, setNeedsSync] = useState(() => Boolean(readStoredSession()));
  const [sessionRestoreState, setSessionRestoreState] = useState<SessionRestoreState>(() =>
    readStoredSession() ? 'restoring' : 'idle'
  );
  const [isReplayOpen, setIsReplayOpen] = useState(false);
  const [replayFilter, setReplayFilter] = useState<ReplayFilter>('all');
  const sessionRef = useRef<SessionState>(session);

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  useEffect(() => {
    socket.on('connect', () => {
      setConnected(true);
      if (sessionRef.current) {
        setNeedsSync(true);
        setSessionRestoreState('restoring');
      }
    });

    socket.on('disconnect', () => {
      setConnected(false);
      if (sessionRef.current) {
        setNeedsSync(true);
      }
    });

    socket.on('room:update', (nextRoom: RoomView) => {
      setRoom(nextRoom);
      setError(null);
      setSessionRestoreState('restored');
      setNeedsSync(false);
    });

    return () => {
      socket.removeAllListeners();
      socket.close();
    };
  }, [socket]);

  useEffect(() => {
    saveSession(session);
  }, [session]);

  useEffect(() => {
    if (!session || !connected || !needsSync) {
      return;
    }
    socket.emit('room:sync', session, (response: AckResponse<PlayerSession>) => {
      if (!response.ok) {
        setRoom(null);
        setError(response.error);
        setSessionRestoreState('failed');
        return;
      }

      setSession(response.data);
      setNeedsSync(false);
      setSessionRestoreState('restored');
      setError(null);
    });
  }, [connected, needsSync, session, socket]);

  const me = useMemo(() => room?.players.find((player) => player.isMe) ?? null, [room]);
  const actionState = room?.game?.actionState ?? null;
  const isMyTurn = room?.game?.currentTurnPlayerId === room?.mePlayerId;
  const isHost = Boolean(me?.isHost);
  const canStart = room?.status === 'lobby' && isHost && room.players.length >= 2 && room.players.every((player) => player.ready);
  const canSetUpNextRound = room?.status === 'finished' && isHost;
  const controlsDisabled = !connected || sessionRestoreState === 'restoring';
  const readyCount = room?.players.filter((player) => player.ready).length ?? 0;
  const roomStatusLabel = room ? getRoomStatusLabel(room) : null;
  const statusSummary = useMemo(
    () =>
      getStatusSummary({
        connected,
        room,
        sessionRestoreState,
        sessionRoomCode: session?.roomCode ?? null
      }),
    [connected, room, session?.roomCode, sessionRestoreState]
  );
  const replayEntries = room?.game?.replay ?? emptyReplayEntries;
  const filteredReplayEntries = useMemo(
    () => (replayFilter === 'all' ? replayEntries : replayEntries.filter((entry) => entry.type === replayFilter)),
    [replayEntries, replayFilter]
  );

  async function emitAck<TPayload extends object, TResult extends PlayerSession | { roomCode: string; playerId: string }>(
    event: string,
    payload: TPayload
  ): Promise<AckResponse<TResult>> {
    return new Promise((resolve) => {
      socket.emit(event, payload, (response: AckResponse<TResult>) => resolve(response));
    });
  }

  function clearSavedSession() {
    setRoom(null);
    setSession(null);
    setError(null);
    setNeedsSync(false);
    setSessionRestoreState('idle');
  }

  async function leaveRoom() {
    if (!session || !connected) {
      clearSavedSession();
      return;
    }

    setError(null);
    const response = await emitAck('room:leave', {
      roomCode: session.roomCode,
      playerId: session.playerId
    });

    if (!response.ok) {
      setError(response.error);
      return;
    }

    clearSavedSession();
  }

  async function createRoom() {
    setError(null);
    const response = await emitAck<{ playerName: string; sessionId?: string; maxPlayers: number }, PlayerSession>('room:create', {
      playerName: name,
      sessionId: session?.sessionId,
      maxPlayers
    });

    if (!response.ok) {
      setError(response.error);
      return;
    }

    setSession(response.data);
    setRoomCode(response.data.roomCode);
    setNeedsSync(false);
    setSessionRestoreState('restored');
  }

  async function joinRoom() {
    setError(null);
    const response = await emitAck<{ playerName: string; roomCode: string; sessionId?: string }, PlayerSession>('room:join', {
      playerName: name,
      roomCode,
      sessionId: session?.sessionId
    });

    if (!response.ok) {
      setError(response.error);
      return;
    }

    setSession(response.data);
    setRoomCode(response.data.roomCode);
    setNeedsSync(false);
    setSessionRestoreState('restored');
  }

  async function sendPlayerEvent(event: string, extra?: Record<string, string | boolean>) {
    if (!session) {
      return;
    }

    setError(null);
    const response = await emitAck(event, {
      roomCode: session.roomCode,
      playerId: session.playerId,
      ...extra
    });

    if (!response.ok) {
      setError(response.error);
    }
  }

  function renderCard(card: Card, enabled: boolean, onClick: () => void) {
    return (
      <button className={`card ${enabled ? 'card--active' : ''}`} disabled={!enabled} key={card.id} onClick={onClick} type="button">
        {card.label}
      </button>
    );
  }

  function renderCardGroup(title: string, source: 'hand' | 'faceUp' | 'faceDown', cards: Card[]) {
    const enabledSource = isMyTurn && actionState?.availableSource === source;

    return (
      <section className="player-zone">
        <h3>{title}</h3>
        {cards.length > 0 ? (
          <div className="card-grid">
            {cards.map((card) =>
              renderCard(card, enabledSource && actionState.legalCardIds.includes(card.id), () => {
                void sendPlayerEvent('game:play-card', { cardId: card.id });
              })
            )}
          </div>
        ) : null}
      </section>
    );
  }

  return (
    <main className="app-shell">
      <section className="panel panel--header">
        <h1>Vändtia Online</h1>
        <div className={`status-pill ${connected ? 'status-pill--online' : 'status-pill--offline'}`}>
          {connected ? 'Connected' : 'Offline'}
        </div>
      </section>

      <section className={`panel panel--status panel--status-${statusSummary.tone}`}>
        <div className="status-summary">
          <div>
            <h2>Status</h2>
            <p className="status-summary__title">{statusSummary.title}</p>
            <p>{statusSummary.detail}</p>
          </div>
          {!room && session ? (
            <button className="secondary-button" onClick={clearSavedSession} type="button">
              Clear saved session
            </button>
          ) : null}
        </div>
        {statusSummary.bullets.length > 0 ? (
          <ul className="status-list">
            {statusSummary.bullets.map((bullet) => (
              <li key={bullet}>{bullet}</li>
            ))}
          </ul>
        ) : null}
      </section>

      {error ? <section className="panel panel--error">{error}</section> : null}

      {!room ? (
        <section className="landing-grid">
          <div className="panel action-panel">
            <h2>Player setup</h2>
            <label>
              Your name
              <input onChange={(event) => setName(event.target.value)} placeholder="Enter your name" value={name} />
            </label>
          </div>

          <div className="panel action-panel">
            <h2>Create room</h2>
            <label>
              Room capacity
              <select aria-label="Room capacity" onChange={(event) => setMaxPlayers(Number(event.target.value))} value={maxPlayers}>
                <option value={2}>2 players</option>
                <option value={3}>3 players</option>
              </select>
            </label>
            <button disabled={!name.trim() || controlsDisabled} onClick={() => void createRoom()} type="button">
              Create a room
            </button>
          </div>

          <div className="panel action-panel">
            <h2>Join room</h2>
            <label>
              Room code
              <input onChange={(event) => setRoomCode(event.target.value.toUpperCase())} placeholder="ABC123" value={roomCode} />
            </label>
            <button disabled={!name.trim() || !roomCode.trim() || controlsDisabled} onClick={() => void joinRoom()} type="button">
              Join room
            </button>
          </div>
        </section>
      ) : null}

      {room ? (
        <>
          <section className="panel room-panel">
            <h2>Room {room.roomCode}</h2>
            <div className="info-pill-row">
              <span className="info-pill">Phase: {roomStatusLabel}</span>
              <span className="info-pill">Ready: {readyCount}/{room.players.length}</span>
              <span className="info-pill">Seats: {room.players.length}/{room.maxPlayers}</span>
              {me ? <span className="info-pill">Seat {me.seat}{isHost ? ' · Host' : ''}</span> : null}
            </div>
            <button className="secondary-button" onClick={() => void leaveRoom()} type="button">
              Leave room
            </button>
          </section>

          <section className="panel">
            <h2>Seats</h2>
            <div className="seat-grid">
              {room.players.map((player) => (
                <article className={`seat-card ${player.isMe ? 'seat-card--me' : ''}`} key={player.playerId}>
                  <h3>
                    Seat {player.seat}: {player.name}{player.isHost ? ' (host)' : ''}
                  </h3>
                  <p>{player.connected ? 'Connected' : 'Disconnected'}</p>
                  <p>{player.ready ? 'Ready' : 'Not ready'}</p>
                  <p>Hand: {player.handCount} cards</p>
                  <p>Face-up: {player.faceUp.map((card) => card.label).join(', ') || '—'}</p>
                  <p>Face-down: {player.faceDownCount}</p>
                </article>
              ))}
            </div>
          </section>

          {room.status === 'lobby' && me ? (
            <section className="panel action-row">
              <button onClick={() => void sendPlayerEvent('room:toggle-ready', { ready: !me.ready })} type="button">
                {me.ready ? 'Mark not ready' : 'Mark ready'}
              </button>
              {isHost ? (
                <button disabled={!canStart} onClick={() => void sendPlayerEvent('game:start')} type="button">
                  Start game
                </button>
              ) : (
                <span className="host-only-note">Only the host can start the game.</span>
              )}
            </section>
          ) : null}

          {room.status === 'finished' && me ? (
            <section className="panel action-row">
              {isHost ? (
                <button disabled={!canSetUpNextRound} onClick={() => void sendPlayerEvent('game:new-round')} type="button">
                  Set up next round
                </button>
              ) : (
                <span className="host-only-note">Only the host can set up the next round.</span>
              )}
            </section>
          ) : null}

          {room.game ? (
            <>
              <section className="panel pile-panel">
                <div className="section-heading">
                  <h2>Active pile</h2>
                  <span>Draw: {room.game.drawPileCount} · Min: {getMinimumRankLabel(room)}</span>
                </div>
                <div className="card-row">
                  {room.game.activePile.length > 0 ? room.game.activePile.map((card) => <span className="card card--pile" key={card.id}>{card.label}</span>) : <span className="pile-empty">Pile is empty</span>}
                </div>
                {room.game.winnerPlayerId ? (
                  <p className="winner-banner">Winner: {room.players.find((player) => player.playerId === room.game?.winnerPlayerId)?.name}</p>
                ) : null}
              </section>

              {room.status === 'finished' && replayEntries.length > 0 ? (
                <section className="panel replay-panel">
                  <div className="section-heading">
                    <h2>Round replay</h2>
                    <span>{replayEntries.length} actions</span>
                  </div>
                  <div className="replay-toolbar">
                    <button
                      aria-expanded={isReplayOpen}
                      className="secondary-button"
                      onClick={() => setIsReplayOpen((current) => !current)}
                      type="button"
                    >
                      {isReplayOpen ? 'Hide replay details' : 'Show replay details'}
                    </button>
                    <label className="replay-filter">
                      Filter
                      <select
                        aria-label="Replay action filter"
                        onChange={(event) => setReplayFilter(event.target.value as ReplayFilter)}
                        value={replayFilter}
                      >
                        {replayFilters.map((filter) => (
                          <option key={filter.value} value={filter.value}>
                            {filter.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  {isReplayOpen ? (
                    filteredReplayEntries.length > 0 ? (
                      <ol className="replay-list">
                        {filteredReplayEntries.map((entry) => (
                          <li key={entry.id}>
                            <span className="replay-list__sequence">#{entry.sequence}</span>
                            <span>{getReplayEntryText(entry)}</span>
                          </li>
                        ))}
                      </ol>
                    ) : (
                      <p className="replay-summary">No replay actions match this filter.</p>
                    )
                  ) : (
                    <p className="replay-summary">Open replay details to review or filter the completed round sequence.</p>
                  )}
                </section>
              ) : null}

              {me ? (
                <section className="panel">
                  <h2>Your cards</h2>

                  {renderCardGroup('Hand', 'hand', me.hand)}
                  {renderCardGroup('Face-up table cards', 'faceUp', me.faceUp)}
                  {renderCardGroup('Face-down table cards', 'faceDown', me.faceDown)}

                  <div className="action-row">
                    <button disabled={!isMyTurn || !actionState?.canDrawChance} onClick={() => void sendPlayerEvent('game:draw-chance')} type="button">
                      Draw chance card
                    </button>
                    <button disabled={!isMyTurn || !actionState?.canPickupPile} onClick={() => void sendPlayerEvent('game:pickup-pile')} type="button">
                      Pick up pile
                    </button>
                  </div>
                </section>
              ) : null}
            </>
          ) : null}
        </>
      ) : null}
    </main>
  );
}

export default App;
