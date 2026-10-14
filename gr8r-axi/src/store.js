import { check } from './catalog.js';
import { id, tx } from './db.js';
import { copyFileSync, mkdirSync } from 'node:fs';
import { basename, extname, join } from 'node:path';

export class Store {
  constructor(db) { this.db = db; }

  actor(as) {
    const m = this.db.prepare('SELECT * FROM members WHERE id = ?').get(as);
    if (!m) throw new Error(`unknown mate ${as}`);
    return m;
  }

  can(actor, projectId) {
    if (actor.role === 'Admin' || actor.role === 'Owner') return;
    const row = this.db.prepare('SELECT 1 FROM project_members WHERE project = ? AND member = ?').get(projectId, actor.id);
    if (!row) throw new Error(`${actor.id} cannot write ${projectId}`);
  }

  init() {
    tx(this.db, () => {
      if (this.db.prepare('SELECT COUNT(*) c FROM members').get().c) return;
      this.db.prepare('INSERT INTO members (id, name, email, role) VALUES (?, ?, ?, ?)').run('m1', 'Captain', 'captain@local', 'Owner');
      this.db.prepare('INSERT INTO members (id, name, email, role) VALUES (?, ?, ?, ?)').run('fm', 'First mate', 'fm@local', 'Admin');
      this.db.prepare('INSERT INTO members (id, name, email, role) VALUES (?, ?, ?, ?)').run('m6', 'Marcus Lee', 'marcus@local', 'Member');
      this.db.prepare('INSERT INTO projects (id, key, name, status, lead) VALUES (?, ?, ?, ?, ?)').run('p8', 'PAY', 'payments-api', 'active', 'm6');
      this.db.prepare('INSERT INTO project_members (project, member) VALUES (?, ?)').run('p8', 'm6');
      this.db.prepare('INSERT INTO meta (k, v) VALUES (?, ?)').run('ready', '1');
    });
    return { ok: true, next: 'gr8r-axi task create --as fm --project PAY --title "..."' };
  }

  nextKey(projectId) {
    const p = this.db.prepare('SELECT key, seq FROM projects WHERE id = ? OR key = ?').get(projectId, projectId);
    if (!p) throw new Error(`no project ${projectId}`);
    const seq = p.seq + 1;
    this.db.prepare('UPDATE projects SET seq = ? WHERE key = ?').run(seq, p.key);
    return { project: p, key: p.key + '-' + seq };
  }

