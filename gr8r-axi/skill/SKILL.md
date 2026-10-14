---
name: gr8r-axi
description: Use gr8r-axi for every studio task write. Do not edit Firstmate tasks without the matching AXI command.
---

# Gr8r AXI

The studio store is SQLite. You write it only through `gr8r-axi`. The page reads the same database.

## Who writes what

- First mate is Admin. You can write any project. You create the row, set `fm_task`, and relay reviews.
- A secondmate is a Member of one project. AXI rejects a write to any other project.
- The captain uses the page. The page posts to this same door.

## Create

```
gr8r-axi task create --as fm --project PAY --title "Scale the worker" --fm_task fm-scale-1
```

The command returns `id` and `key`. Do not invent either. If you have no Firstmate task yet, omit `--fm_task`. The row stays unlinked. `doctor` will list it.

## Update and delete

```
gr8r-axi task update PAY-201 --as m6 --status progress --version 1
gr8r-axi task delete PAY-201 --as fm
```

A version mismatch returns 409. Re-read, then retry. Delete archives the row and writes an outbox event. Drop the Firstmate task only after the command returns.

## After a captain change

The page write inserts an outbox row. You are woken with the event id and `fm_task`. Read the task, relay, then:

```
gr8r-axi ack <eventId>
```

A repeated event id is a no-op.

## Files

Set the folder once, from Settings → Files, or:

```
gr8r-axi settings set --path /Users/you/gr8r-files
```

Add a file. The bytes go to that folder. SQLite stores the pointer. The name is `id - description.ext`.

```
gr8r-axi file add --as fm --project PAY --task PAY-201 --path ./patch.diff --name "rollback patch"
```

`--name` is optional. Without it, the original file name is used after the id.

```
gr8r-axi doctor
```

Relink or archive unlinked rows. Resend an unacked event once. Do not clear a captain review. Leave anything you cannot fix in the report.
