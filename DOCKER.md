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

To check the store and the pages against real data, from the repo root:

```bash
npm --prefix gr8r-axi ci
npm run check
```

The first command installs the database library. You only need it once. Each line is `ok` or `FAIL`. A non-zero exit means something broke. Docker does not need to be running.


