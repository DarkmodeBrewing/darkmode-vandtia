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

## Next priorities

1. Improve player experience with clearer status messages, error recovery, and a stronger lobby/gameplay presentation.
2. Add room persistence or reconnection-friendly state storage so in-memory rooms survive server restarts.
3. Document the exact Vändtia rule interpretation used by the shared engine and align the UI wording with those rules.

## Definition of done for the next pass

- Room state survives a server restart or is recoverable from a persistent store
- Player-facing error messages and status cues are consistent across lobby and gameplay screens
- The rule documentation covers every special-card case handled by the shared engine
