import { useEffect, useMemo, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import type { Card, RoomView } from '@darkmode-vandtia/shared';
import './App.css';

type AckResponse<T> = { ok: true; data: T } | { ok: false; error: string };

type PlayerSession = {
  roomCode: string;
  playerId: string;
  sessionId: string;
};

type SessionState = PlayerSession | null;

const STORAGE_KEY = 'darkmode-vandtia-session';
const serverUrl = import.meta.env.VITE_SERVER_URL ?? 'http://localhost:3001';

function readStoredSession(): SessionState {
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (!stored) {
    return null;
  }

  try {
    return JSON.parse(stored) as SessionState;
  } catch {
    window.localStorage.removeItem(STORAGE_KEY);
    return null;
  }
}

function saveSession(session: SessionState): void {
  if (!session) {
    window.localStorage.removeItem(STORAGE_KEY);
    return;
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

function App() {
  const socket = useMemo<Socket>(() => io(serverUrl, { transports: ['websocket'] }), []);
  const [room, setRoom] = useState<RoomView | null>(null);
  const [session, setSession] = useState<SessionState>(() => readStoredSession());
  const [name, setName] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    socket.on('connect', () => {
      setConnected(true);
    });

    socket.on('disconnect', () => {
      setConnected(false);
    });

    socket.on('room:update', (nextRoom: RoomView) => {
      setRoom(nextRoom);
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
    if (!session) {
      return;
    }

    socket.emit('room:sync', session, (response: AckResponse<PlayerSession>) => {
      if (!response.ok) {
        setSession(null);
        setRoom(null);
        setError(response.error);
      }
    });
  }, [session, socket]);

  const me = useMemo(() => room?.players.find((player) => player.isMe) ?? null, [room]);
  const actionState = room?.game?.actionState ?? null;
  const isMyTurn = room?.game?.currentTurnPlayerId === room?.mePlayerId;

  async function emitAck<TPayload extends object, TResult extends PlayerSession | { roomCode: string; playerId: string }>(
    event: string,
    payload: TPayload
  ): Promise<AckResponse<TResult>> {
    return new Promise((resolve) => {
      socket.emit(event, payload, (response: AckResponse<TResult>) => resolve(response));
    });
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

  const canStart = room?.status === 'lobby' && room.players.length >= 2 && room.players.every((player) => player.ready);

  return (
    <main className="app-shell">
      <section className="panel panel--header">
        <div>
          <h1>Vändtia Online</h1>
          <p>Authoritative multiplayer card rooms for up to four players.</p>
        </div>
        <div className={`status-pill ${connected ? 'status-pill--online' : 'status-pill--offline'}`}>
          {connected ? 'Connected' : 'Offline'}
        </div>
      </section>

      {error ? <section className="panel panel--error">{error}</section> : null}

      {!room ? (
        <section className="landing-grid">
          <div className="panel">
            <label>
              Your name
              <input onChange={(event) => setName(event.target.value)} placeholder="Enter your name" value={name} />
            </label>
          </div>

          <div className="panel action-panel">
            <h2>Create room</h2>
            <button disabled={!name.trim()} onClick={() => void createRoom()} type="button">
              Create a room
            </button>
          </div>

          <div className="panel action-panel">
            <h2>Join room</h2>
            <label>
              Room code
              <input onChange={(event) => setRoomCode(event.target.value.toUpperCase())} placeholder="ABC123" value={roomCode} />
            </label>
            <button disabled={!name.trim() || !roomCode.trim()} onClick={() => void joinRoom()} type="button">
              Join room
            </button>
          </div>
        </section>
      ) : null}

      {room ? (
        <>
          <section className="panel room-panel">
            <div>
              <h2>Room {room.roomCode}</h2>
              <p>{room.status === 'lobby' ? 'Waiting for players to ready up.' : room.status === 'finished' ? 'Game finished.' : 'Game in progress.'}</p>
            </div>
            <button
              className="secondary-button"
              onClick={() => {
                setRoom(null);
                setSession(null);
                setError(null);
              }}
              type="button"
            >
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
                <div>
                  <strong>Turn:</strong> {room.players.find((player) => player.playerId === room.game?.currentTurnPlayerId)?.name ?? '—'}
                </div>
                <div>
                  <strong>Draw pile:</strong> {room.game.drawPileCount}
                </div>
                <div>
                  <strong>Discarded:</strong> {room.game.discardedPileCount}
                </div>
                <div>
                  <strong>Top constraint:</strong> {room.game.actionState?.topConstraintRank ?? room.game.activePile.at(-1)?.label ?? 'Free play'}
                </div>
              </section>

              <section className="panel pile-panel">
                <h2>Active pile</h2>
                <div className="card-row">
                  {room.game.activePile.length > 0 ? room.game.activePile.map((card) => <span className="card card--pile" key={card.id}>{card.label}</span>) : <span className="pile-empty">Pile is empty</span>}
                </div>
                {room.game.winnerPlayerId ? (
                  <p className="winner-banner">
                    Winner: {room.players.find((player) => player.playerId === room.game?.winnerPlayerId)?.name}
                  </p>
                ) : null}
              </section>

              {me ? (
                <section className="panel">
                  <h2>Your cards</h2>
                  <p>
                    {isMyTurn
                      ? `Play from ${actionState?.availableSource ?? 'hand'}.`
                      : 'Wait for your turn before playing cards.'}
                  </p>

                  <div className="player-zone">
                    <h3>Hand</h3>
                    <div className="card-row">
                      {me.hand.map((card) =>
                        renderCard(card, isMyTurn && actionState?.availableSource === 'hand' && actionState.legalCardIds.includes(card.id), () => {
                          void sendPlayerEvent('game:play-card', { cardId: card.id });
                        })
                      )}
                    </div>
                  </div>

                  <div className="player-zone">
                    <h3>Face-up table cards</h3>
                    <div className="card-row">
                      {me.faceUp.map((card) =>
                        renderCard(card, isMyTurn && actionState?.availableSource === 'faceUp' && actionState.legalCardIds.includes(card.id), () => {
                          void sendPlayerEvent('game:play-card', { cardId: card.id });
                        })
                      )}
                    </div>
                  </div>

                  <div className="player-zone">
                    <h3>Face-down table cards</h3>
                    <div className="card-row">
                      {me.faceDown.map((card) =>
                        renderCard(card, isMyTurn && actionState?.availableSource === 'faceDown' && actionState.legalCardIds.includes(card.id), () => {
                          void sendPlayerEvent('game:play-card', { cardId: card.id });
                        })
                      )}
                    </div>
                  </div>

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
