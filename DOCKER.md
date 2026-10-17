# Local preview

This runs the studio and the AXI bridge in one container. The page posts every edit to `POST /sync` on port 8787. AXI writes SQLite and an outbox row in the same step.

```bash
docker compose up --build
```

Open http://localhost:5173. The bridge is on http://localhost:8787/store. Data persists in the `fleet-data` volume, so a restart keeps what you typed. The compose file names it `fleet-data` (and the project `fleet-studio`), so `docker volume ls` shows `fleet-data`.

## Who can reach the bridge

The bridge listens on 127.0.0.1 by default. In Docker it listens on 0.0.0.0 inside the container, and compose publishes it on 127.0.0.1 only.

- **Origins.** Only the Studio page can call it from a browser: `http://localhost:5173` and `http://127.0.0.1:5173`, plus a page served from the same IP address on port 5173. Other origins get 403. Set `FLEET_ALLOWED_ORIGINS` (comma separated) to replace the default list.
- **Host names.** Requests must address the bridge by `localhost` or an IP address, which blocks DNS rebinding. Add other names with `FLEET_ALLOWED_HOSTS`.
- **Writes.** `POST` needs `Content-Type: application/json` (415 otherwise) and a body of 5 MB or less (413 otherwise).
- **Passphrase (optional).** Set `FLEET_PASSPHRASE` and every request must send it in the `x-fleet-passphrase` header (401 otherwise). Enter it once in the Studio under Settings > Files. Uncomment the example in `docker-compose.yml` to use it. Leave it unset and nothing changes.
- **Bind address and port.** `fleet-axi serve --port 8787 --host 127.0.0.1`, or set `FLEET_HOST`.

The page loads the board from `GET /store` before it saves anything. If the bridge is unreachable, edits are not sent and the page says so.

## Health

`GET /health` answers `{"ok":true,"db":"ok","uptimeSec":…,"version":"…"}` with 200 when the database answers, and 503 with `ok:false` when it does not (for example the database file was deleted or swapped). It returns no board data and does not need the passphrase. The Host and origin checks still apply. The image has a `HEALTHCHECK` that calls it every 30 seconds, so `docker ps` shows `healthy` or `unhealthy`. Docker only reports the state; `restart: unless-stopped` does not restart an unhealthy container. If the bridge or the Studio process exits, the container exits too, and the restart policy brings it back.

## Backups and exports

Everything stays in the `fleet-data` volume, next to the database:

- `/data/backups/` holds SQLite backups named `fleet-<UTC time>[-auto|-pre-restore].db`. The newest 14 are kept.
- `/data/exports/` holds JSON exports named `fleet-export-<UTC time>.json.gz`. They are not pruned.

The bridge makes an automatic backup when it starts and checks every hour; it backs up only if the newest backup is a day old or more, so restarts do not push older backups out. A failed backup is logged and the bridge keeps running.

```bash
docker compose exec studio node fleet-axi/bin/fleet-axi.js backup           # prints the new file's path last
docker compose exec studio node fleet-axi/bin/fleet-axi.js backup --list    # newest first: time, bytes, path (--json for JSON)
docker compose exec studio node fleet-axi/bin/fleet-axi.js export           # every table, every row, gzip JSON; prints the path
```

To copy the latest backup or export out of the container:

```bash
latest=$(docker compose exec -T studio node fleet-axi/bin/fleet-axi.js backup --list | head -n 1 | awk '{print $3}')
docker compose cp "studio:$latest" ./
docker compose cp studio:/data/exports ./fleet-exports
```

To restore, stop the bridge first. In Docker the bridge is the container, so stop it and run the restore in a one-off container on the same volume:

```bash
docker compose stop studio
docker compose run --rm --no-deps studio node fleet-axi/bin/fleet-axi.js restore /data/backups/<file>.db
docker compose start studio
```

Restore checks that the file is a readable SQLite database with the board tables, saves the current database as a `-pre-restore` backup (restore that file to undo), and swaps the file in. It refuses while the bridge appears to be running on that database: the bridge keeps a `fleet.db.bridge` lock file next to the database and touches it every 10 seconds. `docker compose stop` shuts the bridge down cleanly and removes the lock. If the container was killed instead, the lock goes stale after 30 seconds. Pass `--force` only if you are sure the bridge is stopped.

| Variable            | Default                         | Meaning                                    |
| ------------------- | ------------------------------- | ------------------------------------------ |
| `FLEET_BACKUP_DIR`  | `backups/` next to the database | Where backups go                           |
| `FLEET_BACKUP_KEEP` | `14`                            | How many backups to keep                   |
| `FLEET_AUTO_BACKUP` | on                              | `off` stops the bridge's automatic backups |
| `FLEET_EXPORT_DIR`  | `exports/` next to the database | Where exports go                           |

To wipe it:

```bash
docker compose down -v   # deletes the volume, and the backups and exports in it
docker compose up --build
```

To check the store and the pages against real data, from the repo root:

```bash
npm --prefix fleet-axi ci
npm run check
```

The first command installs the database library. You only need it once. Each line is `ok` or `FAIL`. A non-zero exit means something broke. Docker does not need to be running.
