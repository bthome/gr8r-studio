# Agent readme

This file is for an agent that picks up the repo. It says why the project exists, what was decided, what was built, and what was tested.

## Background

The captain uses Gr8r Studio, a Vite app that renders a JSON document from memory and saves it to `localStorage` under `gr8r.v3`. Projects, members, and tasks are the records. Search, inbox, board, list, and table all read that document.

The mates need to create and maintain those tasks. The first mate is the only liaison to the captain. Secondmates own a system, which is a project. A studio task and a Firstmate task are different ids. They must be joined, or a captain edit has no one to wake.

The original studio has no API, no CLI, and no write lock. Two writers overwrite each other. Roles are displayed. They are not enforced. Status, label, and assignee can change with no transition rule.

## What was decided

- The page stays a JSON renderer. Views are not rewritten as SQL.
- SQLite is the source of truth. `localStorage` is a paint cache.
- AXI is the only write door. The page posts to it. Mates call it. No second connection.
- The first mate is Admin. A secondmate is a Member of one project. AXI checks that on every write.
- The studio assigns `id` and `key` in the insert transaction. The Firstmate id is stored as `fm_task`.
- A UI change writes an outbox row in the same transaction. A watcher wakes the first mate with `fm-send`. The first mate relays. It does not watch the browser.
- Catalog values are enforced. An unknown status is rejected.
- A version mismatch is 409. The caller re-reads.
- Delete and archive go through AXI, then the Firstmate task is dropped. Not the other way around.
- ITIL types were explored and then set aside. A label groups a card. A type would only return if a lifecycle must differ. This repo uses the original task.
- Reference data lives in code, served by `vocab`. It is not a store table. Changing it is a code change.

## What was built

| Path | Purpose |
|---|---|
| `src/catalog.js` | Status, priority, label, project status, role. |
| `src/db.js` | SQLite schema. WAL. UUID ids. |
| `src/store.js` | Init, create, update, delete, access, outbox, doctor, document. |
| `bin/gr8r-axi.js` | CLI and `serve`. |
| `skill/SKILL.md` | Mate instructions. |
| `test/smoke.js` | Key allocation, catalog rejection, document shape, outbox. |

Commands that work: `init`, `vocab`, `task list`, `task view`, `task create`, `task update`, `task delete`, `doctor`, `outbox`, `ack`, `serve`.

`serve` exposes `GET /store`. That is the document the page renders. The page load and save path is the only studio change required. The views stay.

## Assumptions

- The captain talks only to the first mate.
- Firstmate remains the controller. `fm-send` wakes. `fm-control` is interrupt, exit, relaunch.
- One project is one system. One Member is one secondmate.
- More than one writer exists, so SQLite is required.
- A mate will follow the skill. A mate that does not is visible to `doctor`, not stopped by it.
- Comments, files, events, and views use the same door and are not separate commands yet.

## Tests

`node test/smoke.js` checks four things.

- `init` seeds the captain, the first mate, and a Member on `PAY`.
- `task create` returns a `PAY-` key and an id.
- A status not in the catalog is rejected.
- The document has the task, and create wrote one outbox row.

A later CLI run confirmed `init`, `task create --as fm --project PAY --title "Scale the worker" --fm_task fm-scale-1` returned `PAY-201`, and `doctor` listed that create as unacked.

## Not done

- The page is not wired to `GET /store` yet. The bridge is the server. The studio load and save replacement is the remaining edit.
- Comments, files, events, views, and member invite are specified and not implemented.
- The outbox watcher that calls `fm-send` is outside this repo. It belongs next to Firstmate.
- Nothing here makes a mate obey. `doctor` is the end-of-day list. The first mate reworks what is safe and leaves the rest for the captain.