  createTask({ as, project, title, status = 'todo', assignee = null, priority = 'none', fmTask = null }) {
    const actor = this.actor(as);
    check('status', status);
    check('priority', priority);
    return tx(this.db, () => {
      const { project: p, key } = this.nextKey(project);
      this.can(actor, p.id);
      const taskId = id('t');
      const now = Date.now();
      this.db.prepare(`INSERT INTO tasks (id, key, project, title, status, assignee, priority, fm_task, created, updated)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(taskId, key, p.id, title, status, assignee, priority, fmTask, now, now);
      if (fmTask) this.out(fmTask, key, 'created');
      return { id: taskId, key, fm_task: fmTask, version: 1 };
    });
  }

  updateTask({ as, key, set = {}, expected }) {
    const actor = this.actor(as);
    const t = this.task(key);
    this.can(actor, t.project);
    if (expected != null && Number(expected) !== t.version) throw new Error(`409 version ${t.version}`);
    if (set.status) check('status', set.status);
    if (set.priority) check('priority', set.priority);
    return tx(this.db, () => {
      const fields = [];
      const vals = [];
      for (const [k, v] of Object.entries(set)) {
        const col = k === 'fmTask' ? 'fm_task' : k;
        if (!['status', 'assignee', 'priority', 'title', 'due', 'desc', 'fm_task'].includes(col)) continue;
        fields.push(`${col} = ?`);
        vals.push(v);
      }
      fields.push('version = version + 1', 'updated = ?');
      vals.push(Date.now(), t.id);
      this.db.prepare(`UPDATE tasks SET ${fields.join(', ')} WHERE id = ?`).run(...vals);
      if (t.fm_task) this.out(t.fm_task, t.key, 'updated');
      return this.task(key);
    });
  }

  deleteTask({ as, key }) {
    const actor = this.actor(as);
    const t = this.task(key);
    this.can(actor, t.project);
    return tx(this.db, () => {
      this.db.prepare('UPDATE tasks SET archived = 1, version = version + 1 WHERE id = ?').run(t.id);
      if (t.fm_task) this.out(t.fm_task, t.key, 'deleted');
      return { key: t.key, archived: true, fm_task: t.fm_task };
    });
  }

  out(fm, task, event) {
    this.db.prepare('INSERT INTO outbox (id, fm_task, task, event, at) VALUES (?, ?, ?, ?, ?)').run(id('e'), fm, task, event, Date.now());
  }

  task(key) {
    const t = this.db.prepare('SELECT * FROM tasks WHERE key = ? OR id = ?').get(key, key);
    if (!t) throw new Error(`no task ${key}`);
    return t;
  }

  listTasks(project) {
    return project
      ? this.db.prepare('SELECT key, title, status, assignee, fm_task, version, archived FROM tasks WHERE project = (SELECT id FROM projects WHERE key = ? OR id = ?)').all(project, project)
      : this.db.prepare('SELECT key, title, status, assignee, fm_task, version, archived FROM tasks').all();
  }

  ack(eventId) {
    tx(this.db, () => {
      this.db.prepare('UPDATE outbox SET acked = 1 WHERE id = ?').run(eventId);
      this.db.prepare('INSERT OR IGNORE INTO applied (id, at) VALUES (?, ?)').run(eventId, Date.now());
    });
    return { acked: eventId };
  }

  doctor() {
    const unlinked = this.db.prepare("SELECT key, title FROM tasks WHERE (fm_task IS NULL OR fm_task = '') AND archived = 0").all();
    const stalled = this.db.prepare('SELECT id, fm_task, task, event FROM outbox WHERE acked = 0').all();
    const bad = this.db.prepare("SELECT key, status FROM tasks WHERE status NOT IN ('backlog','todo','progress','review','done')").all();
    return { unlinked, stalled, bad, ok: !unlinked.length && !stalled.length && !bad.length };
  }

  setPath(path) {
    mkdirSync(path, { recursive: true });
    this.db.prepare('INSERT INTO meta (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v').run('files.path', path);
    return { 'files.path': path };
  }

  fileRoot() {
    return this.db.prepare("SELECT v FROM meta WHERE k = 'files.path'").get()?.v || null;
  }

  addFile({ as, project, task = null, path, name }) {
    const actor = this.actor(as);
    const root = this.fileRoot();
    if (!root) throw new Error('files.path is not set. Set it on the settings page.');
    const p = this.db.prepare('SELECT * FROM projects WHERE id = ? OR key = ?').get(project, project);
    if (!p) throw new Error(`no project ${project}`);
    this.can(actor, p.id);
    const fileId = id('f');
    const ext = extname(path);
    const label = (name || basename(path, ext)).replace(/[/\\]/g, '');
    const stored = `${fileId} - ${label}${ext}`;
    const dest = join(root, stored);
    copyFileSync(path, dest);
    this.db.prepare('INSERT INTO files (id, project, task, name, by, at, path) VALUES (?, ?, ?, ?, ?, ?, ?)').run(fileId, p.id, task, stored, actor.id, Date.now(), dest);
    return { id: fileId, name: stored, path: dest };
  }

  listFiles(project) {
    return project
      ? this.db.prepare('SELECT id, name, path, task FROM files WHERE project = (SELECT id FROM projects WHERE key = ? OR id = ?)').all(project, project)
      : this.db.prepare('SELECT id, name, path, task FROM files').all();
  }

  reset() {
    tx(this.db, () => {
      for (const t of ['tasks', 'comments', 'files', 'events', 'notifs', 'views', 'activity', 'outbox', 'applied', 'project_members', 'projects', 'members', 'meta']) {
        this.db.prepare(`DELETE FROM ${t}`).run();
      }
    });
    return this.init();
  }

  document() {
    const members = this.db.prepare('SELECT * FROM members').all();
    const projects = this.db.prepare('SELECT * FROM projects WHERE archived = 0').all().map(p => ({
      ...p,
      icon: 'zap',
      color: 'amber',
      fav: false,
      private: !!p.private,
      members: this.db.prepare('SELECT member FROM project_members WHERE project = ?').all(p.id).map(r => r.member),
      desc: '',
      milestones: [],
    }));
    const tasks = this.db.prepare('SELECT * FROM tasks WHERE archived = 0').all().map(t => ({
      ...t,
      labels: JSON.parse(t.labels || '[]'),
      deps: JSON.parse(t.deps || '[]'),
      subtasks: [],
      attachments: [],
      desc: t.desc || '',
      fav: false,
      recur: null,
    }));
    return {
      ws: { name: 'Gr8r Studio', url: 'gr8rstudio', c: '#1D1C1A', brand: true },
      me: 'm1',
      members,
      projects,
      tasks,
      comments: this.db.prepare('SELECT * FROM comments').all(),
      activity: this.db.prepare('SELECT * FROM activity ORDER BY at DESC LIMIT 50').all(),
      notifs: this.db.prepare('SELECT * FROM notifs').all(),
      files: this.db.prepare('SELECT * FROM files').all(),
      events: this.db.prepare('SELECT * FROM events').all(),
      projOrder: projects.map(p => p.id),
      savedViews: this.db.prepare('SELECT * FROM views').all(),
      recentSearches: [],
      filesPath: this.fileRoot(),
    };
  }
}
