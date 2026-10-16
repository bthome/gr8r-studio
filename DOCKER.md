# Local preview

This runs the studio and the AXI bridge in one container. The page posts every edit to `POST /sync` on port 8787. AXI writes SQLite and an outbox row in the same step.

```bash
docker compose up --build
```

Open http://localhost:5173. The bridge is on http://localhost:8787/store. Data persists in the `gr8r-data` volume, so a restart keeps what you typed.

To wipe it:

```bash
docker compose down -v
docker compose up --build
```

Node 22 image. `better-sqlite3` builds inside the container, so you do not need a compiler on the host.
