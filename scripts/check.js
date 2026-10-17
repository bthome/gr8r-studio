#!/usr/bin/env node
// Smoke check. Prints one line per check. Exit 1 if any fail.
//   npm run check
import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

if (!existsSync(new URL('../gr8r-axi/node_modules/better-sqlite3', import.meta.url))) {
  console.error('\nThe check needs the database library. From the repo root:\n');
  console.error('  npm --prefix gr8r-axi ci\n');
  process.exit(1);
}

const { open } = await import('../gr8r-axi/src/db.js');
const { Store } = await import('../gr8r-axi/src/store.js');

const dir = mkdtempSync(join(tmpdir(), 'gr8r-check-'));
const db = open(join(dir, 'gr8r.db'));
const store = new Store(db);
store.init();

let failed = 0;
const ok = name => console.log(`  ok   ${name}`);
const bad = (name, err) => {
  failed++;
  console.log(`  FAIL ${name}${err ? ' — ' + err : ''}`);
};

function check(name, fn) {
  try {
    fn();
    ok(name);
  } catch (err) {
    bad(name, err.message);
  }
}

console.log('\nDocument shape');
const doc = store.document();
for (const k of ['ws', 'me', 'members', 'projects', 'tasks', 'comments', 'files', 'projOrder', 'recentSearches']) {
  check(`document has ${k}`, () => {
    if (!(k in doc)) throw new Error('missing');
  });
}
check('a project exists', () => {
  if (!doc.projects.length) throw new Error('none');
});
const p = doc.projects[0];
for (const k of ['id', 'key', 'name', 'desc', 'milestones', 'members', 'fav']) {
  check(`project.${k}`, () => {
    if (!(k in p)) throw new Error('missing');
  });
}

console.log('\nWrite, reload, read');
const task = {
  id: 't_check',
  key: p.key + '-201',
  project: p.id,
  title: 'Check me',
  status: 'todo',
  assignee: 'm6',
  priority: 'high',
  due: '2026-10-20',
  labels: ['ops'],
  deps: [],
  desc: 'a note',
  fav: true,
  start: '2026-10-16',
  subtasks: [{ id: 's1', title: 'first step', done: false }],
  created: Date.now(),
  updated: Date.now(),
};
doc.tasks.push(task);
doc.comments.push({ id: 'c1', task: task.id, by: 'm1', text: 'looking', at: Date.now() });
p.milestones.push({ id: 'ms1', name: 'ready', date: '2026-10-30' });
p.fav = true;
const back = store.sync(doc);
check('title survived', () => {
  if (back.tasks.find(t => t.id === 't_check')?.title !== 'Check me') throw new Error('gone');
});
check('favorite survived', () => {
  if (!back.tasks.find(t => t.id === 't_check')?.fav) throw new Error('false');
});
check('subtask survived', () => {
  if (!back.tasks.find(t => t.id === 't_check')?.subtasks.length) throw new Error('empty');
});
check('comment survived', () => {
  if (!back.comments.find(c => c.id === 'c1')) throw new Error('gone');
});
check('milestone survived', () => {
  if (!back.projects[0].milestones.length) throw new Error('empty');
});
check('project favorite survived', () => {
  if (!back.projects[0].fav) throw new Error('false');
});

console.log('\nPartial update');
check('status only does not clear title', () => {
  const r = store.updateTask({ as: 'fm', key: 'PAY-201', set: { status: 'progress' } });
  if (r.title !== 'Check me') throw new Error(`title is ${r.title}`);
  if (r.status !== 'progress') throw new Error(`status is ${r.status}`);
});

console.log('\nCommands');
check('doctor runs', () => {
  if (typeof store.doctor().ok !== 'boolean') throw new Error('no ok');
});
check('project create', () => {
  if (!store.createProject({ as: 'fm', name: 'Ops', key: 'OPS' }).key) throw new Error('no key');
});
check('comment add', () => {
  if (!store.addComment({ as: 'fm', task: 'PAY-201', text: 'ack' }).id) throw new Error('no id');
});

console.log('\nPages against the real document');
globalThis.navigator = { platform: 'Mac', userAgent: 'node' };
globalThis.addEventListener = () => {};
globalThis.window = { dispatchEvent: () => {}, addEventListener: () => {} };
globalThis.document = {
  getElementById: () => null,
  querySelector: () => null,
  querySelectorAll: () => [],
  addEventListener: () => {},
  createElement: () => ({ style: {}, setAttribute() {}, appendChild() {}, classList: { add() {}, remove() {} } }),
  body: { appendChild() {} },
};
globalThis.fetch = () => Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
const { S } = await import('../src/core/store.js');
S.data = back;
const pages = {
  home: (await import('../src/pages/home.js')).pageHome,
  favorites: (await import('../src/pages/favorites.js')).pageFavorites,
  search: (await import('../src/pages/search.js')).pageSearch,
  projects: (await import('../src/pages/projects.js')).pageProjects,
  members: (await import('../src/pages/members.js')).pageMembers,
};
const { searchAll } = await import('../src/pages/search.js');
for (const [name, fn] of Object.entries(pages)) {
  check(`page ${name} renders`, () => {
    if (typeof fn() !== 'string') throw new Error('no html');
  });
}
check('search for a task', () => {
  if (!searchAll('check').tasks.length) throw new Error('no hit');
});
check('search for a comment', () => {
  if (!searchAll('looking').comments.length) throw new Error('no hit');
});
check('search with no query', () => {
  if (searchAll('').tasks.length) throw new Error('should be empty');
});

console.log(failed ? `\n${failed} failed\n` : '\nall checks passed\n');
process.exit(failed ? 1 : 0);
