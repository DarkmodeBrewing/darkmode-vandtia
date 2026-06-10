# darkmode-vandtia

A multiplayer card game prototype with a TypeScript game engine, Socket.IO server, and React client.

## Workspace layout

- `packages/shared` — shared card models, room state, rule engine, and room views
- `packages/server` — authoritative realtime game server
- `packages/client` — Vite + React web client

## Scripts

Run from the repository root:

- `npm install` — install all workspace dependencies
- `npm run lint` — type-check server/shared and lint the client
- `npm run test` — run the shared game-engine tests
- `npm run build` — build shared, server, and client packages
- `npm run dev:server` — start the server on port `3001`
- `npm run dev:client` — start the client on port `5173`
