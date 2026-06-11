# darkmode-vandtia

A multiplayer Vändtia prototype built as a TypeScript workspace with a shared rules engine, a Socket.IO server, and a React client.

## What is in the repository

- `packages/shared` — card models, room/game state types, gameplay rules, and player-safe room views
- `packages/server` — authoritative multiplayer room server built with Express and Socket.IO
- `packages/client` — Vite + React mobile-first browser client for lobby and gameplay interactions
- `docs/plan.md` — delivery summary and suggested next steps
- `docs/current-state.md` — architecture, gameplay flow, and current implementation notes
- `docs/rules.md` — exact Vändtia rule interpretation used by the current shared engine
- `docs/deployment.md` — production build, routing, and deployment guidance

## Current feature set

- Create or join a host-sized room for two or three players
- Restore a saved player session into an existing room and clear stale local session state when needed
- Persist room state on the server so rooms and saved sessions can survive a server restart
- Apply persisted-room cleanup rules that prune finished rooms and fully disconnected lobbies while keeping in-progress rooms recoverable
- Track seat assignments, ready state, and connection status
- Start a game once all joined players are ready
- Play hand, face-up, and face-down cards using shared Vändtia rules
- Draw a chance card or pick up the pile when blocked
- Reveal the current turn, pile state, winner, context-aware action guidance, and a completed-round replay in the client
- Use a mobile-first client layout that keeps room controls, turn state, and cards usable on small screens before expanding to larger viewports

## Hard requirement

- The client should be built mobile first.

## Getting started

Run from the repository root:

1. `npm install`
2. `npm run dev:server`
3. `npm run dev:client`

The server defaults to `http://localhost:3001` and the client defaults to `http://localhost:5173`.
The development client connects to `VITE_SERVER_URL` when that environment variable is set, otherwise it uses `http://localhost:3001`.
The server persists rooms to `packages/server/data/rooms.json` by default and can override that path with `ROOM_STORAGE_PATH`.
Persistence keeps in-progress games for recovery, keeps lobby rooms only while at least one player is connected, and removes finished rooms.

## Workspace scripts

- `npm run lint` — type-check shared/server and lint the client
- `npm run test` — run the workspace test commands
- `npm run build` — build shared, server, and client packages
- `npm run dev:server` — start the development server
- `npm run dev:client` — start the client

## Documentation

- `docs/plan.md`
- `docs/current-state.md`
- `docs/deployment.md`
