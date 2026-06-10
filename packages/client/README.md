# Client package

This package contains the Vite + React client for the multiplayer Vändtia prototype.

## Responsibilities

- create and join rooms against the Socket.IO server
- restore saved sessions after reconnects
- render lobby state, game state, and actionable turn guidance
- keep the UI mobile first, then scale up for larger screens

## Development

Run these commands from the repository root:

- `npm run dev:client`
- `npm run lint`
- `npm run test`
- `npm run build`

The client expects the server to be available at `http://localhost:3001` unless `VITE_SERVER_URL` is set.
