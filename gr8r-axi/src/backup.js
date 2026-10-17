// Backups, restore, and the bridge lock. Local files only, no network.
import Database from 'better-sqlite3';
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs';
import { hostname } from 'node:os';
import { gzipSync } from 'node:zlib';
import { dirname, join, resolve } from 'node:path';

const NAME = /^gr8r-\d{4}-\d\d-\d\dT\d\d-\d\d-\d\d-\d{3}Z(-[a-z0-9-]+)?\.db$/;
const TABLES = ['meta', 'members', 'projects', 'tasks', 'comments'];
const DAY = 24 * 60 * 60 * 1000;
const HEARTBEAT = 10 * 1000;
const STALE = 30 * 1000;

export const backupDir = file => resolve(process.env.GR8R_BACKUP_DIR || join(dirname(file), 'backups'));
export function backupKeep() {
  const n = Number(process.env.GR8R_BACKUP_KEEP);
  return Number.isInteger(n) && n >= 1 ? n : 14;
}
export const listBackups = dir =>
  existsSync(dir)
    ? readdirSync(dir)
        .filter(n => NAME.test(n))
        .sort()
    : [];

// VACUUM INTO copies one consistent snapshot in a single read transaction. In WAL mode writers keep going while it runs.
// It writes to a .partial name first and renames, so a half-written file never looks like a backup.
export function backup(db, file, { label } = {}) {
  const dir = backupDir(file);
  mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  let name = `gr8r-${stamp}${label ? '-' + label : ''}.db`;
  for (let i = 1; existsSync(join(dir, name)); i++) name = `gr8r-${stamp}-${i}${label ? '-' + label : ''}.db`;
  const target = join(dir, name);
  const partial = target + '.partial';
  rmSync(partial, { force: true });
  try {
    db.prepare('VACUUM INTO ?').run(partial);
    renameSync(partial, target);
  } catch (err) {
    rmSync(partial, { force: true });
    throw err;
  }
  return { file: target, pruned: prune(dir, backupKeep()) };
}

export function prune(dir, keep) {
  const all = listBackups(dir);
  const old = all.slice(0, Math.max(0, all.length - keep));
  for (const n of old) rmSync(join(dir, n), { force: true });
  return old;
}

export function validate(src) {
  let db;
  try {
    db = new Database(src, { readonly: true, fileMustExist: true });
    const check = db.pragma('quick_check', { simple: true });
    if (check !== 'ok') throw new Error(check);
  } catch (err) {
    db?.close();
    throw new Error(`${src} is not a readable SQLite database (${err.message})`);
  }
  const have = new Set(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").pluck().all());
  db.close();
  const missing = TABLES.filter(t => !have.has(t));
  if (missing.length) throw new Error(`${src} is not a Gr8r database, missing tables: ${missing.join(', ')}`);
}

// The bridge keeps a small lock file next to the database and touches it every 10 seconds.
const lockFile = file => file + '.bridge';

export function holdLock(file) {
  const lock = lockFile(file);
  writeFileSync(lock, JSON.stringify({ pid: process.pid, host: hostname(), started: new Date().toISOString() }));
  const beat = setInterval(() => {
    try {
      const now = new Date();
      utimesSync(lock, now, now);
    } catch {
      /* the next restore check treats a missing lock as not running */
    }
  }, HEARTBEAT);
  beat.unref();
  const release = () => {
    clearInterval(beat);
    try {
      if (JSON.parse(readFileSync(lock, 'utf8')).pid === process.pid) rmSync(lock, { force: true });
    } catch {
      /* already gone */
    }
  };
  process.on('exit', release);
  for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => process.exit(0));
  return release;
}

// Running if the lock was touched in the last 30 seconds, or if its process is alive on this host.
// A crashed bridge in another container leaves a lock that goes stale after 30 seconds.
export function bridgeRunning(file) {
  const lock = lockFile(file);
  if (!existsSync(lock)) return false;
  let info = {};
  try {
    info = JSON.parse(readFileSync(lock, 'utf8'));
  } catch {
    /* unreadable lock: fall back to its age */
  }
  if (info.host === hostname() && info.pid && info.pid !== process.pid) {
    try {
      process.kill(info.pid, 0);
      return true;
    } catch (err) {
      return err.code === 'EPERM';
    }
  }
  return Date.now() - statSync(lock).mtimeMs < STALE;
}

