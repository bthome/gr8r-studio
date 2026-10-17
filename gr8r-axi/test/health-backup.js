import { spawn, execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { request } from 'node:http';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { gunzipSync } from 'node:zlib';
import { join } from 'node:path';
import Database from 'better-sqlite3';

const bin = new URL('../bin/gr8r-axi.js', import.meta.url).pathname;
let failed = 0;

async function check(name, fn) {
  try {
    await fn();
    console.log(`  ok   ${name}`);
  } catch (err) {
    failed++;
    console.log(`  FAIL ${name} — ${err.message}`);
  }
}
const expect = (actual, want, what = 'status') => {
  if (actual !== want) throw new Error(`${what} ${actual}, want ${want}`);
};
const sleep = ms => new Promise(r => setTimeout(r, ms));

const freePort = () =>
  new Promise(resolve => {
    const s = createServer().listen(0, '127.0.0.1', () => {
      const { port } = s.address();
      s.close(() => resolve(port));
    });
  });

function send(port, { path = '/health', headers = {}, host = '127.0.0.1' } = {}) {
  return new Promise((resolve, reject) => {
    const req = request({ host, port, path, headers }, res => {
      let text = '';
      res.on('data', c => (text += c));
      res.on('end', () => resolve({ status: res.statusCode, text }));
    });
    req.on('error', reject);
    req.setTimeout(3000, () => req.destroy(new Error('timeout')));
    req.end();
  });
}

function setup(extra = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'gr8r-backup-'));
  const env = { ...process.env, GR8R_DB: join(dir, 'gr8r.db'), ...extra };
  for (const k of ['GR8R_PASSPHRASE', 'GR8R_ALLOWED_ORIGINS', 'GR8R_HOST', 'GR8R_BACKUP_DIR', 'GR8R_BACKUP_KEEP', 'GR8R_AUTO_BACKUP'])
    if (!(k in extra)) delete env[k];
  const run = (...a) => {
    try {
      return JSON.parse(execFileSync('node', [bin, ...a], { env, stdio: ['ignore', 'pipe', 'pipe'] }).toString());
    } catch (err) {
      return JSON.parse(err.stderr.toString() || '{"error":"no output"}');
    }
  };
  run('init');
  return { dir, env, run, backups: join(dir, 'backups') };
}

