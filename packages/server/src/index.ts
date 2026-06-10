import { createApp } from './app.js';
import { DEFAULT_ROOM_STORAGE_PATH } from './storage.js';

const PORT = Number(process.env.PORT ?? 3001);
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN ?? 'http://localhost:5173';
const ROOM_STORAGE_PATH = process.env.ROOM_STORAGE_PATH?.trim() || DEFAULT_ROOM_STORAGE_PATH;

const { server } = createApp(CLIENT_ORIGIN, { roomStoragePath: ROOM_STORAGE_PATH });

server.listen(PORT, () => {
  console.log(`darkmode-vandtia server listening on ${PORT}`);
});
