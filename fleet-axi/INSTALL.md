# Install

The package lives in `bthome/gr8r-studio/fleet-axi`. Clone that repo. Do not open an upstream PR.

## What you need

- Node.js 20 or newer
- npm
- A compiler for `better-sqlite3`

On macOS that is Xcode Command Line Tools: `xcode-select --install`.

On Debian or Ubuntu: `sudo apt-get install -y build-essential python3`.

## Unpack

```
tar -xzf fleet-axi.tar.gz
cd fleet-axi
```

## Install

```
chmod +x install.sh
./install.sh
```

The script checks Node, installs dependencies, runs the smoke test, and creates `fleet.db`.

## Use

```
npx fleet-axi doctor
npx fleet-axi task create --as fm --project PAY --title "Scale the worker" --fm_task fm-scale-1
npx fleet-axi serve
```

## Fresh board

Start the bridge, then the studio. The studio renders `GET /store`. It keeps only display preferences in the browser (`fleet.v2`), never board data.

```
npx fleet-axi serve
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

The database path is `./fleet.db`, or `FLEET_DB` if you set it. Do not commit the database.
