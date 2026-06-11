# Deployment guide

This guide describes how to host the production React client and the Socket.IO room server for a single Vändtia deployment.

## Runtime topology

The application has two production artifacts:

- **Client static assets** from `packages/client/dist`, built by Vite.
- **Node.js HTTP/WebSocket server** from `packages/server/dist`, started with `npm run start --workspace @darkmode-vandtia/server`.

The server does not currently serve the client bundle itself. In production, place both artifacts behind the same public site by using a reverse proxy or platform routing:

| Public route | Upstream | Notes |
|---|---|---|
| `/` and static asset paths | `packages/client/dist` | Serve as static files with SPA fallback to `index.html`. |
| `/socket.io/*` | Node server | Required for Socket.IO WebSocket traffic. Preserve HTTP upgrade headers. |
| `/health` | Node server | Liveness endpoint for platform health checks. |

A separate client and API origin is also supported, but the server `CLIENT_ORIGIN` must exactly match the browser origin that loads the client.

## Production build

Run these commands from the repository root:

```sh
npm ci
VITE_SERVER_URL=https://vandtia.example.com npm run build
```

`VITE_SERVER_URL` is baked into the browser bundle at build time. Set it to the public origin that will receive Socket.IO connections. If the client and server share one origin, use that same origin. If they are split, use the server origin.

The build creates:

```text
packages/client/dist/
packages/shared/dist/
packages/server/dist/
```

## Server startup

Start the compiled server from the repository root:

```sh
PORT=3001 \
CLIENT_ORIGIN=https://vandtia.example.com \
ROOM_STORAGE_PATH=/var/lib/vandtia/rooms.json \
ROOM_MAX_IN_PROGRESS_AGE_HOURS=48 \
npm run start --workspace @darkmode-vandtia/server
```

Important runtime settings:

| Variable | Required? | Production guidance |
|---|---:|---|
| `PORT` | No | Defaults to `3001`; set this to the port expected by your host or reverse proxy. |
| `CLIENT_ORIGIN` | Yes | Set to the exact public client origin, including scheme and host, for CORS. |
| `ROOM_STORAGE_PATH` | Recommended | Put this on durable storage outside the release directory. |
| `ROOM_MAX_IN_PROGRESS_AGE_HOURS` | Recommended | Use a finite retention window such as `48` for public casual servers. |

See `docs/operator.md` for full storage and retention semantics.

## Reverse proxy requirements

Socket.IO needs normal HTTP routing plus WebSocket upgrades. A proxy must:

1. Forward `/socket.io/` to the Node server.
2. Preserve `Upgrade` and `Connection` headers for WebSocket transport.
3. Forward `/health` to the Node server if platform health checks use the public proxy.
4. Serve the client with SPA fallback so browser refreshes on deep client routes return `index.html`.

### Example Nginx server block

```nginx
server {
  listen 443 ssl http2;
  server_name vandtia.example.com;

  root /srv/vandtia/client/dist;
  index index.html;

  location /socket.io/ {
    proxy_pass http://127.0.0.1:3001;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }

  location /health {
    proxy_pass http://127.0.0.1:3001;
    proxy_set_header Host $host;
  }

  location / {
    try_files $uri $uri/ /index.html;
  }
}
```

If your hosting platform uses path-based routing instead of Nginx, apply the same split: static files for the client and `/socket.io/` plus `/health` for the server.

## Deployment checklist

Before promoting a release:

1. Run `npm ci` in a clean checkout.
2. Build with the final public `VITE_SERVER_URL`.
3. Run `npm run lint`, `npm run test`, and `npm run build`.
4. Copy `packages/client/dist` to the static host.
5. Copy the repository/server build artifact to the Node host, including `package.json`, lockfile, workspace package metadata, and built `dist` directories.
6. Configure durable `ROOM_STORAGE_PATH` storage and back it up if room recovery matters for your players.
7. Configure `CLIENT_ORIGIN` to the exact client origin.
8. Verify `GET /health` returns `{ "ok": true, "rooms": ... }`.
9. Open the deployed client in a browser, create a room, and confirm the Socket.IO connection reaches the server.

## Common failure modes

| Symptom | Likely cause | Fix |
|---|---|---|
| Client shows disconnected state immediately | `VITE_SERVER_URL` points at the wrong origin, or `/socket.io/` is not routed to Node | Rebuild the client with the correct URL and check proxy routing. |
| Browser CORS error | `CLIENT_ORIGIN` does not match the browser origin | Set `CLIENT_ORIGIN` to the exact public origin and restart the server. |
| Rooms disappear after each deploy | `ROOM_STORAGE_PATH` is inside an ephemeral release directory | Move `ROOM_STORAGE_PATH` to durable storage such as `/var/lib/vandtia/rooms.json`. |
| Health check passes but games do not update | Proxy forwards `/health` but not WebSocket upgrades | Add `/socket.io/` routing and upgrade headers. |
