import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { RoomState } from '@darkmode-vandtia/shared';

interface PersistedRooms {
  rooms?: RoomState[];
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

      const payload = JSON.parse(readFileSync(storagePath, 'utf8')) as PersistedRooms;
      if (!payload || !Array.isArray(payload.rooms)) {
        throw new Error(`Persisted room store at ${storagePath} is invalid.`);
      }

      return new Map(payload.rooms.map((room) => {
        const normalizedRoom = normalizeRoom(room);
        return [normalizedRoom.roomCode, normalizedRoom] as const;
      }));
    },
    saveRooms(rooms) {
      mkdirSync(dirname(storagePath), { recursive: true });
      const temporaryPath = `${storagePath}.tmp`;
      writeFileSync(temporaryPath, JSON.stringify({ rooms: [...rooms.values()] }, null, 2));
      renameSync(temporaryPath, storagePath);
    }
  };
}