// The bridge must be stopped. Restore backs up the current database, copies the backup next to it, and renames it into place.
export function restore(file, src, { open, force = false }) {
  src = resolve(src);
  if (!existsSync(src)) throw new Error(`${src} does not exist`);
  if (src === resolve(file)) throw new Error('that file is the live database');
  validate(src);
  if (!force && bridgeRunning(file)) throw new Error('the bridge appears to be running on this database. Stop it first, or pass --force if it is not');
  let preRestore = null;
  if (existsSync(file)) {
    const cur = open(file);
    try {
      preRestore = backup(cur, file, { label: 'pre-restore' }).file;
      cur.pragma('wal_checkpoint(TRUNCATE)');
    } finally {
      cur.close();
    }
  }
  const tmp = file + '.restoring';
  rmSync(tmp, { force: true });
  const from = new Database(src, { readonly: true, fileMustExist: true });
  try {
    from.prepare('VACUUM INTO ?').run(tmp);
  } finally {
    from.close();
  }
  rmSync(file + '-wal', { force: true });
  rmSync(file + '-shm', { force: true });
  renameSync(tmp, file);
  const db = open(file);
  const check = db.pragma('quick_check', { simple: true });
  db.close();
  if (check !== 'ok') throw new Error(`restored database failed its check: ${check}${preRestore ? `. Undo with: gr8r-axi restore ${preRestore}` : ''}`);
  return { restored: file, from: src, preRestore };
}

// At most one automatic backup a day, so a restart loop cannot push good backups out of the keep window.
export function autoBackup(db, file, log = console.error) {
  if (/^(0|off|false|no)$/i.test(process.env.GR8R_AUTO_BACKUP || '')) return null;
  const run = () => {
    try {
      const dir = backupDir(file);
      const newest = listBackups(dir).pop();
      if (newest && Date.now() - statSync(join(dir, newest)).mtimeMs < DAY) return;
      const r = backup(db, file, { label: 'auto' });
      console.log(JSON.stringify({ backup: r.file, pruned: r.pruned.length }));
    } catch (err) {
      log(JSON.stringify({ error: `automatic backup failed: ${err.message}` }));
    }
  };
  run();
  const timer = setInterval(run, 60 * 60 * 1000);
  timer.unref();
  return timer;
}

export const exportDir = file => resolve(process.env.GR8R_EXPORT_DIR || join(dirname(file), 'exports'));

// Every row of every table, read in one transaction so the export is one consistent snapshot.
// BLOB values become { $base64: '...' } so the document stays valid JSON.
export function exportDocument(db) {
  const cell = v => (Buffer.isBuffer(v) ? { $base64: v.toString('base64') } : typeof v === 'bigint' ? v.toString() : v);
  return db.transaction(() => {
    const defs = db.prepare("SELECT name, sql FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all();
    const tables = {};
    const schema = {};
    for (const { name, sql } of defs) {
      schema[name] = sql;
      const rows = db.prepare(`SELECT * FROM "${name.replace(/"/g, '""')}"`).all();
      tables[name] = rows.map(r => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, cell(v)])));
    }
    return {
      format: 'gr8r-export',
      version: 1,
      exportedAt: new Date().toISOString(),
      schemaVersion: db.pragma('user_version', { simple: true }),
      schema,
      tables,
    };
  })();
}

export function writeExport(db, file, out) {
  let target = out ? resolve(out) : null;
  if (!target) {
    const dir = exportDir(file);
    target = join(dir, `gr8r-export-${new Date().toISOString().replace(/[:.]/g, '-')}.json.gz`);
    for (let i = 1; existsSync(target); i++) target = join(dir, `gr8r-export-${new Date().toISOString().replace(/[:.]/g, '-')}-${i}.json.gz`);
  }
  mkdirSync(dirname(target), { recursive: true });
  const doc = exportDocument(db);
  const gz = gzipSync(JSON.stringify(doc));
  const partial = target + '.partial';
  try {
    writeFileSync(partial, gz);
    renameSync(partial, target);
  } catch (err) {
    rmSync(partial, { force: true });
    throw err;
  }
  return { file: target, bytes: gz.length, rows: Object.fromEntries(Object.entries(doc.tables).map(([k, v]) => [k, v.length])) };
}

export function describeBackups(dir) {
  return listBackups(dir)
    .reverse()
    .map(n => {
      const s = statSync(join(dir, n));
      return { file: join(dir, n), bytes: s.size, at: s.mtime.toISOString() };
    });
}
