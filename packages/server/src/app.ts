import cors from 'cors';
import express from 'express';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { Server } from 'socket.io';
import {
  addPlayerToRoom,
  canStartGame,
  createEmptyPlayerState,
  createRoomState,
  drawChanceCard,
  pickupPile,
  playCard,
  startGame,
  toRoomView,
  type RoomState
} from '@darkmode-vandtia/shared';
import { createRoomStore } from './storage.js';

type Ack<T> = (response: { ok: true; data: T } | { ok: false; error: string }) => void;

interface SessionPayload {
  playerName?: string;
  roomCode?: string;
  sessionId?: string;
}

interface PlayerPayload {
  roomCode: string;
  playerId: string;
  ready?: boolean;
  cardId?: string;
}

export interface AppInstance {
  server: ReturnType<typeof createServer>;
  io: Server;
  rooms: Map<string, RoomState>;
}

export interface CreateAppOptions {
  roomStoragePath?: string;
}

export function createApp(clientOrigin: string, options: CreateAppOptions = {}): AppInstance {
  const roomStore = createRoomStore(options.roomStoragePath);
  const rooms = roomStore.loadRooms();
  const playerSockets = new Map<string, string>();
  const socketPlayers = new Map<string, { roomCode: string; playerId: string }>();

  const app = express();
  app.use(cors({ origin: clientOrigin }));
  app.get('/health', (_request, response) => {
    response.json({ ok: true, rooms: rooms.size });
  });

  const server = createServer(app);
  const io = new Server(server, {
    cors: {
      origin: clientOrigin,
      credentials: true
    }
  });

  function getRoom(roomCode: string): RoomState {
    const room = rooms.get(roomCode.toUpperCase());

    if (!room) {
      throw new Error('Room not found.');
    }

    return room;
  }

  function generateRoomCode(): string {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    while (true) {
      const roomCode = Array.from({ length: 6 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join('');
      if (!rooms.has(roomCode)) {
        return roomCode;
      }
    }
  }

  function getNextSeat(room: RoomState): number {
    for (let seat = 1; seat <= room.maxPlayers; seat += 1) {
      if (!room.players.some((player) => player.seat === seat)) {
        return seat;
      }
    }

    throw new Error('No seats are available in this room.');
  }

  function setRoom(room: RoomState): RoomState {
    rooms.set(room.roomCode, room);
    const persistedRooms = roomStore.saveRooms(rooms);
    rooms.clear();
    for (const [roomCode, persistedRoom] of persistedRooms.entries()) {
      rooms.set(roomCode, persistedRoom);
    }
    return rooms.get(room.roomCode) ?? room;
  }

  function setPlayerSocket(roomCode: string, playerId: string, socketId: string): void {
    const previousSocketId = playerSockets.get(playerId);
    if (previousSocketId && previousSocketId !== socketId) {
      socketPlayers.delete(previousSocketId);
    }

    playerSockets.set(playerId, socketId);
    socketPlayers.set(socketId, { roomCode, playerId });
  }

  function markPlayerConnection(room: RoomState, playerId: string, connected: boolean): RoomState {
    const nextRoom = structuredClone(room);
    const player = nextRoom.players.find((entry) => entry.playerId === playerId);

    if (player) {
      player.connected = connected;
    }

    return setRoom(nextRoom);
  }

  function syncExistingPlayer(room: RoomState, sessionId: string): RoomState | null {
    const player = room.players.find((entry) => entry.sessionId === sessionId);
    if (!player) {
      return null;
    }

    return markPlayerConnection(room, player.playerId, true);
  }

  function emitRoom(room: RoomState): void {
    for (const player of room.players) {
      const socketId = playerSockets.get(player.playerId);
      if (!socketId) {
        continue;
      }

      io.to(socketId).emit('room:update', toRoomView(room, player.playerId));
    }
  }

  function attachPlayer(socketId: string, room: RoomState, playerId: string): RoomState {
    const nextRoom = markPlayerConnection(room, playerId, true);
    setPlayerSocket(nextRoom.roomCode, playerId, socketId);
    emitRoom(nextRoom);
    return nextRoom;
  }

  function getPlayerFromRoom(room: RoomState, playerId: string) {
    const player = room.players.find((entry) => entry.playerId === playerId);
    if (!player) {
      throw new Error('Player not found in room.');
    }
    return player;
  }

  function handleMutation<T extends PlayerPayload>(socketId: string, payload: T, ack: Ack<{ roomCode: string; playerId: string }>, mutate: (room: RoomState) => RoomState): void {
    try {
      const room = getRoom(payload.roomCode);
      getPlayerFromRoom(room, payload.playerId);
      const nextRoom = setRoom(mutate(room));
      setPlayerSocket(nextRoom.roomCode, payload.playerId, socketId);
      emitRoom(nextRoom);
      ack({ ok: true, data: { roomCode: nextRoom.roomCode, playerId: payload.playerId } });
    } catch (error) {
      ack({ ok: false, error: error instanceof Error ? error.message : 'Unexpected server error.' });
    }
  }

  io.on('connection', (socket) => {
    socket.on('room:create', (payload: SessionPayload, ack: Ack<{ roomCode: string; playerId: string; sessionId: string }>) => {
      try {
        const playerName = payload.playerName?.trim();
        if (!playerName) {
          throw new Error('A player name is required.');
        }

        const roomCode = generateRoomCode();
        const playerId = randomUUID();
        const sessionId = payload.sessionId?.trim() || randomUUID();
        const room = createRoomState(roomCode);
        const nextRoom = setRoom(addPlayerToRoom(room, createEmptyPlayerState(playerId, sessionId, playerName, getNextSeat(room))));
        attachPlayer(socket.id, nextRoom, playerId);
        ack({ ok: true, data: { roomCode, playerId, sessionId } });
      } catch (error) {
        ack({ ok: false, error: error instanceof Error ? error.message : 'Unexpected server error.' });
      }
    });

    socket.on('room:join', (payload: SessionPayload, ack: Ack<{ roomCode: string; playerId: string; sessionId: string }>) => {
      try {
        const roomCode = payload.roomCode?.trim().toUpperCase();
        const playerName = payload.playerName?.trim();

        if (!roomCode || !playerName) {
          throw new Error('A room code and player name are required.');
        }

        let room = getRoom(roomCode);
        const incomingSessionId = payload.sessionId?.trim();
        if (incomingSessionId) {
          const synced = syncExistingPlayer(room, incomingSessionId);
          if (synced) {
            const existingPlayer = synced.players.find((entry) => entry.sessionId === incomingSessionId)!;
            attachPlayer(socket.id, synced, existingPlayer.playerId);
            ack({ ok: true, data: { roomCode, playerId: existingPlayer.playerId, sessionId: incomingSessionId } });
            return;
          }
        }

        const sessionId = randomUUID();
        const playerId = randomUUID();
        room = setRoom(addPlayerToRoom(room, createEmptyPlayerState(playerId, sessionId, playerName, getNextSeat(room))));
        attachPlayer(socket.id, room, playerId);
        ack({ ok: true, data: { roomCode, playerId, sessionId } });
      } catch (error) {
        ack({ ok: false, error: error instanceof Error ? error.message : 'Unexpected server error.' });
      }
    });

    socket.on('room:sync', (payload: SessionPayload, ack: Ack<{ roomCode: string; playerId: string; sessionId: string }>) => {
      try {
        const roomCode = payload.roomCode?.trim().toUpperCase();
        const sessionId = payload.sessionId?.trim();

        if (!roomCode || !sessionId) {
          throw new Error('A room code and session id are required.');
        }

        const room = getRoom(roomCode);
        const syncedRoom = syncExistingPlayer(room, sessionId);
        if (!syncedRoom) {
          throw new Error('Saved session could not be restored.');
        }

        const player = syncedRoom.players.find((entry) => entry.sessionId === sessionId)!;
        attachPlayer(socket.id, syncedRoom, player.playerId);
        ack({ ok: true, data: { roomCode, playerId: player.playerId, sessionId } });
      } catch (error) {
        ack({ ok: false, error: error instanceof Error ? error.message : 'Unexpected server error.' });
      }
    });

    socket.on('room:toggle-ready', (payload: PlayerPayload, ack: Ack<{ roomCode: string; playerId: string }>) => {
      handleMutation(socket.id, payload, ack, (room) => {
        if (room.status !== 'lobby') {
          throw new Error('Ready state can only be changed in the lobby.');
        }

        const nextRoom = structuredClone(room);
        const player = nextRoom.players.find((entry) => entry.playerId === payload.playerId)!;
        player.ready = payload.ready ?? !player.ready;
        return nextRoom;
      });
    });

    socket.on('game:start', (payload: PlayerPayload, ack: Ack<{ roomCode: string; playerId: string }>) => {
      handleMutation(socket.id, payload, ack, (room) => {
        if (!canStartGame(room)) {
          throw new Error('All joined players must be ready before the game can start.');
        }

        return startGame(room);
      });
    });

    socket.on('game:play-card', (payload: PlayerPayload, ack: Ack<{ roomCode: string; playerId: string }>) => {
      handleMutation(socket.id, payload, ack, (room) => {
        if (!payload.cardId) {
          throw new Error('A card id is required.');
        }

        return playCard(room, payload.playerId, payload.cardId);
      });
    });

    socket.on('game:draw-chance', (payload: PlayerPayload, ack: Ack<{ roomCode: string; playerId: string }>) => {
      handleMutation(socket.id, payload, ack, (room) => drawChanceCard(room, payload.playerId));
    });

    socket.on('game:pickup-pile', (payload: PlayerPayload, ack: Ack<{ roomCode: string; playerId: string }>) => {
      handleMutation(socket.id, payload, ack, (room) => pickupPile(room, payload.playerId));
    });

    socket.on('disconnect', () => {
      const details = socketPlayers.get(socket.id);
      if (!details) {
        return;
      }

      socketPlayers.delete(socket.id);
      const currentSocketId = playerSockets.get(details.playerId);
      if (currentSocketId && currentSocketId !== socket.id) {
        return;
      }

      playerSockets.delete(details.playerId);

      const room = rooms.get(details.roomCode);
      if (!room) {
        return;
      }

      const updatedRoom = markPlayerConnection(room, details.playerId, false);
      emitRoom(updatedRoom);
    });
  });

  return { server, io, rooms };
}
