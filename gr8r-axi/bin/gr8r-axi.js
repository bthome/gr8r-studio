#!/usr/bin/env node
import { open } from '../src/db.js';
import { Store } from '../src/store.js';
import { CATALOG } from '../src/catalog.js';
import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { createHash, timingSafeEqual } from 'node:crypto';
import { extname } from 'node:path';

const args = process.argv.slice(2);
const cmd = args[0];
const sub = args[1] && !args[1].startsWith('--') ? args[1] : undefined;
const flags = {};
const pos = [];
for (let i = sub ? 2 : 1; i < args.length; i++) {
  const a = args[i];
  if (a.startsWith('--')) {
    const [k, inline] = a.slice(2).split('=');
    flags[k] = inline ?? args[++i];
  } else pos.push(a);
}
const file = process.env.GR8R_DB || new URL('../gr8r.db', import.meta.url).pathname;
const db = open(file);
const store = new Store(db);

function out(data) {
  console.log(JSON.stringify(data, null, 2));
}

try {
  if (!cmd || cmd === 'help') {
    out({
      commands: ['init', 'vocab', 'task', 'project', 'comment', 'doctor', 'file', 'settings', 'outbox', 'ack', 'serve'],
      next: 'gr8r-axi init',
    });
  } else if (cmd === 'init') out(store.init());
  else if (cmd === 'vocab') out(sub ? { [sub]: CATALOG[sub] } : CATALOG);
  else if (cmd === 'task' && sub === 'list') out(store.listTasks(flags.project));
  else if (cmd === 'task' && sub === 'view') out(store.task(pos[0]));
  else if (cmd === 'task' && sub === 'create')
    out(
      store.createTask({
        as: flags.as,
        project: flags.project,
        title: flags.title,
        status: flags.status,
        assignee: flags.assignee,
        priority: flags.priority,
        fmTask: flags.fm_task,
      }),
    );
  else if (cmd === 'task' && sub === 'update') {
    const set = {};
    if (flags.status != null) set.status = flags.status;
    if (flags.title != null) set.title = flags.title;
    if (flags.assignee != null) set.assignee = flags.assignee;
    if (flags.fm_task != null) set.fmTask = flags.fm_task;
    out(store.updateTask({ as: flags.as, key: pos[0], set, expected: flags.version }));
  } else if (cmd === 'task' && sub === 'delete') out(store.deleteTask({ as: flags.as, key: pos[0] }));
  else if (cmd === 'settings' && sub === 'set') out(store.setPath(flags.path));
  else if (cmd === 'settings' && sub === 'get') out({ 'files.path': store.fileRoot() });
  else if (cmd === 'file' && sub === 'add') out(store.addFile({ as: flags.as, project: flags.project, task: flags.task, path: flags.path, name: flags.name }));
  else if (cmd === 'file' && sub === 'list') out(store.listFiles(flags.project));
  else if (cmd === 'outbox') out(db.prepare('SELECT * FROM outbox WHERE acked = 0').all());
  else if (cmd === 'doctor') out(store.doctor());
  else if (cmd === 'project' && sub === 'create') out(store.createProject({ as: flags.as, name: flags.name, key: flags.key }));
  else if (cmd === 'project' && sub === 'update') out(store.updateProject({ as: flags.as, key: pos[0], set: { name: flags.name, status: flags.status } }));
  else if (cmd === 'comment' && sub === 'add') out(store.addComment({ as: flags.as, task: flags.task, text: flags.text }));
  else if (cmd === 'ack') out(store.ack(sub));
  else if (cmd === 'serve') serve(Number(flags.port || 8787), flags.host || process.env.GR8R_HOST || '127.0.0.1');
  else {
    throw new Error(`unknown ${cmd} ${sub || ''}`);
  }
} catch (err) {
  console.error(JSON.stringify({ error: err.message, next: 'gr8r-axi help' }));
  process.exit(1);
}

