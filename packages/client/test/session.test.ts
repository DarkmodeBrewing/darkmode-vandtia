import { beforeEach, describe, expect, it } from 'vitest';
import { readStoredSession, saveSession, STORAGE_KEY, type PlayerSession } from '../src/session';

function createMockStorage(): Storage {
  const store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { Object.keys(store).forEach((k) => { delete store[k]; }); },
    key: (index: number) => Object.keys(store)[index] ?? null,
    get length() { return Object.keys(store).length; }
  };
}

const validSession: PlayerSession = {
  roomCode: 'ABC123',
  playerId: 'player-1',
  sessionId: 'session-1'
};

describe('readStoredSession', () => {
  let storage: Storage;

  beforeEach(() => {
    storage = createMockStorage();
  });

  it('returns null when no session is stored', () => {
    expect(readStoredSession(storage)).toBeNull();
  });

  it('returns a saved session', () => {
    storage.setItem(STORAGE_KEY, JSON.stringify(validSession));
    expect(readStoredSession(storage)).toEqual(validSession);
  });

  it('returns null and removes the key when the stored value is not valid JSON', () => {
    storage.setItem(STORAGE_KEY, 'not-json{{{');
    expect(readStoredSession(storage)).toBeNull();
    expect(storage.getItem(STORAGE_KEY)).toBeNull();
  });
});

describe('saveSession', () => {
  let storage: Storage;

  beforeEach(() => {
    storage = createMockStorage();
  });

  it('saves a session to storage', () => {
    saveSession(validSession, storage);
    expect(JSON.parse(storage.getItem(STORAGE_KEY)!)).toEqual(validSession);
  });

  it('removes the key when session is null', () => {
    storage.setItem(STORAGE_KEY, JSON.stringify(validSession));
    saveSession(null, storage);
    expect(storage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('overwrites an existing session', () => {
    saveSession(validSession, storage);
    const updated: PlayerSession = { ...validSession, roomCode: 'XYZ789' };
    saveSession(updated, storage);
    expect(JSON.parse(storage.getItem(STORAGE_KEY)!)).toEqual(updated);
  });
});
