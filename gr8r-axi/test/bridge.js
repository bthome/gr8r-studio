import { spawn, execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { request } from 'node:http';
import { connect, createServer } from 'node:net';
import { networkInterfaces, tmpdir } from 'node:os';
import { join } from 'node:path';

const bin = new URL('../bin/gr8r-axi.js', import.meta.url).pathname;
const STUDIO = 'http://localhost:5173';
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

const freePort = () =>
  new Promise(resolve => {
    const s = createServer().listen(0, '127.0.0.1', () => {
      const { port } = s.address();
      s.close(() => resolve(port));
    });
  });

function send(port, { method = 'GET', path = '/store', headers = {}, body, host = '127.0.0.1' } = {}) {
  return new Promise((resolve, reject) => {
    const req = request({ host, port, method, path, headers }, res => {
      let text = '';
      res.on('data', c => (text += c));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, text }));
    });
    req.on('error', reject);
    req.setTimeout(3000, () => req.destroy(new Error('timeout')));
    if (body) req.write(body);
    req.end();
  });
}

// The bridge answers 413 and closes while a client may still be writing. Write in small steps and stop once a reply
// arrives, so the reply is read before a write can fail. A write error after that is expected; only the status counts.
function sendOversized(port, { chunked = false } = {}) {
  const body = Buffer.from('{"x":"' + 'a'.repeat(6 * 1024 * 1024) + '"}');
  const head = ['POST /sync HTTP/1.1', `Host: 127.0.0.1:${port}`, `Origin: ${STUDIO}`, 'Content-Type: application/json'];
  head.push(chunked ? 'Transfer-Encoding: chunked' : `Content-Length: ${body.length}`);
  return new Promise(resolve => {
    let text = '';
    const sock = connect(port, '127.0.0.1');
    sock.setTimeout(5000, () => sock.destroy());
    sock.on('data', c => (text += c));
    sock.on('error', () => {});
    sock.on('close', () => resolve({ status: Number(/^HTTP\/1\.1 (\d{3})/.exec(text)?.[1]) || undefined }));
    sock.on('connect', async () => {
      const step = () => new Promise(r => setTimeout(r, 1));
      sock.write(head.join('\r\n') + '\r\n\r\n');
      for (let i = 0; i < body.length && !text && !sock.destroyed; i += 64 * 1024) {
        await step();
        const piece = body.subarray(i, i + 64 * 1024);
        sock.write(chunked ? Buffer.concat([Buffer.from(piece.length.toString(16) + '\r\n'), piece, Buffer.from('\r\n')]) : piece);
      }
      if (!text && !sock.destroyed) sock.end(chunked ? '0\r\n\r\n' : '');
    });
  });
}

function setup() {
  const dir = mkdtempSync(join(tmpdir(), 'gr8r-bridge-'));
  const env = { ...process.env, GR8R_DB: join(dir, 'gr8r.db') };
  delete env.GR8R_PASSPHRASE;
  delete env.GR8R_ALLOWED_ORIGINS;
  delete env.GR8R_HOST;
  const axi = (...a) => JSON.parse(execFileSync('node', [bin, ...a], { env }).toString());
  const files = join(dir, 'files');
  mkdirSync(files);
  axi('init');
  axi('settings', 'set', '--path', files);
  writeFileSync(join(dir, 'kept.txt'), 'kept');
  writeFileSync(join(dir, 'gone.txt'), 'gone');
  const kept = axi('file', 'add', '--as', 'fm', '--project', 'PAY', '--path', join(dir, 'kept.txt')).id;
  const gone = axi('file', 'add', '--as', 'fm', '--project', 'PAY', '--path', join(dir, 'gone.txt'));
  rmSync(gone.path);
  return { env, kept, gone: gone.id };
}

