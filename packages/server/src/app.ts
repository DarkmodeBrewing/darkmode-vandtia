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
  removePlayerFromRoom,
  resetFinishedGameToLobby,
  normalizeRoomMaxPlayers,
  startGame,
  toRoomView,
  transferHostAfterPermanentLeave,
  type RoomState
} from '@darkmode-vandtia/shared';
import { RoomRegistry } from './room-registry.js';
import { createRoomStore } from './storage.js';

type Ack<T> = (response: { ok: true; data: T } | { ok: false; error: string }) => void;

interface SessionPayload {
  playerName?: string;
  roomCode?: string;
  sessionId?: string;
  maxPlayers?: number;
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
  maxInProgressAgeMs?: number;
}

export function createApp(clientOrigin: string, options: CreateAppOptions = {}): AppInstance {
  const roomStoreOptions = options.maxInProgressAgeMs !== undefined
    ? { maxInProgressAgeMs: options.maxInProgressAgeMs }
    : {};
  const roomRegistry = new RoomRegistry(createRoomStore(options.roomStoragePath, roomStoreOptions));
  const { rooms } = roomRegistry;

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

  function emitRoom(room: RoomState): void {
    for (const player of room.players) {
      const socketId = roomRegistry.getSocketIdForPlayer(player.playerId);
      if (!socketId) {
        continue;
      }

      io.to(socketId).emit('room:update', toRoomView(room, player.playerId));
    }
  }

  function attachPlayer(socketId: string, room: RoomState, playerId: string): RoomState {
    const nextRoom = roomRegistry.markPlayerConnection(room, playerId, true);
    roomRegistry.setPlayerSocket(nextRoom.roomCode, playerId, socketId);
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
      const room = roomRegistry.getRoom(payload.roomCode);
      getPlayerFromRoom(room, payload.playerId);
      const nextRoom = roomRegistry.saveRoom(mutate(room));
      roomRegistry.setPlayerSocket(nextRoom.roomCode, payload.playerId, socketId);
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

        const roomCode = roomRegistry.generateRoomCode();
        const playerId = randomUUID();
        const sessionId = payload.sessionId?.trim() || randomUUID();
        const maxPlayers = normalizeRoomMaxPlayers(payload.maxPlayers);
        const room = createRoomState(roomCode, { maxPlayers });
        const nextRoom = roomRegistry.saveRoom(addPlayerToRoom(room, createEmptyPlayerState(playerId, sessionId, playerName, roomRegistry.getNextSeat(room))));
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

        let room = roomRegistry.getRoom(roomCode);
        const incomingSessionId = payload.sessionId?.trim();
        if (incomingSessionId) {
          const synced = roomRegistry.syncExistingPlayer(room, incomingSessionId);
          if (synced) {
            const existingPlayer = synced.players.find((entry) => entry.sessionId === incomingSessionId)!;
            attachPlayer(socket.id, synced, existingPlayer.playerId);
            ack({ ok: true, data: { roomCode, playerId: existingPlayer.playerId, sessionId: incomingSessionId } });
            return;
          }
        }

        if (room.players.length >= room.maxPlayers) {
          throw new Error('The room is already full.');
        }

        const sessionId = randomUUID();
        const playerId = randomUUID();
        room = roomRegistry.saveRoom(addPlayerToRoom(room, createEmptyPlayerState(playerId, sessionId, playerName, roomRegistry.getNextSeat(room))));
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

        const room = roomRegistry.getRoom(roomCode);
        const syncedRoom = roomRegistry.syncExistingPlayer(room, sessionId);
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

    socket.on('room:leave', (payload: PlayerPayload, ack: Ack<{ roomCode: string; playerId: string }>) => {
      try {
        const room = roomRegistry.getRoom(payload.roomCode);
        getPlayerFromRoom(room, payload.playerId);
        roomRegistry.clearSocket(socket.id);
        if (roomRegistry.isCurrentPlayerSocket(payload.playerId, socket.id)) {
          roomRegistry.clearPlayerSocket(payload.playerId);
        }

        if (room.status === 'lobby') {
          const nextRoom = removePlayerFromRoom(room, payload.playerId);
          if (nextRoom.players.length === 0) {
            roomRegistry.deleteRoom(nextRoom.roomCode);
          } else {
            emitRoom(roomRegistry.saveRoom(nextRoom));
          }
        } else {
          const disconnectedRoom = roomRegistry.markPlayerConnection(room, payload.playerId, false);
          emitRoom(roomRegistry.saveRoom(transferHostAfterPermanentLeave(disconnectedRoom, payload.playerId)));
        }

        ack({ ok: true, data: { roomCode: room.roomCode, playerId: payload.playerId } });
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
        if (room.hostPlayerId !== payload.playerId) {
          throw new Error('Only the room host can start the game.');
        }

        if (!canStartGame(room)) {
          throw new Error('All joined players must be ready before the game can start.');
        }

        return startGame(room);
      });
    });

    socket.on('game:new-round', (payload: PlayerPayload, ack: Ack<{ roomCode: string; playerId: string }>) => {
      handleMutation(socket.id, payload, ack, (room) => {
        if (room.hostPlayerId !== payload.playerId) {
          throw new Error('Only the room host can set up the next round.');
        }

        return resetFinishedGameToLobby(room);
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
      const details = roomRegistry.getSocketDetails(socket.id);
      if (!details) {
        return;
      }

      roomRegistry.clearSocket(socket.id);
      if (!roomRegistry.isCurrentPlayerSocket(details.playerId, socket.id)) {
        return;
      }

      roomRegistry.clearPlayerSocket(details.playerId);

      const room = rooms.get(details.roomCode);
      if (!room) {
        return;
      }

      const updatedRoom = roomRegistry.markPlayerConnection(room, details.playerId, false);
      emitRoom(updatedRoom);
    });
  });

  return { server, io, rooms };
}
