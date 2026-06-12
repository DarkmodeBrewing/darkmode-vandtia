import { createApp } from './app.js';
import { DEFAULT_ROOM_STORAGE_PATH } from './storage.js';

const PORT = Number(process.env.PORT ?? 3001);
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN ?? 'http://localhost:5173';
const ROOM_STORAGE_PATH = process.env.ROOM_STORAGE_PATH?.trim() || DEFAULT_ROOM_STORAGE_PATH;

const rawAgeHours = Number(process.env.ROOM_MAX_IN_PROGRESS_AGE_HOURS);
const MAX_IN_PROGRESS_AGE_MS = Number.isFinite(rawAgeHours) && rawAgeHours > 0
  ? rawAgeHours * 60 * 60 * 1000
  : undefined;
const rawInactiveTurnSeconds = Number(process.env.INACTIVE_TURN_TIMEOUT_SECONDS);
const INACTIVE_TURN_TIMEOUT_MS = Number.isFinite(rawInactiveTurnSeconds) && rawInactiveTurnSeconds > 0
  ? rawInactiveTurnSeconds * 1000
  : 120_000;

// Build options without setting optional values to undefined, which is
// disallowed by exactOptionalPropertyTypes in the tsconfig.
const appOptions = MAX_IN_PROGRESS_AGE_MS !== undefined
  ? { roomStoragePath: ROOM_STORAGE_PATH, maxInProgressAgeMs: MAX_IN_PROGRESS_AGE_MS, inactiveTurnTimeoutMs: INACTIVE_TURN_TIMEOUT_MS }
  : { roomStoragePath: ROOM_STORAGE_PATH, inactiveTurnTimeoutMs: INACTIVE_TURN_TIMEOUT_MS };

const { server } = createApp(CLIENT_ORIGIN, appOptions);

server.listen(PORT, () => {
  console.log(`darkmode-vandtia server listening on ${PORT}`);
});
