import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export const id = (p = '') => (p ? p + '_' : '') + randomUUID();

export function open(file) {
  mkdirSync(dirname(file), { recursive: true });
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(`
    CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT);
    CREATE TABLE IF NOT EXISTS members (
      id TEXT PRIMARY KEY, name TEXT, email TEXT, role TEXT, team TEXT
    );
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY, key TEXT UNIQUE, name TEXT, status TEXT, lead TEXT,
      private INTEGER DEFAULT 0, seq INTEGER DEFAULT 200, archived INTEGER DEFAULT 0,
      version INTEGER DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS project_members (project TEXT, member TEXT, PRIMARY KEY (project, member));
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY, key TEXT UNIQUE, project TEXT, title TEXT, status TEXT,
      assignee TEXT, priority TEXT, due TEXT, labels TEXT DEFAULT '[]', deps TEXT DEFAULT '[]',
      desc TEXT DEFAULT '', fm_task TEXT, version INTEGER DEFAULT 1, archived INTEGER DEFAULT 0,
      created INTEGER, updated INTEGER
    );
    CREATE TABLE IF NOT EXISTS comments (
      id TEXT PRIMARY KEY, task TEXT, by TEXT, text TEXT, at INTEGER
    );
    CREATE TABLE IF NOT EXISTS files (
      id TEXT PRIMARY KEY, project TEXT, task TEXT, name TEXT, by TEXT, at INTEGER, path TEXT
    );
    CREATE TABLE IF NOT EXISTS events (
      id TEXT PRIMARY KEY, project TEXT, title TEXT, date TEXT, time TEXT
    );
    CREATE TABLE IF NOT EXISTS notifs (
      id TEXT PRIMARY KEY, task TEXT, text TEXT, read INTEGER DEFAULT 0, at INTEGER
    );
    CREATE TABLE IF NOT EXISTS views (
      id TEXT PRIMARY KEY, project TEXT, name TEXT, type TEXT
    );
    CREATE TABLE IF NOT EXISTS activity (
      id TEXT PRIMARY KEY, task TEXT, project TEXT, verb TEXT, by TEXT, at INTEGER
    );
    CREATE TABLE IF NOT EXISTS outbox (
      id TEXT PRIMARY KEY, fm_task TEXT, task TEXT, event TEXT, at INTEGER, acked INTEGER DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS applied (id TEXT PRIMARY KEY, at INTEGER);
  `);
  try { db.exec('ALTER TABLE files ADD COLUMN path TEXT'); } catch { /* column exists */ }
  return db;
}

export function tx(db, fn) {
  return db.transaction(fn)();
}
