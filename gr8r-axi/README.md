# gr8r-axi

AXI and SQLite bridge for the Gr8r Studio store. Lives in `bthome/gr8r-studio`. The page keeps its JSON document. SQLite is the source of truth. Mates write only through this CLI.

There is no mail, no login, no billing. Members are added by the first mate. Notifications are firstmate signals.

## Install

See `INSTALL.md`.

```
cd gr8r-axi
chmod +x install.sh
./install.sh
```

Node 20 or newer is required. `better-sqlite3` needs a C compiler.

## Run

```
npx gr8r-axi serve
npx gr8r-axi doctor
npx gr8r-axi task create --as fm --project PAY --title "Scale the worker" --fm_task fm-scale-1
```

`serve` exposes `GET /store`. The studio drops `gr8r.v3` and renders that document when the bridge is up.

## Files

```
npx gr8r-axi settings set --path /Users/you/gr8r-files
npx gr8r-axi file add --as fm --project PAY --path ./note.txt --name "rollback patch"
```

SQLite stores the pointer. The file is `id - description.ext` in the folder.

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
