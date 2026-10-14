# gr8r-axi

AXI and SQLite bridge for the Gr8r Studio store. The page keeps its JSON document. SQLite is the source of truth. Mates write only through this CLI.

## Install

See `INSTALL.md`. Short form:

```
tar -xzf gr8r-axi.tar.gz
cd gr8r-axi
chmod +x install.sh
./install.sh
```

Node 20 or newer is required. `better-sqlite3` needs a C compiler.

## Run

```
npm install
npx gr8r-axi init
npx gr8r-axi task create --as fm --project PAY --title "Scale the worker" --fm_task fm-scale-1
npx gr8r-axi doctor
npx gr8r-axi serve
```

`serve` exposes `GET /store`, the document the page renders.

## Access

First mate is Admin. Secondmates are Members of a project. AXI rejects a Member write outside that project.

## Skill

`skill/SKILL.md` is the mate instruction. Load it as an agent skill.

## Agent readme

`AGENT-README.md` is the background, the decisions, the assumptions, and the tests. Read it before changing the store.
