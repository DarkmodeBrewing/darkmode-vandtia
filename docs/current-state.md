# Current state

## Repository overview

This repository is a small multiplayer Vändtia workspace with one shared rules package, one realtime server package, and one web client package.

## Architecture

### Shared package

`packages/shared` contains the game model and game rules:

- card creation, sorting, and deck helpers
- room, player, game, and view types
- turn and legality checks for card plays
- state transitions for start game, chance draw, pile pickup, and win detection
- player-safe room view generation for the UI

### Server package

`packages/server` hosts the authoritative room state in memory and exposes it through Socket.IO events:

- `room:create`
- `room:join`
- `room:sync`
- `room:toggle-ready`
- `game:start`
- `game:play-card`
- `game:draw-chance`
- `game:pickup-pile`

The server logic lives in `packages/server/src/app.ts` as a `createApp` factory that returns the Express server, Socket.IO instance, and the in-memory rooms map. `index.ts` only reads environment variables and calls `createApp`. This split lets tests spin up isolated server instances without touching the real entry point.

The server also tracks player/socket connections and pushes room updates to each player with hidden information masked where needed.

### Client package

`packages/client` is a React app that:

- stores a local player session in browser storage via `session.ts` (`readStoredSession` / `saveSession`)
- reconnects to a saved room session when possible
- shows lobby seats, readiness, and connection state
- renders the active pile, turn owner, and winner
- enables only legal actions for the current player based on the shared action state

## Gameplay flow implemented today

1. A player creates a room and becomes seat 1.
2. Other players join with a room code until the room is full.
3. Players toggle ready in the lobby.
4. Once at least two players are ready and every joined player is ready, the game starts.
5. The shared engine deals face-down cards, face-up cards, and hand cards, then chooses the starting player by the lowest hand card.
6. Players act in turn, following the current pile constraint and the available source order: hand, then face-up, then face-down.
7. Special handling currently includes two as a reset card, ten as a burn card, chance draw when blocked with cards still in hand, and pile pickup when no legal play remains.
8. The game ends when a player clears hand, face-up, and face-down cards.

## Test coverage

Current automated tests cover:

**Shared engine** (`packages/shared/test`):

- starting-player selection
- reset chains with twos
- pile burn with tens
- drawing back up to three cards
- chance draw followed by pile pickup
- progression from hand to face-up to face-down cards
- winner detection

**Server** (`packages/server/test/server.test.ts`):

- `room:create` — creates a room and returns session data
- `room:join` — joins an existing room and resumes a saved session
- `room:sync` — restores a saved session into a running room
- `room:toggle-ready` — toggles ready state and rejects changes outside the lobby
- `game:start` — starts the game when all players are ready
- `game:play-card` — validates and applies a card play
- `game:draw-chance` — draws a chance card when blocked in hand
- `game:pickup-pile` — picks up the pile when no legal play remains
- disconnect handling — marks the player as disconnected and emits the updated room

**Client session** (`packages/client/test/session.test.ts`):

- `readStoredSession` — returns null when empty, parses a stored session, and clears corrupt data
- `saveSession` — writes, overwrites, and removes a session from storage

## Known gaps

- Room state is in memory only; there is no server-side persistence layer
