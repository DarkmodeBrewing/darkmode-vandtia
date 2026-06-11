import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { io as connectSocket, type Socket } from 'socket.io-client';
import { createCard } from '@darkmode-vandtia/shared';
import { createApp, type AppInstance } from '../src/app';

type AckResponse<T> = { ok: true; data: T } | { ok: false; error: string };

type SessionData = { roomCode: string; playerId: string; sessionId: string };
type PlayerData = { roomCode: string; playerId: string };
const DISCONNECT_SETTLE_DELAY_MS = 25;

function getPort(app: AppInstance): number {
  const address = app.server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Server address is not available.');
  }
  return address.port;
}

function connect(port: number): Promise<Socket> {
  return new Promise((resolve) => {
    const socket = connectSocket(`http://localhost:${port}`, { transports: ['websocket'] });
    socket.once('connect', () => resolve(socket));
  });
}

function emit<T>(socket: Socket, event: string, payload: object): Promise<AckResponse<T>> {
  return new Promise((resolve) => {
    socket.emit(event, payload, (response: AckResponse<T>) => resolve(response));
  });
}

function waitForEvent<T>(socket: Socket, event: string): Promise<T> {
  return new Promise((resolve) => {
    socket.once(event, (data: T) => resolve(data));
  });
}

describe('server socket events', () => {
  let app: AppInstance;
  let socketA: Socket;
  let socketB: Socket;
  let tempDirectory: string;
  let roomStoragePath: string;

  beforeEach(async () => {
    tempDirectory = mkdtempSync(join(tmpdir(), 'darkmode-vandtia-server-'));
    roomStoragePath = join(tempDirectory, 'rooms.json');
    app = createApp('http://localhost:5173', { roomStoragePath });
    await new Promise<void>((resolve) => app.server.listen(0, resolve));
    socketA = await connect(getPort(app));
    socketB = await connect(getPort(app));
  });

  afterEach(async () => {
    socketA.disconnect();
    socketB.disconnect();
    await new Promise<void>((resolve) => app.io.close(() => resolve()));
    await new Promise<void>((resolve) => app.server.close(() => resolve()));
    rmSync(tempDirectory, { recursive: true, force: true });
  });

  describe('room:create', () => {
    it('creates a room and returns session data', async () => {
      const response = await emit<SessionData>(socketA, 'room:create', { playerName: 'Ada' });
      expect(response.ok).toBe(true);
      if (!response.ok) return;
      expect(response.data.roomCode).toHaveLength(6);
      expect(response.data.playerId).toBeTruthy();
      expect(response.data.sessionId).toBeTruthy();
      expect(app.rooms.size).toBe(1);
    });


    it('creates rooms with the requested two- or three-player capacity', async () => {
      const response = await emit<SessionData>(socketA, 'room:create', { playerName: 'Ada', maxPlayers: 2 });
      expect(response.ok).toBe(true);
      if (!response.ok) return;
      expect(app.rooms.get(response.data.roomCode)?.maxPlayers).toBe(2);
    });

    it('rejects unsupported room capacities', async () => {
      const response = await emit<SessionData>(socketA, 'room:create', { playerName: 'Ada', maxPlayers: 4 });
      expect(response.ok).toBe(false);
      if (response.ok) return;
      expect(response.error).toMatch(/capacity/i);
    });

    it('returns an error when playerName is missing', async () => {
      const response = await emit<SessionData>(socketA, 'room:create', {});
      expect(response.ok).toBe(false);
      if (response.ok) return;
      expect(response.error).toMatch(/player name/i);
    });

    it('reuses an existing sessionId when provided', async () => {
      const first = await emit<SessionData>(socketA, 'room:create', { playerName: 'Ada', sessionId: 'my-session' });
      expect(first.ok).toBe(true);
      if (!first.ok) return;
      expect(first.data.sessionId).toBe('my-session');
    });

    it('broadcasts a room:update to the creator', async () => {
      const updatePromise = waitForEvent<{ roomCode: string }>(socketA, 'room:update');
      await emit<SessionData>(socketA, 'room:create', { playerName: 'Ada' });
      const update = await updatePromise;
      expect(update.roomCode).toBeTruthy();
    });
  });

  describe('room:join', () => {
    it('joins an existing room', async () => {
      const created = await emit<SessionData>(socketA, 'room:create', { playerName: 'Ada' });
      expect(created.ok).toBe(true);
      if (!created.ok) return;

      const joined = await emit<SessionData>(socketB, 'room:join', {
        playerName: 'Bea',
        roomCode: created.data.roomCode
      });
      expect(joined.ok).toBe(true);
      if (!joined.ok) return;
      expect(joined.data.roomCode).toBe(created.data.roomCode);
    });


    it('prevents joining after the configured room capacity is filled', async () => {
      const created = await emit<SessionData>(socketA, 'room:create', { playerName: 'Ada', maxPlayers: 2 });
      expect(created.ok).toBe(true);
      if (!created.ok) return;

      const joined = await emit<SessionData>(socketB, 'room:join', {
        playerName: 'Bea',
        roomCode: created.data.roomCode
      });
      expect(joined.ok).toBe(true);

      const socketC = await connect(getPort(app));
      try {
        const rejected = await emit<SessionData>(socketC, 'room:join', {
          playerName: 'Cal',
          roomCode: created.data.roomCode
        });
        expect(rejected.ok).toBe(false);
        if (rejected.ok) return;
        expect(rejected.error).toMatch(/full/i);
      } finally {
        socketC.disconnect();
      }
    });

    it('returns an error for an unknown room code', async () => {
      const response = await emit<SessionData>(socketA, 'room:join', {
        playerName: 'Ada',
        roomCode: 'XXXXXX'
      });
      expect(response.ok).toBe(false);
    });

    it('returns an error when playerName is missing', async () => {
      const created = await emit<SessionData>(socketA, 'room:create', { playerName: 'Ada' });
      expect(created.ok).toBe(true);
      if (!created.ok) return;

      const response = await emit<SessionData>(socketB, 'room:join', {
        roomCode: created.data.roomCode
      });
      expect(response.ok).toBe(false);
      if (response.ok) return;
      expect(response.error).toMatch(/room code and player name/i);
    });

    it('restores an existing session when sessionId matches', async () => {
      const created = await emit<SessionData>(socketA, 'room:create', { playerName: 'Ada' });
      expect(created.ok).toBe(true);
      if (!created.ok) return;

      const rejoined = await emit<SessionData>(socketB, 'room:join', {
        playerName: 'Ada',
        roomCode: created.data.roomCode,
        sessionId: created.data.sessionId
      });
      expect(rejoined.ok).toBe(true);
      if (!rejoined.ok) return;
      expect(rejoined.data.playerId).toBe(created.data.playerId);
    });
  });

  describe('room:sync', () => {
    it('restores a saved session', async () => {
      const created = await emit<SessionData>(socketA, 'room:create', { playerName: 'Ada' });
      expect(created.ok).toBe(true);
      if (!created.ok) return;

      const synced = await emit<SessionData>(socketB, 'room:sync', {
        roomCode: created.data.roomCode,
        sessionId: created.data.sessionId
      });
      expect(synced.ok).toBe(true);
      if (!synced.ok) return;
      expect(synced.data.playerId).toBe(created.data.playerId);
    });

    it('returns an error for an unknown session', async () => {
      const created = await emit<SessionData>(socketA, 'room:create', { playerName: 'Ada' });
      expect(created.ok).toBe(true);
      if (!created.ok) return;

      const response = await emit<SessionData>(socketB, 'room:sync', {
        roomCode: created.data.roomCode,
        sessionId: 'unknown-session'
      });
      expect(response.ok).toBe(false);
    });

    it('returns an error when roomCode is missing', async () => {
      const response = await emit<SessionData>(socketA, 'room:sync', { sessionId: 'x' });
      expect(response.ok).toBe(false);
    });
  });

  describe('room:leave', () => {
    it('removes a lobby player and frees their seat for the next joiner', async () => {
      const created = await emit<SessionData>(socketA, 'room:create', { playerName: 'Ada' });
      expect(created.ok).toBe(true);
      if (!created.ok) return;

      const joined = await emit<SessionData>(socketB, 'room:join', {
        playerName: 'Bea',
        roomCode: created.data.roomCode
      });
      expect(joined.ok).toBe(true);
      if (!joined.ok) return;

      const left = await emit<PlayerData>(socketB, 'room:leave', {
        roomCode: created.data.roomCode,
        playerId: joined.data.playerId
      });
      expect(left.ok).toBe(true);
      expect(app.rooms.get(created.data.roomCode)?.players.map((player) => player.name)).toEqual(['Ada']);

      const socketC = await connect(getPort(app));
      try {
        const rejoined = await emit<SessionData>(socketC, 'room:join', {
          playerName: 'Cal',
          roomCode: created.data.roomCode
        });
        expect(rejoined.ok).toBe(true);
        expect(app.rooms.get(created.data.roomCode)?.players.map((player) => `${player.seat}:${player.name}`)).toEqual(['1:Ada', '2:Cal']);
      } finally {
        socketC.disconnect();
      }
    });

    it('removes an empty lobby room after the last player leaves', async () => {
      const created = await emit<SessionData>(socketA, 'room:create', { playerName: 'Ada' });
      expect(created.ok).toBe(true);
      if (!created.ok) return;

      const left = await emit<PlayerData>(socketA, 'room:leave', {
        roomCode: created.data.roomCode,
        playerId: created.data.playerId
      });

      expect(left.ok).toBe(true);
      expect(app.rooms.has(created.data.roomCode)).toBe(false);
    });

    it('marks an in-progress player disconnected instead of removing their cards', async () => {
      const { roomCode, playerAId } = await startTwoPlayerGame();

      const left = await emit<PlayerData>(socketA, 'room:leave', {
        roomCode,
        playerId: playerAId
      });
      expect(left.ok).toBe(true);

      const player = app.rooms.get(roomCode)?.players.find((entry) => entry.playerId === playerAId);
      expect(player?.connected).toBe(false);
      expect(player?.hand.length).toBeGreaterThan(0);
    });
  });

  describe('room:toggle-ready', () => {
    it('toggles a player ready state', async () => {
      const created = await emit<SessionData>(socketA, 'room:create', { playerName: 'Ada' });
      expect(created.ok).toBe(true);
      if (!created.ok) return;

      const updatePromise = waitForEvent<{ players: Array<{ ready: boolean; isMe: boolean }> }>(socketA, 'room:update');
      const toggled = await emit<PlayerData>(socketA, 'room:toggle-ready', {
        roomCode: created.data.roomCode,
        playerId: created.data.playerId
      });
      expect(toggled.ok).toBe(true);

      const update = await updatePromise;
      const me = update.players.find((player) => player.isMe);
      expect(me?.ready).toBe(true);
    });

    it('returns an error for an unknown playerId', async () => {
      const created = await emit<SessionData>(socketA, 'room:create', { playerName: 'Ada' });
      expect(created.ok).toBe(true);
      if (!created.ok) return;

      const response = await emit<PlayerData>(socketA, 'room:toggle-ready', {
        roomCode: created.data.roomCode,
        playerId: 'bad-player-id'
      });
      expect(response.ok).toBe(false);
    });
  });

  describe('game:start', () => {
    it('starts the game when all players are ready', async () => {
      const createdA = await emit<SessionData>(socketA, 'room:create', { playerName: 'Ada' });
      expect(createdA.ok).toBe(true);
      if (!createdA.ok) return;

      const joinedB = await emit<SessionData>(socketB, 'room:join', {
        playerName: 'Bea',
        roomCode: createdA.data.roomCode
      });
      expect(joinedB.ok).toBe(true);
      if (!joinedB.ok) return;

      await emit<PlayerData>(socketA, 'room:toggle-ready', {
        roomCode: createdA.data.roomCode,
        playerId: createdA.data.playerId
      });
      await emit<PlayerData>(socketB, 'room:toggle-ready', {
        roomCode: createdA.data.roomCode,
        playerId: joinedB.data.playerId
      });

      const updatePromise = waitForEvent<{ status: string }>(socketA, 'room:update');
      const started = await emit<PlayerData>(socketA, 'game:start', {
        roomCode: createdA.data.roomCode,
        playerId: createdA.data.playerId
      });
      expect(started.ok).toBe(true);

      const update = await updatePromise;
      expect(update.status).toBe('in_progress');
    });

    it('returns an error when players are not all ready', async () => {
      const createdA = await emit<SessionData>(socketA, 'room:create', { playerName: 'Ada' });
      expect(createdA.ok).toBe(true);
      if (!createdA.ok) return;

      await emit<SessionData>(socketB, 'room:join', {
        playerName: 'Bea',
        roomCode: createdA.data.roomCode
      });

      const response = await emit<PlayerData>(socketA, 'game:start', {
        roomCode: createdA.data.roomCode,
        playerId: createdA.data.playerId
      });
      expect(response.ok).toBe(false);
    });


    it('returns an error when a non-host tries to start the game', async () => {
      const createdA = await emit<SessionData>(socketA, 'room:create', { playerName: 'Ada' });
      expect(createdA.ok).toBe(true);
      if (!createdA.ok) return;

      const joinedB = await emit<SessionData>(socketB, 'room:join', {
        playerName: 'Bea',
        roomCode: createdA.data.roomCode
      });
      expect(joinedB.ok).toBe(true);
      if (!joinedB.ok) return;

      await emit<PlayerData>(socketA, 'room:toggle-ready', {
        roomCode: createdA.data.roomCode,
        playerId: createdA.data.playerId
      });
      await emit<PlayerData>(socketB, 'room:toggle-ready', {
        roomCode: createdA.data.roomCode,
        playerId: joinedB.data.playerId
      });

      const response = await emit<PlayerData>(socketB, 'game:start', {
        roomCode: createdA.data.roomCode,
        playerId: joinedB.data.playerId
      });
      expect(response.ok).toBe(false);
      if (response.ok) return;
      expect(response.error).toMatch(/host/i);
    });
  });

  describe('game:new-round', () => {
    it('returns a finished room to the lobby so players can ready up again', async () => {
      const { roomCode, playerAId } = await startTwoPlayerGame();
      const room = app.rooms.get(roomCode)!;
      room.status = 'finished';
      room.game!.winnerPlayerId = playerAId;
      app.rooms.set(roomCode, room);

      const updatePromise = waitForEvent<{ status: string; game: unknown; players: Array<{ ready: boolean }> }>(socketA, 'room:update');
      const response = await emit<PlayerData>(socketA, 'game:new-round', {
        roomCode,
        playerId: playerAId
      });

      expect(response.ok).toBe(true);
      const update = await updatePromise;
      expect(update.status).toBe('lobby');
      expect(update.game).toBeNull();
      expect(update.players.every((player) => player.ready === false)).toBe(true);
      expect(app.rooms.get(roomCode)?.locked).toBe(false);
    });

    it('returns an error when a non-host tries to set up the next round', async () => {
      const { roomCode, playerBId } = await startTwoPlayerGame();
      const room = app.rooms.get(roomCode)!;
      room.status = 'finished';
      room.game!.winnerPlayerId = playerBId;
      app.rooms.set(roomCode, room);

      const response = await emit<PlayerData>(socketB, 'game:new-round', {
        roomCode,
        playerId: playerBId
      });

      expect(response.ok).toBe(false);
      if (response.ok) return;
      expect(response.error).toMatch(/host/i);
    });
  });

  async function startTwoPlayerGame(): Promise<{ roomCode: string; playerAId: string; playerBId: string }> {
    const createdA = await emit<SessionData>(socketA, 'room:create', { playerName: 'Ada' });
    if (!createdA.ok) throw new Error('Could not create room.');

    const joinedB = await emit<SessionData>(socketB, 'room:join', {
      playerName: 'Bea',
      roomCode: createdA.data.roomCode
    });
    if (!joinedB.ok) throw new Error('Could not join room.');

    await emit<PlayerData>(socketA, 'room:toggle-ready', {
      roomCode: createdA.data.roomCode,
      playerId: createdA.data.playerId
    });
    await emit<PlayerData>(socketB, 'room:toggle-ready', {
      roomCode: createdA.data.roomCode,
      playerId: joinedB.data.playerId
    });

    const started = await emit<PlayerData>(socketA, 'game:start', {
      roomCode: createdA.data.roomCode,
      playerId: createdA.data.playerId
    });
    if (!started.ok) throw new Error('Could not start game.');

    return {
      roomCode: createdA.data.roomCode,
      playerAId: createdA.data.playerId,
      playerBId: joinedB.data.playerId
    };
  }

  describe('game:play-card', () => {
    it('plays a legal card and advances the turn', async () => {
      const { roomCode, playerAId, playerBId } = await startTwoPlayerGame();

      const room = app.rooms.get(roomCode)!;
      const currentPlayerId = room.game!.currentTurnPlayerId;
      const currentSocket = currentPlayerId === playerAId ? socketA : socketB;
      const currentPlayer = room.players.find((p) => p.playerId === currentPlayerId)!;
      const cardId = currentPlayer.hand[0]!.id;

      const response = await emit<PlayerData>(currentSocket, 'game:play-card', {
        roomCode,
        playerId: currentPlayerId,
        cardId
      });
      expect(response.ok).toBe(true);

      const updatedRoom = app.rooms.get(roomCode)!;
      expect(updatedRoom.game?.currentTurnPlayerId).not.toBe(currentPlayerId);
    });

    it('applies the illegal face-down reveal pickup penalty', async () => {
      const { roomCode, playerAId, playerBId } = await startTwoPlayerGame();
      const room = app.rooms.get(roomCode)!;
      const currentPlayerId = room.game!.currentTurnPlayerId;
      const currentSocket = currentPlayerId === playerAId ? socketA : socketB;
      const otherPlayerId = currentPlayerId === playerAId ? playerBId : playerAId;
      const currentPlayer = room.players.find((player) => player.playerId === currentPlayerId)!;
      const otherPlayer = room.players.find((player) => player.playerId === otherPlayerId)!;
      const hiddenCard = { ...createCard(8, 'clubs' as const), id: 'hidden-eight' };
      const pileCard = { ...createCard(9, 'hearts' as const), id: 'pile-nine' };

      currentPlayer.hand = [];
      currentPlayer.table.faceUp = [];
      currentPlayer.table.faceDown = [hiddenCard];
      otherPlayer.hand = [{ ...createCard(14, 'spades' as const), id: 'other-ace' }];
      otherPlayer.table.faceUp = [];
      otherPlayer.table.faceDown = [];
      room.game!.drawPile = [];
      room.game!.activePile = [pileCard];
      room.game!.discardedPile = [];
      room.game!.turn = {
        playerId: currentPlayerId,
        drewChanceCard: false,
        availableSource: 'faceDown'
      };
      app.rooms.set(roomCode, room);

      const response = await emit<PlayerData>(currentSocket, 'game:play-card', {
        roomCode,
        playerId: currentPlayerId,
        cardId: hiddenCard.id
      });
      expect(response.ok).toBe(true);

      const updatedRoom = app.rooms.get(roomCode)!;
      const updatedPlayer = updatedRoom.players.find((player) => player.playerId === currentPlayerId)!;
      expect(updatedPlayer.hand.map((card) => card.rank)).toEqual([8, 9]);
      expect(updatedPlayer.table.faceDown).toHaveLength(0);
      expect(updatedRoom.game?.activePile).toHaveLength(0);
      expect(updatedRoom.game?.currentTurnPlayerId).toBe(otherPlayerId);
    });

    it('returns an error when no cardId is provided', async () => {
      const { roomCode, playerAId } = await startTwoPlayerGame();
      const room = app.rooms.get(roomCode)!;
      const currentPlayerId = room.game!.currentTurnPlayerId;
      const currentSocket = currentPlayerId === playerAId ? socketA : socketB;

      const response = await emit<PlayerData>(currentSocket, 'game:play-card', {
        roomCode,
        playerId: currentPlayerId
      });
      expect(response.ok).toBe(false);
    });
  });

  describe('game:draw-chance', () => {
    it('returns an error when a chance card cannot be drawn', async () => {
      const { roomCode, playerAId } = await startTwoPlayerGame();
      const room = app.rooms.get(roomCode)!;
      const currentPlayerId = room.game!.currentTurnPlayerId;
      const currentSocket = currentPlayerId === playerAId ? socketA : socketB;

      const response = await emit<PlayerData>(currentSocket, 'game:draw-chance', {
        roomCode,
        playerId: currentPlayerId
      });
      expect(response.ok).toBe(false);
    });
  });

  describe('game:pickup-pile', () => {
    it('returns an error when the pile cannot be picked up', async () => {
      const { roomCode, playerAId } = await startTwoPlayerGame();
      const room = app.rooms.get(roomCode)!;
      const currentPlayerId = room.game!.currentTurnPlayerId;
      const currentSocket = currentPlayerId === playerAId ? socketA : socketB;

      const response = await emit<PlayerData>(currentSocket, 'game:pickup-pile', {
        roomCode,
        playerId: currentPlayerId
      });
      expect(response.ok).toBe(false);
    });
  });

  describe('disconnect', () => {
    it('marks a player as disconnected when their socket closes', async () => {
      const created = await emit<SessionData>(socketA, 'room:create', { playerName: 'Ada' });
      expect(created.ok).toBe(true);
      if (!created.ok) return;

      const updatePromise = waitForEvent<{ players: Array<{ connected: boolean; isMe: boolean }> }>(socketB, 'room:update');

      const joinedB = await emit<SessionData>(socketB, 'room:join', {
        playerName: 'Bea',
        roomCode: created.data.roomCode
      });
      expect(joinedB.ok).toBe(true);
      await updatePromise;

      const disconnectUpdate = new Promise<{ players: Array<{ connected: boolean; name: string }> }>((resolve) => {
        socketB.once('room:update', (data) => resolve(data));
      });
      socketA.disconnect();
      const afterDisconnect = await disconnectUpdate;

      const ada = afterDisconnect.players.find((p) => p.name === 'Ada');
      expect(ada?.connected).toBe(false);
    });

    it('keeps a reconnected player marked online when an older socket disconnects', async () => {
      const created = await emit<SessionData>(socketA, 'room:create', { playerName: 'Ada' });
      expect(created.ok).toBe(true);
      if (!created.ok) return;

      const reconnectedSocket = await connect(getPort(app));

      try {
        const synced = await emit<SessionData>(reconnectedSocket, 'room:sync', {
          roomCode: created.data.roomCode,
          sessionId: created.data.sessionId
        });
        expect(synced.ok).toBe(true);

        socketA.disconnect();
        await new Promise((resolve) => setTimeout(resolve, DISCONNECT_SETTLE_DELAY_MS));
        expect(app.rooms.get(created.data.roomCode)?.players.find((player) => player.playerId === created.data.playerId)?.connected).toBe(true);
      } finally {
        reconnectedSocket.disconnect();
      }
    });
  });

  describe('room persistence', () => {
    it('drops disconnected lobby rooms from persisted storage before restart', async () => {
      const created = await emit<SessionData>(socketA, 'room:create', { playerName: 'Ada' });
      expect(created.ok).toBe(true);
      if (!created.ok) return;

      socketA.disconnect();
      await new Promise((resolve) => setTimeout(resolve, DISCONNECT_SETTLE_DELAY_MS));

      await new Promise<void>((resolve) => app.io.close(() => resolve()));
      await new Promise<void>((resolve) => app.server.close(() => resolve()));

      app = createApp('http://localhost:5173', { roomStoragePath });
      await new Promise<void>((resolve) => app.server.listen(0, resolve));
      socketA = await connect(getPort(app));
      socketB = await connect(getPort(app));

      expect(app.rooms.has(created.data.roomCode)).toBe(false);
    });

    it('reloads saved rooms after a server restart and allows session recovery', async () => {
      const created = await emit<SessionData>(socketA, 'room:create', { playerName: 'Ada' });
      expect(created.ok).toBe(true);
      if (!created.ok) return;

      const joined = await emit<SessionData>(socketB, 'room:join', {
        playerName: 'Bea',
        roomCode: created.data.roomCode
      });
      expect(joined.ok).toBe(true);
      if (!joined.ok) return;

      await emit<PlayerData>(socketA, 'room:toggle-ready', {
        roomCode: created.data.roomCode,
        playerId: created.data.playerId
      });
      await emit<PlayerData>(socketB, 'room:toggle-ready', {
        roomCode: created.data.roomCode,
        playerId: joined.data.playerId
      });
      await emit<PlayerData>(socketA, 'game:start', {
        roomCode: created.data.roomCode,
        playerId: created.data.playerId
      });

      socketA.disconnect();
      socketB.disconnect();
      await new Promise<void>((resolve) => app.io.close(() => resolve()));
      await new Promise<void>((resolve) => app.server.close(() => resolve()));

      app = createApp('http://localhost:5173', { roomStoragePath });
      await new Promise<void>((resolve) => app.server.listen(0, resolve));
      socketA = await connect(getPort(app));
      socketB = await connect(getPort(app));

      const restoredRoom = app.rooms.get(created.data.roomCode);
      expect(restoredRoom?.status).toBe('in_progress');
      expect(restoredRoom?.players.every((player) => player.connected === false)).toBe(true);

      const synced = await emit<SessionData>(socketA, 'room:sync', {
        roomCode: created.data.roomCode,
        sessionId: created.data.sessionId
      });
      expect(synced.ok).toBe(true);
      if (!synced.ok) return;

      expect(synced.data.playerId).toBe(created.data.playerId);
      expect(app.rooms.get(created.data.roomCode)?.players.find((player) => player.playerId === created.data.playerId)?.connected).toBe(true);
    });
  });
});