function serve(port, host) {
  const MAX_BODY = 5 * 1024 * 1024;
  const allowed = (process.env.GR8R_ALLOWED_ORIGINS || 'http://localhost:5173,http://127.0.0.1:5173')
    .split(',')
    .map(o => o.trim())
    .filter(Boolean);
  const extraHosts = (process.env.GR8R_ALLOWED_HOSTS || '')
    .split(',')
    .map(h => h.trim().toLowerCase())
    .filter(Boolean);
  const passphrase = process.env.GR8R_PASSPHRASE || '';
  const digest = s => createHash('sha256').update(String(s)).digest();
  const TYPES = {
    '.txt': 'text/plain; charset=utf-8',
    '.md': 'text/markdown; charset=utf-8',
    '.json': 'application/json',
    '.pdf': 'application/pdf',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
  };
  const hostname = h => {
    try {
      return new URL(`http://${h}`).hostname.toLowerCase();
    } catch {
      return '';
    }
  };
  const isIpLiteral = h => /^\d{1,3}(\.\d{1,3}){3}$/.test(h) || h.startsWith('[');
  // A DNS name could be rebound to 127.0.0.1, so only IP literals, localhost, and listed names may reach the bridge.
  const hostOk = h => h === 'localhost' || isIpLiteral(h) || extraHosts.includes(h);
  const originOk = (origin, reqHost) => {
    if (!origin) return true;
    if (allowed.includes(origin)) return true;
    try {
      const o = new URL(origin);
      return o.protocol === 'http:' && o.port === '5173' && isIpLiteral(o.hostname) && o.hostname === reqHost;
    } catch {
      return false;
    }
  };
  const reply = (res, status, data) => {
    res.statusCode = status;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify(data));
  };
  const readJson = (req, res, handle) => {
    const type = (req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
    if (type !== 'application/json') return reply(res, 415, { error: 'content-type must be application/json' });
    const tooBig = () => {
      res.setHeader('connection', 'close');
      reply(res, 413, { error: 'body is over 5 MB' });
      req.resume();
    };
    if (Number(req.headers['content-length'] || 0) > MAX_BODY) return tooBig();
    const chunks = [];
    let size = 0;
    req.on('data', c => {
      if (size > MAX_BODY) return;
      size += c.length;
      if (size > MAX_BODY) tooBig();
      else chunks.push(c);
    });
    req.on('end', () => {
      if (size > MAX_BODY) return;
      try {
        reply(res, 200, handle(JSON.parse(Buffer.concat(chunks).toString('utf8'))));
      } catch (err) {
        reply(res, 400, { error: err.message });
      }
    });
  };
  const sendFile = (res, id) => {
    const row = db.prepare('SELECT path FROM files WHERE id = ?').get(id);
    if (!row) return reply(res, 404, { error: 'not found' });
    const stream = createReadStream(row.path);
    stream.on('open', () => {
      res.setHeader('content-type', TYPES[extname(row.path).toLowerCase()] || 'application/octet-stream');
      res.setHeader('x-content-type-options', 'nosniff');
      res.setHeader('content-security-policy', 'sandbox');
      stream.pipe(res);
    });
    stream.on('error', () => (res.headersSent ? res.destroy() : reply(res, 404, { error: 'file is missing on disk' })));
  };

  const server = createServer((req, res) => {
    try {
      const reqHost = hostname(req.headers.host || '');
      const origin = req.headers.origin;
      if (!hostOk(reqHost) || !originOk(origin, reqHost)) return reply(res, 403, { error: 'origin not allowed' });
      if (origin) {
        res.setHeader('access-control-allow-origin', origin);
        res.setHeader('vary', 'Origin');
        res.setHeader('access-control-allow-methods', 'GET, POST, OPTIONS');
        res.setHeader('access-control-allow-headers', 'content-type, x-gr8r-passphrase');
      }
      if (req.method === 'OPTIONS') {
        res.statusCode = 204;
        return res.end();
      }
      if (passphrase && !timingSafeEqual(digest(req.headers['x-gr8r-passphrase'] || ''), digest(passphrase))) {
        return reply(res, 401, { error: 'passphrase required' });
      }
      const path = new URL(req.url, 'http://bridge').pathname;
      if (path === '/store' && req.method === 'GET') return reply(res, 200, store.document());
      if (path.startsWith('/files/') && req.method === 'GET') return sendFile(res, path.slice('/files/'.length));
      if (path === '/sync' && req.method === 'POST') return readJson(req, res, doc => store.sync(doc));
      if (path === '/settings' && req.method === 'POST') return readJson(req, res, body => store.setPath(body.path));
      reply(res, 404, { error: 'not found' });
    } catch (err) {
      if (!res.headersSent) reply(res, 500, { error: err.message });
      else res.destroy();
    }
  });
  server.on('error', err => {
    console.error(JSON.stringify({ error: err.message, next: 'gr8r-axi serve --port <free port>' }));
    process.exit(1);
  });
  server.listen(port, host, () => console.log(`bridge http://${host}:${port}/store`));
}