async function serve(env, extra = {}) {
  const port = await freePort();
  const child = spawn('node', [bin, 'serve', '--port', String(port)], { env: { ...env, ...extra }, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = '';
  child.stdout.on('data', c => (log += c));
  child.stderr.on('data', c => (log += c));
  for (let i = 0; i < 50 && !/bridge http/.test(log); i++) await sleep(100);
  await sleep(100);
  const stop = () => new Promise(r => (child.exitCode !== null ? r() : (child.once('exit', r), child.kill())));
  return { port, child, stop, log: () => log };
}

const titles = file => {
  const db = new Database(file, { readonly: true, fileMustExist: true });
  try {
    return db.prepare('SELECT title FROM tasks').pluck().all();
  } finally {
    db.close();
  }
};
const list = dir =>
  existsSync(dir)
    ? readdirSync(dir)
        .filter(n => n.endsWith('.db'))
        .sort()
    : [];

console.log('\nHealth');
{
  const { env, dir } = setup({ GR8R_AUTO_BACKUP: 'off' });
  const a = await serve(env, { GR8R_PASSPHRASE: 'pw-for-test' });
  await check('GET /health answers 200 ok without the passphrase', async () => {
    const r = await send(a.port);
    expect(r.status, 200);
    const body = JSON.parse(r.text);
    expect(body.ok, true, 'ok');
    expect(body.db, 'ok', 'db');
    expect(typeof body.uptimeSec, 'number', 'uptimeSec');
    expect(typeof body.version, 'string', 'version');
  });
  await check('/health returns no board data', async () => {
    const body = JSON.parse((await send(a.port)).text);
    expect(Object.keys(body).sort().join(','), 'db,ok,uptimeSec,version', 'keys');
  });
  await check('/store still needs the passphrase', async () => expect((await send(a.port, { path: '/store' })).status, 401));
  await check('/health still enforces the Host check', async () => expect((await send(a.port, { headers: { host: `evil.example:${a.port}` } })).status, 403));
  await check('/health still enforces the origin rules', async () => expect((await send(a.port, { headers: { origin: 'https://evil.example' } })).status, 403));
  await check('/health answers 503 when the database file is gone', async () => {
    rmSync(join(dir, 'gr8r.db'));
    const r = await send(a.port);
    expect(r.status, 503);
    const body = JSON.parse(r.text);
    expect(body.ok, false, 'ok');
    if (body.db === 'ok') throw new Error('db still reported ok');
  });
  await check('the bridge is still up after an unhealthy check', async () => expect((await send(a.port)).status, 503));
  await a.stop();
}

console.log('\nBackup');
{
  const { env, run, dir, backups } = setup();
  await check('axi backup writes a timestamped copy into backups/ next to the database', async () => {
    const r = run('backup', '--json');
    if (r.error) throw new Error(r.error);
    expect(list(backups).length, 1, 'backups');
    if (!/^gr8r-\d{4}-\d\d-\d\dT\d\d-\d\d-\d\d-\d{3}Z.*\.db$/.test(list(backups)[0])) throw new Error(`name ${list(backups)[0]}`);
    expect(r.file, join(backups, list(backups)[0]), 'reported file');
  });
  await check('a backup taken during concurrent writes opens cleanly and has the data', async () => {
    const writer = new Database(join(dir, 'gr8r.db'));
    writer.pragma('busy_timeout = 5000');
    const ins = writer.prepare("INSERT INTO tasks (id, key, project, title, status) VALUES (?, ?, 'p8', ?, 'todo')");
    for (let i = 0; i < 200; i++) ins.run(`seed-${i}`, `SEED-${i}`, `seed ${i}`);
    let n = 0;
    let stop = false;
    const loop = (async () => {
      while (!stop) {
        ins.run(`w-${n}`, `W-${n}`, `write ${n}`);
        n++;
        await sleep(0);
      }
    })();
    const child = spawn('node', [bin, 'backup', '--json'], { env, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    child.stdout.on('data', c => (out += c));
    await new Promise(r => child.on('exit', r));
    stop = true;
    await loop;
    writer.close();
    expect(child.exitCode, 0, 'exit code');
    const file = JSON.parse(out).file;
    const copy = new Database(file, { readonly: true, fileMustExist: true });
    expect(copy.pragma('integrity_check', { simple: true }), 'ok', 'integrity');
    copy.close();
    const t = titles(file);
    for (let i = 0; i < 200; i++) if (!t.includes(`seed ${i}`)) throw new Error(`seed ${i} missing`);
    if (n < 1) throw new Error('no concurrent writes happened');
  });
  await check('pruning keeps exactly GR8R_BACKUP_KEEP newest', async () => {
    for (const k of ['2020-01-01T00-00-00-000Z', '2020-01-02T00-00-00-000Z', '2020-01-03T00-00-00-000Z']) writeFileSync(join(backups, `gr8r-${k}.db`), '');
    writeFileSync(join(backups, 'notes.txt'), 'not a backup');
    const before = list(backups);
    const env3 = { ...env, GR8R_BACKUP_KEEP: '3' };
    const r = JSON.parse(execFileSync('node', [bin, 'backup', '--json'], { env: env3 }).toString());
    const after = list(backups);
    expect(after.length, 3, 'kept');
    const want = [...before, r.file.split('/').pop()].sort().slice(-3);
    expect(after.join(), want.join(), 'kept files');
    if (!existsSync(join(backups, 'notes.txt'))) throw new Error('pruned a file that is not a backup');
  });
  await check('GR8R_BACKUP_DIR moves the backups', async () => {
    const other = join(dir, 'elsewhere');
    const r = JSON.parse(execFileSync('node', [bin, 'backup', '--json'], { env: { ...env, GR8R_BACKUP_DIR: other } }).toString());
    if (!r.file.startsWith(other + '/')) throw new Error(`wrote ${r.file}`);
  });
}

console.log('\nFinding backups');
{
  const { env, run, backups } = setup({ GR8R_AUTO_BACKUP: 'off' });
  const text = (...a) =>
    execFileSync('node', [bin, ...a], { env })
      .toString()
      .trim()
      .split('\n');
  await check('axi backup prints the new path as its last line', async () => {
    const lines = text('backup');
    const last = lines[lines.length - 1];
    if (!last.startsWith(backups + '/') || !existsSync(last)) throw new Error(`last line ${last}`);
  });
  await check('axi backup --list shows backups newest first with size and time', async () => {
    await sleep(5);
    run('backup', '--json');
    const all = run('backup', '--list', '--json');
    expect(all.length, 2, 'listed');
    if (!(all[0].file > all[1].file)) throw new Error('not newest first');
    for (const b of all) if (!(b.bytes > 0) || Number.isNaN(Date.parse(b.at))) throw new Error(`bad entry ${JSON.stringify(b)}`);
    const lines = text('backup', '--list');
    expect(lines.length, 2, 'text lines');
    if (!lines[0].endsWith(all[0].file)) throw new Error(`first line ${lines[0]}`);
  });
}

console.log('\nExport');
{
  const { env, run, dir } = setup({ GR8R_AUTO_BACKUP: 'off' });
  const task = run('task', 'create', '--as', 'fm', '--project', 'PAY', '--title', 'export round trip', '--fm_task', 'fm-export-1');
  run('comment', 'add', '--as', 'fm', '--task', task.key, '--text', 'synthetic comment');
  const raw = new Database(join(dir, 'gr8r.db'));
  raw.exec('CREATE TABLE blobs (id TEXT PRIMARY KEY, data BLOB)');
  raw.prepare('INSERT INTO blobs VALUES (?, ?)').run('b1', Buffer.from([0, 1, 2, 255]));
  const counts = Object.fromEntries(
    raw
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
      .pluck()
      .all()
      .map(t => [t, raw.prepare(`SELECT count(*) FROM "${t}"`).pluck().get()]),
  );
  const seeded = raw.prepare('SELECT * FROM tasks WHERE key = ?').get(task.key);
  raw.close();
  let doc;
  let r;
  await check('axi export writes a gzip file into exports/ that gunzips to valid JSON', async () => {
    r = run('export', '--json');
    if (r.error) throw new Error(r.error);
    if (!r.file.startsWith(join(dir, 'exports') + '/') || !r.file.endsWith('.json.gz')) throw new Error(`file ${r.file}`);
    doc = JSON.parse(gunzipSync(readFileSync(r.file)).toString('utf8'));
    expect(doc.format, 'gr8r-export', 'format');
    expect(doc.version, 1, 'version');
    if (Number.isNaN(Date.parse(doc.exportedAt))) throw new Error('exportedAt');
  });
  await check('every table is exported with matching row counts', async () => {
    expect(Object.keys(doc.tables).sort().join(), Object.keys(counts).sort().join(), 'tables');
    for (const [t, n] of Object.entries(counts)) expect(doc.tables[t].length, n, `${t} rows`);
    for (const t of ['members', 'projects', 'tasks', 'comments', 'outbox']) if (!doc.tables[t].length) throw new Error(`${t} is empty`);
  });
  await check('a seeded task round-trips exactly', async () => {
    const got = doc.tables.tasks.find(t => t.key === task.key);
    expect(JSON.stringify(got), JSON.stringify(seeded), 'task');
    if (!doc.tables.comments.some(c => c.task === seeded.id && c.text === 'synthetic comment')) throw new Error('comment missing');
  });
  await check('BLOBs are exported as base64', async () => {
    const b = doc.tables.blobs.find(x => x.id === 'b1');
    expect(Buffer.from(b.data.$base64, 'base64').toString('hex'), '000102ff', 'blob');
  });
  await check('export --out writes where asked and prints the path', async () => {
    const out = join(dir, 'custom', 'board.json.gz');
    const lines = execFileSync('node', [bin, 'export', '--out', out], { env }).toString().trim().split('\n');
    expect(lines[lines.length - 1], out, 'printed path');
    JSON.parse(gunzipSync(readFileSync(out)).toString('utf8'));
  });
}

console.log('\nAutomatic backup');
{
  const { env, backups } = setup();
  const a = await serve(env);
  await check('the bridge backs up on start', async () => {
    for (let i = 0; i < 20 && !list(backups).length; i++) await sleep(100);
    expect(list(backups).length, 1, 'backups');
  });
  await a.stop();
  const b = await serve(env);
  await check('a restart within a day does not add another automatic backup', async () => {
    await sleep(300);
    expect(list(backups).length, 1, 'backups');
  });
  await b.stop();
  const c = setup({ GR8R_AUTO_BACKUP: 'off' });
  const d = await serve(c.env);
  await check('GR8R_AUTO_BACKUP=off turns it off', async () => {
    await sleep(300);
    expect(list(c.backups).length, 0, 'backups');
  });
  await d.stop();
  const e = setup();
  writeFileSync(join(e.dir, 'not-a-dir'), '');
  const f = await serve(e.env, { GR8R_BACKUP_DIR: join(e.dir, 'not-a-dir', 'backups') });
  await check('a failed automatic backup is logged and the bridge keeps serving', async () => {
    await sleep(300);
    expect((await send(f.port)).status, 200);
    if (!/backup failed/.test(f.log())) throw new Error('no log line');
  });
  await f.stop();
}

console.log('\nRestore');
{
  const { env, run, dir, backups } = setup({ GR8R_AUTO_BACKUP: 'off' });
  run('task', 'create', '--as', 'fm', '--project', 'PAY', '--title', 'before backup');
  const snap = run('backup', '--json').file;
  run('task', 'create', '--as', 'fm', '--project', 'PAY', '--title', 'after backup');
  await check('restore refuses a file that is not a SQLite database', async () => {
    writeFileSync(join(dir, 'junk.db'), 'not sqlite');
    const r = run('restore', join(dir, 'junk.db'));
    if (!/not a readable/.test(r.error || '')) throw new Error(r.error || 'restored junk');
    if (!titles(join(dir, 'gr8r.db')).includes('after backup')) throw new Error('database changed');
  });
  await check('restore refuses a SQLite file without the board tables', async () => {
    const other = new Database(join(dir, 'other.db'));
    other.exec('CREATE TABLE x (a)');
    other.close();
    const r = run('restore', join(dir, 'other.db'));
    if (!/missing tables/.test(r.error || '')) throw new Error(r.error || 'restored a foreign db');
  });
  await check('restore refuses while the bridge is running on that database', async () => {
    const a = await serve(env);
    const r = run('restore', snap);
    await a.stop();
    if (!/bridge/.test(r.error || '')) throw new Error(r.error || 'restored under a running bridge');
    if (!titles(join(dir, 'gr8r.db')).includes('after backup')) throw new Error('database changed');
  });
  await check('restore round-trips and keeps a pre-restore backup', async () => {
    const r = run('restore', snap);
    if (r.error) throw new Error(r.error);
    const now = titles(join(dir, 'gr8r.db'));
    if (!now.includes('before backup') || now.includes('after backup')) throw new Error(`titles ${now.join('|')}`);
    const pre = list(backups).find(n => n.includes('pre-restore'));
    if (!pre) throw new Error('no pre-restore backup');
    expect(r.preRestore, join(backups, pre), 'reported pre-restore');
    if (!titles(r.preRestore).includes('after backup')) throw new Error('pre-restore backup lacks the newer task');
  });
  await check('the pre-restore backup undoes the restore', async () => {
    const pre = list(backups).find(n => n.includes('pre-restore'));
    const r = run('restore', join(backups, pre));
    if (r.error) throw new Error(r.error);
    if (!titles(join(dir, 'gr8r.db')).includes('after backup')) throw new Error('undo failed');
  });
  await check('the CLI works on the restored database', async () => {
    const t = run('task', 'create', '--as', 'fm', '--project', 'PAY', '--title', 'after restore');
    if (t.error) throw new Error(t.error);
    expect(run('doctor').error, undefined, 'doctor error');
  });
}

console.log(failed ? `\n${failed} failed\n` : '\nall health and backup checks passed\n');
process.exit(failed ? 1 : 0);
