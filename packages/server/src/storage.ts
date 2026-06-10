import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { RoomState } from '@darkmode-vandtia/shared';

interface PersistedRooms {
  rooms?: RoomState[];
}

function shouldPersistRoom(room: RoomState): boolean {
  if (room.status === 'in_progress') {
    return true;
  }

  if (room.status === 'lobby') {
    return room.players.some((player) => player.connected);
  }

  return false;
}

export interface RoomStore {
  storagePath: string;
  loadRooms(): Map<string, RoomState>;
  saveRooms(rooms: Map<string, RoomState>): void;
}

export const DEFAULT_ROOM_STORAGE_PATH = fileURLToPath(new URL('../data/rooms.json', import.meta.url));

function normalizeRoom(room: RoomState): RoomState {
  const nextRoom = structuredClone(room);
  nextRoom.roomCode = nextRoom.roomCode.toUpperCase();
  nextRoom.players.sort((left, right) => left.seat - right.seat);

  for (const player of nextRoom.players) {
    player.connected = false;
  }

  return nextRoom;
}

export function createRoomStore(storagePath: string = DEFAULT_ROOM_STORAGE_PATH): RoomStore {
  return {
    storagePath,
    loadRooms() {
      if (!existsSync(storagePath)) {
        return new Map<string, RoomState>();
      }

      let payload: PersistedRooms;
      try {
        payload = JSON.parse(readFileSync(storagePath, 'utf8')) as PersistedRooms;
      } catch (error) {
        throw new Error(
          `Persisted room store at ${storagePath} could not be parsed: ${error instanceof Error ? error.message : 'Unknown error.'}`
        );
      }

      if (!payload || !Array.isArray(payload.rooms)) {
        throw new Error(`Persisted room store at ${storagePath} is invalid.`);
      }

      return new Map(
        payload.rooms
          .map((room) => normalizeRoom(room))
          .filter((room) => shouldPersistRoom(room))
          .map((room) => [room.roomCode, room] as const)
      );
    },
    saveRooms(rooms) {
      const roomCodesToDelete = [...rooms.entries()]
        .filter(([, room]) => !shouldPersistRoom(room))
        .map(([roomCode]) => roomCode);
      for (const roomCode of roomCodesToDelete) {
        rooms.delete(roomCode);
      }

      mkdirSync(dirname(storagePath), { recursive: true });
      const temporaryPath = `${storagePath}.tmp`;
      writeFileSync(temporaryPath, JSON.stringify({ rooms: [...rooms.values()] }, null, 2));
      renameSync(temporaryPath, storagePath);
    }
  };
}