async function serve(env, extra = {}) {
  const port = await freePort();
  const child = spawn('node', [bin, 'serve', '--port', String(port)], { env: { ...env, ...extra }, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = '';
  child.stdout.on('data', c => (log += c));
  child.stderr.on('data', c => (log += c));
  for (let i = 0; i < 50 && !/bridge/.test(log); i++) await new Promise(r => setTimeout(r, 100));
  await new Promise(r => setTimeout(r, 100));
  return { port, child, log: () => log };
}

const { env, kept, gone } = setup();

console.log('\nBridge');
const a = await serve(env);
const p = a.port;
const json = { origin: STUDIO, 'content-type': 'application/json' };

await check('serve --port is honored', async () => expect((await send(p, { headers: { origin: STUDIO } })).status, 200));
await check('the Studio origin gets its own origin back, no wildcard', async () => {
  const r = await send(p, { headers: { origin: STUDIO } });
  expect(r.headers['access-control-allow-origin'], STUDIO, 'allow-origin');
});
await check('127.0.0.1:5173 is allowed too', async () => expect((await send(p, { headers: { origin: 'http://127.0.0.1:5173' } })).status, 200));
await check('a request with no origin (CLI, curl) is allowed', async () => expect((await send(p)).status, 200));
await check('a foreign origin gets 403 and no CORS header', async () => {
  const r = await send(p, { headers: { origin: 'https://evil.example' } });
  expect(r.status, 403);
  expect(r.headers['access-control-allow-origin'], undefined, 'allow-origin');
});
await check('a foreign origin cannot POST /sync', async () =>
  expect((await send(p, { method: 'POST', path: '/sync', headers: { ...json, origin: 'https://evil.example' }, body: '{}' })).status, 403),
);
await check('a rebound host name gets 403', async () => expect((await send(p, { headers: { host: `evil.example:${p}` } })).status, 403));
await check('a request with no host header gets 403', async () => {
  const raw = await new Promise((resolve, reject) => {
    const sock = connect(p, '127.0.0.1', () => sock.end('GET /store HTTP/1.0\r\n\r\n'));
    let text = '';
    sock.on('data', c => (text += c));
    sock.on('end', () => resolve(text));
    sock.on('error', reject);
  });
  expect(raw.split(' ')[1], '403');
});
await check('text/plain POST gets 415', async () =>
  expect((await send(p, { method: 'POST', path: '/sync', headers: { origin: STUDIO, 'content-type': 'text/plain' }, body: '{}' })).status, 415),
);
await check('an oversized body gets 413', async () => expect((await sendOversized(p)).status, 413));
await check('an oversized chunked body gets 413', async () => expect((await sendOversized(p, { chunked: true })).status, 413));
await check('a JSON POST /sync still works', async () => {
  const doc = JSON.parse((await send(p)).text);
  expect((await send(p, { method: 'POST', path: '/sync', headers: json, body: JSON.stringify(doc) })).status, 200);
});
await check('a stored file is served with a content type', async () => {
  const r = await send(p, { path: `/files/${kept}`, headers: { origin: STUDIO } });
  expect(r.status, 200);
  expect(r.text, 'kept', 'body');
  expect(r.headers['content-type'], 'text/plain; charset=utf-8', 'content-type');
});
await check('a file missing on disk gets 404', async () => expect((await send(p, { path: `/files/${gone}`, headers: { origin: STUDIO } })).status, 404));
await check('the bridge is still up after the missing file', async () => expect((await send(p)).status, 200));
await check('an unknown file id gets 404', async () => expect((await send(p, { path: '/files/nope' })).status, 404));
await check('the bind defaults to 127.0.0.1', async () => {
  const lan = Object.values(networkInterfaces())
    .flat()
    .find(i => i.family === 'IPv4' && !i.internal);
  if (!lan) throw new Error('no non-loopback IPv4 address to probe from');
  expect((await send(p)).status, 200, 'loopback status');
  const r = await send(p, { host: lan.address }).catch(e => ({ status: e.code }));
  expect(r.status, 'ECONNREFUSED', `request to ${lan.address}`);
});
a.child.kill();

console.log('\nPassphrase');
const b = await serve(env, { GR8R_PASSPHRASE: 's3cret' });
const q = b.port;
await check('no passphrase gets 401', async () => expect((await send(q, { headers: { origin: STUDIO } })).status, 401));
await check('a wrong passphrase gets 401', async () => expect((await send(q, { headers: { origin: STUDIO, 'x-gr8r-passphrase': 's3cre' } })).status, 401));
await check('the right passphrase gets 200', async () => expect((await send(q, { headers: { origin: STUDIO, 'x-gr8r-passphrase': 's3cret' } })).status, 200));
await check('a CORS preflight from the Studio passes without it', async () => {
  const r = await send(q, {
    method: 'OPTIONS',
    path: '/sync',
    headers: { origin: STUDIO, 'access-control-request-method': 'POST', 'access-control-request-headers': 'content-type,x-gr8r-passphrase' },
  });
  expect(r.status, 204);
  if (!/x-gr8r-passphrase/.test(r.headers['access-control-allow-headers'] || '')) throw new Error('passphrase header not allowed');
});
b.child.kill();

console.log(failed ? `\n${failed} failed\n` : '\nall bridge checks passed\n');
process.exit(failed ? 1 : 0);
