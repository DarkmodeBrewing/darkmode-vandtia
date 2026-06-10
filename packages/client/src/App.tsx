import { useEffect, useMemo, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import type { Card, RoomView } from '@darkmode-vandtia/shared';
import { readStoredSession, saveSession, type PlayerSession, type SessionState } from './session';
import { getStatusSummary, type SessionRestoreState } from './status';
import './App.css';

type AckResponse<T> = { ok: true; data: T } | { ok: false; error: string };

const serverUrl = import.meta.env.VITE_SERVER_URL ?? 'http://localhost:3001';

function getRoomStatusLabel(room: RoomView): string {
  switch (room.status) {
    case 'lobby':
      return 'Lobby';
    case 'finished':
      return 'Finished';
    default:
      return 'In progress';
  }
}

function App() {
  const socket = useMemo<Socket>(() => io(serverUrl, { transports: ['websocket'] }), []);
  const [room, setRoom] = useState<RoomView | null>(null);
  const [session, setSession] = useState<SessionState>(() => readStoredSession());
  const [name, setName] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [needsSync, setNeedsSync] = useState(() => Boolean(readStoredSession()));
  const [sessionRestoreState, setSessionRestoreState] = useState<SessionRestoreState>(() =>
    readStoredSession() ? 'restoring' : 'idle'
  );
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
  const canStart = room?.status === 'lobby' && room.players.length >= 2 && room.players.every((player) => player.ready);
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

  async function createRoom() {
    setError(null);
    const response = await emitAck<{ playerName: string; sessionId?: string }, PlayerSession>('room:create', {
      playerName: name,
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
        <div className="section-heading">
          <h3>{title}</h3>
          <span>{cards.length} cards</span>
        </div>
        {cards.length > 0 ? (
          <div className="card-grid">
            {cards.map((card) =>
              renderCard(card, enabledSource && actionState.legalCardIds.includes(card.id), () => {
                void sendPlayerEvent('game:play-card', { cardId: card.id });
              })
            )}
          </div>
        ) : (
          <p className="zone-empty">No cards here.</p>
        )}
      </section>
    );
  }

  return (
    <main className="app-shell">
      <section className="panel panel--header">
        <div className="hero-copy">
          <h1>Vändtia Online</h1>
          <p>Mobile-first authoritative multiplayer card rooms for up to four players.</p>
        </div>
        <div className="hero-badges">
          <div className={`status-pill ${connected ? 'status-pill--online' : 'status-pill--offline'}`}>
            {connected ? 'Connected' : 'Offline'}
          </div>
          <span className="info-pill">Mobile-first client</span>
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
          <div className="panel panel--intro">
            <h2>Quick start</h2>
            <ul className="status-list status-list--compact">
              <li>Choose a name before creating or joining.</li>
              <li>Share the room code once the first player creates a table.</li>
              <li>Saved sessions try to restore automatically after reconnects.</li>
            </ul>
          </div>

          <div className="panel action-panel">
            <h2>Player setup</h2>
            <label>
              Your name
              <input onChange={(event) => setName(event.target.value)} placeholder="Enter your name" value={name} />
            </label>
          </div>

          <div className="panel action-panel">
            <h2>Create room</h2>
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
            <div className="room-panel__copy">
              <h2>Room {room.roomCode}</h2>
              <p>{room.status === 'lobby' ? 'Waiting for players to ready up.' : room.status === 'finished' ? 'Game finished.' : 'Game in progress.'}</p>
            </div>
            <div className="info-pill-row">
              <span className="info-pill">Phase: {roomStatusLabel}</span>
              <span className="info-pill">Ready: {readyCount}/{room.players.length}</span>
              {me ? <span className="info-pill">Seat {me.seat}</span> : null}
            </div>
            <button className="secondary-button" onClick={clearSavedSession} type="button">
              Leave saved session
            </button>
          </section>

          <section className="panel">
            <h2>Seats</h2>
            <div className="seat-grid">
              {room.players.map((player) => (
                <article className={`seat-card ${player.isMe ? 'seat-card--me' : ''}`} key={player.playerId}>
                  <h3>
                    Seat {player.seat}: {player.name}
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
              <button disabled={!canStart} onClick={() => void sendPlayerEvent('game:start')} type="button">
                Start game
              </button>
            </section>
          ) : null}

          {room.game ? (
            <>
              <section className="panel game-meta-grid">
                <article className="stat-card">
                  <span className="stat-card__label">Turn</span>
                  <strong>{room.players.find((player) => player.playerId === room.game?.currentTurnPlayerId)?.name ?? '—'}</strong>
                </article>
                <article className="stat-card">
                  <span className="stat-card__label">Draw pile</span>
                  <strong>{room.game.drawPileCount}</strong>
                </article>
                <article className="stat-card">
                  <span className="stat-card__label">Discarded</span>
                  <strong>{room.game.discardedPileCount}</strong>
                </article>
                <article className="stat-card">
                  <span className="stat-card__label">Top constraint</span>
                  <strong>{room.game.actionState?.topConstraintRank ?? room.game.activePile.at(-1)?.label ?? 'Free play'}</strong>
                </article>
              </section>

              <section className="panel pile-panel">
                <h2>Active pile</h2>
                <div className="card-row">
                  {room.game.activePile.length > 0 ? room.game.activePile.map((card) => <span className="card card--pile" key={card.id}>{card.label}</span>) : <span className="pile-empty">Pile is empty</span>}
                </div>
                {room.game.winnerPlayerId ? (
                  <p className="winner-banner">Winner: {room.players.find((player) => player.playerId === room.game?.winnerPlayerId)?.name}</p>
                ) : null}
              </section>

              {me ? (
                <section className="panel">
                  <div className="section-heading">
                    <h2>Your cards</h2>
                    <span>{isMyTurn ? `Play from ${actionState?.availableSource ?? 'hand'}.` : 'Waiting for your turn.'}</span>
                  </div>

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
