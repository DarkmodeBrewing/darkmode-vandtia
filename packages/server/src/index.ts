import { createApp } from './app.js';

const PORT = Number(process.env.PORT ?? 3001);
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN ?? 'http://localhost:5173';

const { server } = createApp(CLIENT_ORIGIN);

server.listen(PORT, () => {
  console.log(`darkmode-vandtia server listening on ${PORT}`);
});
