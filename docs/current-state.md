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

The server also tracks player/socket connections and pushes room updates to each player with hidden information masked where needed.

### Client package

`packages/client` is a React app that:

- stores a local player session in browser storage
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

Current automated tests focus on the shared engine and cover:

- starting-player selection
- reset chains with twos
- pile burn with tens
- drawing back up to three cards
- chance draw followed by pile pickup
- progression from hand to face-up to face-down cards
- winner detection

## Known gaps

- Room state is in memory only
- There is no server-side persistence layer
- Server and client packages do not yet have meaningful automated tests
- Root validation currently needs follow-up work in workspace/package resolution before it passes end to end
