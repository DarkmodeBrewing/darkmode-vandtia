# Project plan

## Completed

- Set up a three-package TypeScript workspace for shared game logic, server code, and client code
- Implement shared card, room, turn, and player models for the Vändtia game flow
- Build the core rule engine for starting games, validating plays, drawing chance cards, picking up the pile, and detecting a winner
- Expose authoritative multiplayer room events over Socket.IO for room creation, joining, syncing, readiness, and gameplay actions
- Deliver a React client that supports room setup, lobby management, turn-based play, and session recovery
- Add shared-engine tests for major gameplay transitions and special-card behavior

## Next priorities

1. Fix workspace validation issues so the server package resolves the shared package cleanly during linting and builds.
2. Expand test coverage beyond the shared engine to include server event handling and client interaction flows.
3. Improve player experience with clearer status messages, error recovery, and a stronger lobby/gameplay presentation.
4. Add room persistence or reconnection-friendly state storage so in-memory rooms survive server restarts.
5. Document the exact Vändtia rule interpretation used by the shared engine and align the UI wording with those rules.

## Definition of done for the next pass

- Root workspace validation succeeds with `npm run lint`, `npm run test`, and `npm run build`
- The server and client both cover their main flows with automated tests
- The documentation matches the implemented game behavior and setup steps
