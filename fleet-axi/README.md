# fleet-axi

AXI and SQLite bridge for the Fleet Studio store. Lives in `bthome/gr8r-studio`. The page keeps its JSON document. SQLite is the source of truth. Mates write only through this CLI.

There is no mail, no login, no billing. Members are added by the first mate. Notifications are firstmate signals.

## Install

See `INSTALL.md`.

```
cd fleet-axi
chmod +x install.sh
./install.sh
```

Node 20 or newer is required. `better-sqlite3` needs a C compiler.

## Run

```
npx fleet-axi serve
npx fleet-axi doctor
npx fleet-axi task create --as fm --project PAY --title "Scale the worker" --fm_task fm-scale-1
```

`serve` exposes `GET /store`. The studio renders that document when the bridge is up. It keeps only display preferences in the browser (`fleet.v2`), never board data.

## Files

```
npx fleet-axi settings set --path /Users/you/fleet-files
npx fleet-axi file add --as fm --project PAY --path ./note.txt --name "rollback patch"
```

SQLite stores the pointer. The file is `id - description.ext` in the folder.

## Health, backups, export

```
curl http://127.0.0.1:8787/health          # 200 {ok:true,...} or 503 {ok:false,...}; no passphrase, no board data
npx fleet-axi backup                        # SQLite copy into backups/ next to the database; prints the path last
npx fleet-axi backup --list                 # newest first, with time and size; add --json for JSON
npx fleet-axi export [--out <file>]         # every table and row as gzip JSON into exports/; prints the path
npx fleet-axi restore <backup> [--force]    # stop the bridge first; saves a -pre-restore backup, then swaps the file in
```

Backups use SQLite `VACUUM INTO`, one consistent snapshot while writers keep going. The bridge backs up on start and then at most once a day. Settings: `FLEET_BACKUP_DIR`, `FLEET_BACKUP_KEEP` (14), `FLEET_AUTO_BACKUP=off`, `FLEET_EXPORT_DIR`. Export shape: `{ format: 'fleet-export', version: 1, exportedAt, schemaVersion, schema, tables: { <name>: [rows] } }`; BLOB values are `{ "$base64": "..." }`. See `DOCKER.md` for copying files out of the container.

## Fill or clear

```
./demo.sh fill
./demo.sh clear
```

Each asks `Are you sure? Type yes`.

## Access

First mate is Admin. Secondmates are Members of a project. AXI rejects a Member write outside that project.

## Skill

`skill/SKILL.md` is the mate instruction. `AGENT-README.md` is the background.
