# Install

## What you need

- Node.js 20 or newer
- npm
- A compiler for `better-sqlite3`

On macOS that is Xcode Command Line Tools: `xcode-select --install`.

On Debian or Ubuntu: `sudo apt-get install -y build-essential python3`.

## Unpack

```
tar -xzf gr8r-axi.tar.gz
cd gr8r-axi
```

## Install

```
chmod +x install.sh
./install.sh
```

The script checks Node, installs dependencies, runs the smoke test, and creates `gr8r.db`.

## Use

```
npx gr8r-axi doctor
npx gr8r-axi task create --as fm --project PAY --title "Scale the worker" --fm_task fm-scale-1
npx gr8r-axi serve
```

## Fresh board

Start the bridge, then the studio. The studio drops `gr8r.v3` and renders `GET /store`.

```
npx gr8r-axi serve
```

In another terminal, from the studio:

```
npm run dev
```

## Fill or clear

```
./demo.sh fill
./demo.sh clear
```

Each asks `Are you sure? Type yes` before it changes anything. `clear` returns to the empty default.

The database path is `./gr8r.db`, or `GR8R_DB` if you set it. Do not commit the database.
