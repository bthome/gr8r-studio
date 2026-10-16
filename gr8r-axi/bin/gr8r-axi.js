#!/usr/bin/env node
import { open } from '../src/db.js';
import { Store } from '../src/store.js';
import { CATALOG } from '../src/catalog.js';
import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';

const args = process.argv.slice(2);
const [cmd, sub] = args;
const flags = {};
const pos = [];
for (let i = 2; i < args.length; i++) {
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
  else if (cmd === 'task' && sub === 'create') out(store.createTask({ as: flags.as, project: flags.project, title: flags.title, status: flags.status, assignee: flags.assignee, priority: flags.priority, fmTask: flags.fm_task }));
  else if (cmd === 'task' && sub === 'update') out(store.updateTask({ as: flags.as, key: pos[0], set: { status: flags.status, title: flags.title, assignee: flags.assignee, fmTask: flags.fm_task }, expected: flags.version }));
  else if (cmd === 'task' && sub === 'delete') out(store.deleteTask({ as: flags.as, key: pos[0] }));
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
  else if (cmd === 'serve') {
    const port = Number(flags.port || 8787);
    createServer((req, res) => {
      res.setHeader('access-control-allow-origin', '*');
      res.setHeader('access-control-allow-methods', 'GET, POST, OPTIONS');
      res.setHeader('access-control-allow-headers', 'content-type');
      if (req.method === 'OPTIONS') { res.end(); return; }
      if (req.url === '/store') {
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify(store.document()));
        return;
      }
      if (req.url.startsWith('/files/')) {
        const id = req.url.slice('/files/'.length);
        const row = db.prepare('SELECT path FROM files WHERE id = ?').get(id);
        if (!row) { res.statusCode = 404; res.end('not found'); return; }
        createReadStream(row.path).pipe(res);
        return;
      }
      if (req.url === '/sync' && req.method === 'POST') {
        let body = '';
        req.on('data', c => (body += c));
        req.on('end', () => {
          try {
            const doc = JSON.parse(body);
            res.setHeader('content-type', 'application/json');
            res.end(JSON.stringify(store.sync(doc)));
          } catch (err) {
            res.statusCode = 400;
            res.end(JSON.stringify({ error: err.message }));
          }
        });
        return;
      }
      if (req.url === '/settings' && req.method === 'POST') {
        let body = '';
        req.on('data', c => (body += c));
        req.on('end', () => {
          try {
            const { path } = JSON.parse(body);
            res.setHeader('content-type', 'application/json');
            res.end(JSON.stringify(store.setPath(path)));
          } catch (err) {
            res.statusCode = 400;
            res.end(JSON.stringify({ error: err.message }));
          }
        });
        return;
      }
      res.statusCode = 404;
      res.end('not found');
    }).listen(port, () => console.log(`bridge http://127.0.0.1:${port}/store`));
  } else {
    throw new Error(`unknown ${cmd} ${sub || ''}`);
  }
} catch (err) {
  console.error(JSON.stringify({ error: err.message, next: 'gr8r-axi help' }));
  process.exit(1);
}
