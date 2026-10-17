# Local preview

This runs the studio and the AXI bridge in one container. The page posts every edit to `POST /sync` on port 8787. AXI writes SQLite and an outbox row in the same step.

```bash
docker compose up --build
```

Open http://localhost:5173. The bridge is on http://localhost:8787/store. Data persists in the `gr8r-data` volume, so a restart keeps what you typed.

## Who can reach the bridge

The bridge listens on 127.0.0.1 by default. In Docker it listens on 0.0.0.0 inside the container, and compose publishes it on 127.0.0.1 only.

- **Origins.** Only the Studio page can call it from a browser: `http://localhost:5173` and `http://127.0.0.1:5173`, plus a page served from the same IP address on port 5173. Other origins get 403. Set `GR8R_ALLOWED_ORIGINS` (comma separated) to replace the default list.
- **Host names.** Requests must address the bridge by `localhost` or an IP address, which blocks DNS rebinding. Add other names with `GR8R_ALLOWED_HOSTS`.
- **Writes.** `POST` needs `Content-Type: application/json` (415 otherwise) and a body of 5 MB or less (413 otherwise).
- **Passphrase (optional).** Set `GR8R_PASSPHRASE` and every request must send it in the `x-gr8r-passphrase` header (401 otherwise). Enter it once in the Studio under Settings > Files. Uncomment the example in `docker-compose.yml` to use it. Leave it unset and nothing changes.
- **Bind address and port.** `gr8r-axi serve --port 8787 --host 127.0.0.1`, or set `GR8R_HOST`.

The page loads the board from `GET /store` before it saves anything. If the bridge is unreachable, edits are not sent and the page says so.

To wipe it:

```bash
docker compose down -v
docker compose up --build
```

To check the store and the pages against real data, from the repo root:

```bash
npm --prefix gr8r-axi ci
npm run check
```

The first command installs the database library. You only need it once. Each line is `ok` or `FAIL`. A non-zero exit means something broke. Docker does not need to be running.
