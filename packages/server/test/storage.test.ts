import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { RoomState } from '@darkmode-vandtia/shared';
import { createRoomStore } from '../src/storage';

/**
 * Builds a minimal in-progress RoomState suitable for testing age-based
 * retention logic. All card arrays are empty; only the timestamps and status
 * matter for the shouldPersistRoom path under test.
 */
function makeInProgressRoom(roomCode: string, startedAt: string): RoomState {
  return {
    roomCode,
    maxPlayers: 3,
    hostPlayerId: 'player-1',
    status: 'in_progress',
    locked: true,
    players: [
      {
        playerId: 'player-1',
        sessionId: 'session-1',
        name: 'Ada',
        seat: 1,
        ready: true,
        connected: false,
        hand: [],
        table: { faceDown: [], faceUp: [] }
      }
    ],
    game: {
      drawPile: [],
      activePile: [],
      discardedPile: [],
      currentTurnPlayerId: 'player-1',
      winnerPlayerId: null,
      turn: { playerId: 'player-1', drewChanceCard: false, availableSource: 'hand' },
      startedAt
    },
    createdAt: startedAt
  };
}

describe('createRoomStore – age-based retention', () => {
  let tempDirectory: string;
  let storagePath: string;

  beforeEach(() => {
    tempDirectory = mkdtempSync(join(tmpdir(), 'darkmode-vandtia-storage-'));
    storagePath = join(tempDirectory, 'rooms.json');
  });

  afterEach(() => {
    rmSync(tempDirectory, { recursive: true, force: true });
  });

  it('keeps a recent in-progress room when maxInProgressAgeMs is set', () => {
    const store = createRoomStore(storagePath, { maxInProgressAgeMs: 60 * 60 * 1000 });
    const startedAt = new Date(Date.now() - 1000).toISOString();
    const rooms = new Map([['ROOM01', makeInProgressRoom('ROOM01', startedAt)]]);

    const saved = store.saveRooms(rooms);
    expect(saved.has('ROOM01')).toBe(true);
  });

  it('prunes an in-progress room that exceeds the age threshold on save', () => {
    const maxAgeMs = 60 * 60 * 1000;
    const store = createRoomStore(storagePath, { maxInProgressAgeMs: maxAgeMs });
    const startedAt = new Date(Date.now() - maxAgeMs - 1000).toISOString();
    const rooms = new Map([['ROOM02', makeInProgressRoom('ROOM02', startedAt)]]);

    const saved = store.saveRooms(rooms);
    expect(saved.has('ROOM02')).toBe(false);
  });

  it('prunes an in-progress room that exceeds the age threshold on load', () => {
    const maxAgeMs = 60 * 60 * 1000;
    const storeNoLimit = createRoomStore(storagePath);
    const startedAt = new Date(Date.now() - maxAgeMs - 5000).toISOString();
    const rooms = new Map([['ROOM03', makeInProgressRoom('ROOM03', startedAt)]]);
    storeNoLimit.saveRooms(rooms);

    const storeWithLimit = createRoomStore(storagePath, { maxInProgressAgeMs: maxAgeMs });
    const loaded = storeWithLimit.loadRooms();
    expect(loaded.has('ROOM03')).toBe(false);
  });

  it('keeps all in-progress rooms when maxInProgressAgeMs is not configured', () => {
    const store = createRoomStore(storagePath);
    const startedAt = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const rooms = new Map([['ROOM04', makeInProgressRoom('ROOM04', startedAt)]]);

    const saved = store.saveRooms(rooms);
    expect(saved.has('ROOM04')).toBe(true);
  });
});
