export const STORAGE_KEY = 'darkmode-vandtia-session';

export type PlayerSession = {
  roomCode: string;
  playerId: string;
  sessionId: string;
};

export type SessionState = PlayerSession | null;

export function readStoredSession(storage: Storage = window.localStorage): SessionState {
  const stored = storage.getItem(STORAGE_KEY);
  if (!stored) {
    return null;
  }

  try {
    return JSON.parse(stored) as SessionState;
  } catch {
    storage.removeItem(STORAGE_KEY);
    return null;
  }
}

export function saveSession(session: SessionState, storage: Storage = window.localStorage): void {
  if (!session) {
    storage.removeItem(STORAGE_KEY);
    return;
  }

  storage.setItem(STORAGE_KEY, JSON.stringify(session));
}
