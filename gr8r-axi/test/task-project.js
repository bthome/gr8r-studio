import process from 'node:process';
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const bin = new URL('../bin/gr8r-axi.js', import.meta.url).pathname;
const env = { ...process.env, GR8R_DB: join(mkdtempSync(join(tmpdir(), 'gr8r-task-')), 'gr8r.db') };
const axi = (...a) => {
  try {
    return JSON.parse(execFileSync('node', [bin, ...a], { env, stdio: ['ignore', 'pipe', 'pipe'] }).toString());
  } catch (err) {
    return JSON.parse(err.stderr.toString());
  }
};
let failed = 0;
function check(name, fn) {
  try {
    fn();
    console.log(`  ok   ${name}`);
  } catch (err) {
    failed++;
    console.log(`  FAIL ${name} — ${err.message}`);
  }
}

console.log('\nTask create keeps its project');
axi('init');
const pay = 'p8';
const byFm = axi('task', 'create', '--as', 'fm', '--project', 'PAY', '--title', 'from first mate');
check('task create by an admin stores the project id', () => {
  const t = axi('task', 'view', byFm.key);
  if (t.project !== pay) throw new Error(`project is ${t.project}`);
});
const byMember = axi('task', 'create', '--as', 'm6', '--project', 'PAY', '--title', 'from a member');
check('a project member can create a task', () => {
  if (byMember.error) throw new Error(byMember.error);
});
check('the member task stores the project id', () => {
  if (axi('task', 'view', byMember.key).project !== pay) throw new Error('wrong project');
});
check('a non-member is still refused', () => {
  axi('project', 'create', '--as', 'fm', '--name', 'Ops', '--key', 'OPS');
  const r = axi('task', 'create', '--as', 'm6', '--project', 'OPS', '--title', 'nope');
  if (!/cannot write p_/.test(r.error || '')) throw new Error(r.error || `created ${r.key}`);
});
const { open } = await import('../src/db.js');
const { Store } = await import('../src/store.js');
const doc = new Store(open(env.GR8R_DB)).document();
check('every document task points at a project in the document', () => {
  const ids = new Set(doc.projects.map(p => p.id));
  const orphans = doc.tasks.filter(t => !ids.has(t.project)).map(t => t.key);
  if (orphans.length) throw new Error(`orphans ${orphans.join(', ')}`);
  if (doc.tasks.filter(t => t.project === pay).length !== 2) throw new Error('PAY does not have both tasks');
});

console.log(failed ? `\n${failed} failed\n` : '\nall task-project checks passed\n');
process.exit(failed ? 1 : 0);
