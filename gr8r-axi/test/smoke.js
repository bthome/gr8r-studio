import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { open } from '../src/db.js';
import { Store } from '../src/store.js';

const db = open(join(mkdtempSync(join(tmpdir(), 'gr8r-')), 't.db'));
const s = new Store(db);
s.init();
const t = s.createTask({ as: 'fm', project: 'PAY', title: 'Scale', fmTask: 'fm-1' });
if (!t.key.startsWith('PAY-')) throw new Error('key');
let denied = false;
try {
  s.updateTask({ as: 'm6', key: t.key, set: { status: 'nope' } });
} catch {
  denied = true;
}
if (!denied) throw new Error('catalog');
const doc = s.document();
if (!doc.tasks.length) throw new Error('bridge');
const d = s.doctor();
if (d.stalled.length !== 1) throw new Error('outbox');
console.log('ok', t.key);
