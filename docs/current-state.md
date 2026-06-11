# Current state

## Repository overview

This repository is a small multiplayer Vändtia workspace with one shared rules package, one realtime server package, and one web client package.

The current engine rule reference lives in `docs/rules.md`.

## Architecture

### Shared package

`packages/shared` contains the game model and game rules:

- card creation, sorting, and deck helpers
- player-card source, selection, sorting, and out-state helpers in `player-cards.ts` so the rules engine can focus on room and turn transitions
- room, player, game, and view types
- turn and legality checks for card plays
- state transitions for start game, card plays, chance draw, pile pickup, replay logging, and win detection
- player-safe room view generation for the UI, including host markers

### Server package

`packages/server` hosts the authoritative room state, persists it to disk, and exposes it through Socket.IO events:

- `room:create`
- `room:join`
- `room:sync`
- `room:toggle-ready`
- `room:leave`
- `game:start`
- `game:play-card`
- `game:draw-chance`
- `game:pickup-pile`
- `game:new-round`

The server logic lives in `packages/server/src/app.ts` as a `createApp` factory that returns the Express server, Socket.IO instance, and the room map loaded from persistent storage. `index.ts` only reads environment variables and calls `createApp`. This split lets tests spin up isolated server instances without touching the real entry point. Room persistence, room-code/seat allocation, connection marking, room removal, and socket/player lookup details are contained in `room-registry.ts` so Socket.IO handlers stay focused on event validation and game mutations.

The server stores room snapshots in `packages/server/data/rooms.json` by default, resets persisted players to disconnected on startup, tracks player/socket connections, and pushes room updates to each player with hidden information masked where needed. Players can explicitly leave rooms: lobby players are removed and their seats become available for later joiners, while players who leave after a game starts stay seated and are marked disconnected so the active game state is not corrupted. After a game finishes, the host can reset the same room back to the lobby for another ready-up and deal without sharing a new room code.
Persistence retention now keeps in-progress rooms for recovery, keeps lobby rooms only while at least one player remains connected, and prunes finished rooms plus fully disconnected lobbies.
In-progress rooms can be pruned automatically by age when the `ROOM_MAX_IN_PROGRESS_AGE_HOURS` environment variable is set. See `docs/operator.md` for the full configuration reference.

### Client package

`packages/client` is a React app that:

- follows a mobile-first layout requirement, starting with stacked small-screen flows before expanding to larger breakpoints
- stores a local player session in browser storage via `session.ts` (`readStoredSession` / `saveSession`)
- keeps display copy helpers for room status, replay entries, source names, and pile constraints in `labels.ts` instead of embedding them in the main React component
- reconnects to a saved room session when possible and keeps retrying after socket reconnects
- shows a status panel for offline recovery, lobby readiness blockers, active-turn guidance, and end-of-round outcomes
- renders an end-of-round replay summary after a winner is declared, with a collapsible detail drawer and action-type filter for long rounds
- shows lobby seats, room capacity, host badges, readiness, and connection state
- renders the active pile with inline draw count and minimum-rank constraint
- enables only legal actions for the current player based on the shared action state
- keeps room summary, status, and card actions in bare, mobile-friendly panels with large touch targets

## Gameplay flow implemented today

1. A player creates a room and becomes seat 1.
2. Other players join with a room code until the room is full.
3. The room creator is tracked as the host; players toggle ready in the lobby.
4. Once at least two players have joined and every joined player is ready, only the host can start the game.
5. The shared engine deals face-down cards, face-up cards, and hand cards, then chooses the starting player by the lowest hand card.
6. Players act in turn, following the current pile constraint and the available source order: hand, then face-up, then face-down.
7. Special handling currently includes two as a reset card, ten as a burn card, chance draw when blocked with cards still in hand, pile pickup when no legal play remains, and illegal face-down reveal penalties.
8. Players must exhaust sources in order: hand, then face-up, then face-down; face-down cards are hidden from their owner until selected, then revealed and either played or picked up with the pile if illegal.
9. Each card play, burn, chance draw, pile pickup, and illegal face-down reveal penalty is recorded in the round replay log.
10. The game ends when a player clears hand, face-up, and face-down cards, and the client shows the completed replay sequence behind a collapsible detail panel that can filter by action type.
11. The host can set up the next round from the finished state, returning everyone to the lobby with empty cards and fresh ready checks while keeping the same room code.

## Test coverage

Current automated tests cover:

**Shared engine** (`packages/shared/test`):

- starting-player selection
- reset chains with twos
- pile burn with tens
- drawing back up to three cards
- chance draw followed by pile pickup
- progression from hand to face-up to face-down cards
- legal and illegal blind face-down card reveals
- replay entries for plays, burns, chance draws, pickups, and illegal face-down reveal penalties
- winner detection
- finished-game reset back to the lobby for another round

**Server** (`packages/server/test`):

- `server.test.ts` — covers all Socket.IO events (create, join, sync, leave, toggle-ready, start, new-round, play-card, draw-chance, pickup-pile), lobby leave/reseat behavior, host-only game starts, illegal face-down reveal penalties, disconnect handling, and persisted room reload with session recovery
- `storage.test.ts` — covers age-based retention: recent rooms are kept, rooms past the threshold are pruned on save and on load, and rooms are kept indefinitely when no limit is configured

**Client tests** (`packages/client/test`):

- `session.test.ts` — `readStoredSession` returns null when empty, parses a stored session, and clears corrupt data; `saveSession` writes, overwrites, and removes a session from storage
- `status.test.ts` — covers offline and restoring recovery messaging, host-aware lobby readiness guidance, waiting-turn summaries, source-specific turn guidance, forced chance-draw guidance, and winner summaries
- `app.test.tsx` — renders landing and lobby views in jsdom, verifies mobile-first layout containers (`.app-shell`, `.landing-grid`, `.seat-grid`) are present, checks that action buttons are disabled when inputs are empty, confirms connection state and ready-count pills update correctly after socket events, verifies non-host players see host-only start guidance, verifies hidden face-down card choices emit their preserved card ids, confirms the Leave room button sends `room:leave`, checks completed-round replay drawer/filter behavior, and verifies the host next-round setup action

## Known gaps

- There is no host-transfer behavior yet if the original room creator leaves permanently.
