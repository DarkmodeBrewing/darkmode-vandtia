# Operator guide

This document covers runtime configuration, persistent storage, and monitoring expectations for a self-hosted Vändtia server.

## Environment variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3001` | TCP port the HTTP/WebSocket server listens on. |
| `CLIENT_ORIGIN` | `http://localhost:5173` | CORS origin allowed to connect. Set this to the public URL of the web client. |
| `ROOM_STORAGE_PATH` | `packages/server/data/rooms.json` | Absolute or relative path to the JSON file used for room persistence. The directory is created automatically if it does not exist. |
| `ROOM_MAX_IN_PROGRESS_AGE_HOURS` | *(unset — no limit)* | Maximum age in hours for an in-progress room to be retained on disk. Rooms whose `game.startedAt` timestamp is older than this threshold are pruned on every save and on startup load. Lobby rooms and finished rooms are not affected by this setting. |

### Retention examples

```sh
# Keep in-progress rooms for up to 24 hours (recommended for casual play servers)
ROOM_MAX_IN_PROGRESS_AGE_HOURS=24 node dist/index.js

# Keep in-progress rooms for up to 7 days (tournament or slow-play servers)
ROOM_MAX_IN_PROGRESS_AGE_HOURS=168 node dist/index.js

# No age limit — keep all in-progress rooms until the server prunes them for other reasons
node dist/index.js
```

## Persistent storage

Room state is saved to disk as a JSON file after every mutation. The server uses an atomic write (write to a `.tmp` file, then rename) to avoid partial writes on crash.

### What is persisted

| Room status | Persisted? | Notes |
|---|---|---|
| `lobby` | Yes, if at least one player is connected | Pruned automatically when all players disconnect. |
| `in_progress` | Yes | Pruned if `ROOM_MAX_IN_PROGRESS_AGE_HOURS` is set and exceeded. |
| `finished` | No | Finished rooms are never written to disk. |

### What happens on restart

1. The server reads `rooms.json` on startup.
2. All players in every loaded room are reset to `connected: false`. Players must re-sync their session to reconnect.
3. In-progress rooms that exceed the configured age threshold are discarded before any room is made available.
4. Lobby rooms are kept in memory but are only written back to disk if at least one player reconnects.

### Storage file location

The default path is relative to the compiled server output:

```
packages/server/data/rooms.json
```

Override it with `ROOM_STORAGE_PATH` for production deployments where you want the data directory to be separate from the application directory:

```sh
ROOM_STORAGE_PATH=/var/lib/vandtia/rooms.json node dist/index.js
```

## Monitoring

### Health endpoint

The server exposes a simple health endpoint at `GET /health`:

```json
{ "ok": true, "rooms": 3 }
```

The `rooms` field reports the number of rooms currently held in memory (not the number persisted to disk). Use this endpoint for liveness checks and to track active room counts over time.

### Log output

The server writes a single startup line to stdout:

```
darkmode-vandtia server listening on 3001
```

No further structured logging is emitted in the current release. All other output comes from the Node.js process or the hosting environment.

### Disk space

Each persisted room occupies roughly 2–10 KB of JSON depending on game state and player count. A server hosting hundreds of concurrent games will use at most a few megabytes. Monitor the storage file size if you operate a high-traffic instance or disable the age limit.

### Recommended cleanup strategy

For servers open to the public, set `ROOM_MAX_IN_PROGRESS_AGE_HOURS` to a value that fits your expected game duration. A value of `48` (two days) balances recovery convenience against storage growth for typical casual play.
