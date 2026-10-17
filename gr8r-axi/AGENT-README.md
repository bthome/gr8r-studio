# Agent readme

This file is for an agent that picks up the repo. The repo is `bthome/gr8r-studio`. Do not open an upstream PR.

## Background

The captain uses Gr8r Studio. The first mate is the only liaison. Secondmates own a project. A studio task and a Firstmate task are different ids, joined by `fm_task`.

## What was decided

- SQLite is the source of truth. The page is a JSON cache.
- AXI is the only write door.
- The first mate is Admin. A secondmate is a Member of one project.
- The store assigns `id` and `key`. The first mate writes `fm_task`.
- A UI change writes an outbox row. A watcher wakes the first mate with `fm-send`.
- Mail, access requests, account, and billing are removed. They were toasts.
- Notifications are firstmate signals: review waiting, unlinked task, stalled relay.
- Members are added by the first mate. There is no invite and no email.
- Files: pointer in SQLite, bytes on disk, name is `id - description.ext`. The folder is set on Settings → Files.
- A label groups a card. There is no ITIL type.

## What was built

| Path              | Purpose                                               |
| ----------------- | ----------------------------------------------------- |
| `src/catalog.js`  | Status, priority, label, role.                        |
| `src/db.js`       | SQLite schema. WAL. UUID ids.                         |
| `src/store.js`    | Init, tasks, files, access, outbox, doctor, document. |
| `bin/gr8r-axi.js` | CLI and `serve`.                                      |
| `skill/SKILL.md`  | Mate instructions.                                    |
| `demo.sh`         | Fill or clear, with a confirm.                        |
| `test/smoke.js`   | Key, catalog, document, outbox.                       |

Commands: `init`, `reset`, `vocab`, `task list/view/create/update/delete`, `file add/list`, `settings get/set`, `doctor`, `outbox`, `ack`, `serve`.

## Assumptions

- The captain talks only to the first mate.
- Firstmate is the controller. `fm-send` wakes. `fm-control` is interrupt, exit, relaunch.
- One project is one system. One Member is one secondmate.
- A mate that skips the skill is visible to `doctor`, not stopped by it.

## Tests

`node test/smoke.js` checks init, key allocation, catalog rejection, the document shape, and the outbox row.

A CLI run confirmed `task create` returned `PAY-201` and `file add` wrote `f_… - rollback patch.txt`.

## Not done

- Page writes still go to the local document. Pointing every save at AXI is the remaining studio edit.
- The outbox watcher that calls `fm-send` sits next to Firstmate, not here.
