# Project plan

## Completed

- Set up a three-package TypeScript workspace for shared game logic, server code, and client code
- Implement shared card, room, turn, and player models for the Vändtia game flow
- Build the core rule engine for starting games, validating plays, drawing chance cards, picking up the pile, and detecting a winner
- Expose authoritative multiplayer room events over Socket.IO for room creation, joining, syncing, readiness, and gameplay actions
- Deliver a React client that supports room setup, lobby management, turn-based play, and session recovery
- Add shared-engine tests for major gameplay transitions and special-card behavior
- Fix workspace validation so `npm run lint`, `npm run test`, and `npm run build` all pass from the repository root
- Extract testable server logic into `packages/server/src/app.ts` and add integration tests covering all Socket.IO events
- Extract session storage helpers into `packages/client/src/session.ts` and add unit tests for read and save behaviour
- Improve the client with reconnect-aware saved-session recovery, clearer status messaging, and a documented status/task update for this pass
- Record the mobile-first client requirement and ship a mobile-first client layout pass for room setup, room status, and in-game card controls
- Persist server room state to disk, reload saved rooms after restart, and add restart recovery coverage for saved sessions
- Document the exact Vändtia rule interpretation used by the shared engine and align the client wording with that rule reference
- Expand client status coverage for reconnect restore messaging, waiting-turn summaries, and source-specific turn guidance
- Add persisted-room retention rules that keep active games recoverable while pruning disconnected lobbies and finished rooms
- Add focused client UI interaction tests for mobile-first layout behavior (landing view, lobby view, status panel, connection state)
- Add configurable age-based cleanup for in-progress rooms via `maxInProgressAgeMs` storage option and `ROOM_MAX_IN_PROGRESS_AGE_HOURS` env var
- Add operator documentation covering retention configuration, storage behavior, health endpoint, and monitoring expectations
- Strip client UI to bare minimum: remove hero subtitle, quick-start panel, touch-friendly pill, game-meta stat cards, card-count badges, zone-empty text, and turn-hint spans; fold draw count and minimum-rank constraint inline into the pile panel
- Add face-down card blind reveal with hidden owner views, preserved selectable card ids, and pickup penalty for illegal reveals
- Add end-of-round replay summary that records plays, burns, chance draws, pickups, and illegal face-down reveal penalties, then renders the completed sequence after a round finishes
- Add configurable room capacity so hosts can set a room to two or three players
- Add host-only lobby controls so only the room creator can start games and future room-level settings have an authority anchor
- Split oversized client/server/shared responsibilities by extracting display-label helpers, room/socket registry helpers, and player-card rule helpers so the main App, server factory, and engine stay focused
- Add a collapsible replay detail panel with action-type filtering so long completed-round summaries stay manageable on small screens
- Add explicit room leave behavior that removes lobby players, frees their seats for new joiners, and marks active-game leavers disconnected
- Add a host-controlled new-round setup flow that resets finished games back to the lobby in the same room
- Add deployment/runtime documentation for hosting the client and Socket.IO server together

## Next priorities

1. Add host-transfer behavior for rooms whose original host leaves permanently.
