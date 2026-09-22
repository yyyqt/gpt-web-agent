import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Runtime } from '../src/runtime.js';

async function fixture(t, options = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'web-agent-test-'));
  const r = new Runtime(root, options); await r.init();
  t.after(async () => { await r.close(); await fs.rm(root, { recursive: true, force: true }); });
  return r;
}
const code = expected => error => error.code === expected;

test('conflict-safe create, edit, concurrent writes and restart persistence', async t => {
  const r = await fixture(t);
  const first = await r.write({ path: 'src/demo.js', content: 'hello', expectedSha256: null });
  await assert.rejects(r.write({ path: 'src/demo.js', content: 'overwrite', expectedSha256: null }), code('CONFLICT'));
  const results = await Promise.allSettled(['A', 'B'].map(content => r.write({ path: 'src/demo.js', content, expectedSha256: first.sha256 })));
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(results.find(r => r.status === 'rejected').reason.code, 'CONFLICT');
  await r.saveTask({ id: 'demo', title: 'Demo', status: 'running', notes: 'test', expectedRevision: 0 });
  const restarted = new Runtime(r.root); await restarted.init();
  assert.equal((await restarted.tasks())[0].revision, 1);
  await assert.rejects(restarted.saveTask({ id: 'demo', title: 'Demo', status: 'completed', notes: '', expectedRevision: 0 }), code('CONFLICT'));
});

test('denies traversal, private files, symlink escapes, hardlinks and binary data', async t => {
  const r = await fixture(t);
  for (const p of ['../escape', 'a/../../escape', '.env', '.env.local', 'a/.git/config', '.web-agent/tasks.json', 'a/key.pem']) {
    await assert.rejects(r.resolve(p, { missing: true }), code('PATH_DENIED'));
  }
  for (const p of ['/etc/passwd', 'a\\b', 'a\0b']) await assert.rejects(r.resolve(p), code('INVALID_PATH'));
  await fs.symlink(os.tmpdir(), path.join(r.root, 'escape'));
  await assert.rejects(r.write({ path: 'escape/nope', content: 'x', expectedSha256: null }), code('SYMLINK_DENIED'));
  await fs.writeFile(path.join(r.root, 'real'), 'private');
  await fs.link(path.join(r.root, 'real'), path.join(r.root, 'alias'));
  await assert.rejects(r.file('alias'), code('HARDLINK_DENIED'));
  await fs.writeFile(path.join(r.root, 'binary'), Buffer.from([255, 0]));
  await assert.rejects(r.file('binary'), code('NOT_TEXT'));
  await fs.writeFile(path.join(r.root, 'huge'), Buffer.alloc(1048577));
  await assert.rejects(r.file('huge'), code('FILE_TOO_LARGE'));
});

test('read-only and exec opt-in enforced by runtime', async t => {
  const r = await fixture(t, { readOnly: true, allowHostExec: true });
  assert.equal(r.allowHostExec, false);
  await assert.rejects(r.write({ path: 'x', content: 'x', expectedSha256: null }), code('READ_ONLY'));
  await assert.rejects(r.startJob({ command: 'true' }), code('READ_ONLY'));
  const normal = await fixture(t);
  await assert.rejects(normal.startJob({ command: 'true' }), code('EXEC_DISABLED'));
});

test('search returns line evidence, skipped files and bounded results', async t => {
  const r = await fixture(t);
  await fs.writeFile(path.join(r.root, 'a.txt'), 'hello\nneedle here\nneedle again');
  await fs.writeFile(path.join(r.root, '.env'), 'needle secret');
  await fs.writeFile(path.join(r.root, 'b.bin'), Buffer.from([0, 255]));
  const result = await r.search({ query: 'needle' });
  assert.equal(result.hits.length, 2); assert.equal(result.hits[0].line, 2);
  assert.equal(result.skippedCount, 1);
  assert.equal((await r.search({ query: 'needle', limit: 1 })).truncated, true);
});

test('command success, failure, environment isolation, timeout, cancellation, bounded output', async t => {
  const r = await fixture(t, { allowHostExec: true });
  process.env.WEB_AGENT_TEST_SECRET = 'must-not-inherit';
  t.after(() => delete process.env.WEB_AGENT_TEST_SECRET);
  const j = await r.startJob({ command: 'printf "%s" "${WEB_AGENT_TEST_SECRET-unset}"; printf "err" >&2; exit 7' });
  await r.jobs.get(j.id).done;
  assert.equal(r.job(j.id).stdout, 'unset'); assert.equal(r.job(j.id).stderr, 'err');
  assert.equal(r.job(j.id).exitCode, 7); assert.equal(r.job(j.id).status, 'failed');
  const out = await r.startJob({ command: 'node -e "process.stdout.write(\'x\'.repeat(200000))"' });
  await r.jobs.get(out.id).done;
  assert.equal(r.job(out.id).stdout.length, 131072); assert.equal(r.job(out.id).truncated, true);
  const slow = await r.startJob({ command: 'sleep 30', timeoutSeconds: 1 });
  await r.jobs.get(slow.id).done; assert.equal(r.job(slow.id).status, 'timed_out');
  const cancelled = await r.startJob({ command: 'sleep 30' });
  r.stopJob(cancelled.id); await r.jobs.get(cancelled.id).done;
  assert.equal(r.job(cancelled.id).status, 'cancelled');
  const good = await r.startJob({ command: 'printf ok' }); await r.jobs.get(good.id).done;
  assert.equal(r.job(good.id).status, 'succeeded'); assert.equal(r.job(good.id).stdout, 'ok');
});

test('concurrent command cap and shutdown cleanup', async t => {
  const r = await fixture(t, { allowHostExec: true });
  const results = await Promise.allSettled([1, 2, 3].map(() => r.startJob({ command: 'sleep 30' })));
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 2);
  assert.equal(results.find(r => r.status === 'rejected').reason.code, 'BUSY');
  await r.close();
  assert.ok([...r.jobs.values()].every(j => j.status === 'cancelled'));
});

test('audit contains metadata only, unsafe state and corruption are explicit errors', async t => {
  const r = await fixture(t);
  await r.audit('read_file', 'succeeded');
  const entries = (await fs.readFile(path.join(r.state, 'audit.jsonl'), 'utf8')).trim().split('\n').map(JSON.parse);
  assert.deepEqual(Object.keys(entries[0]).sort(), ['outcome', 'time', 'tool']);
  await fs.writeFile(path.join(r.state, 'tasks.json'), '{broken');
  await assert.rejects(r.tasks(), SyntaxError);
  await fs.rm(path.join(r.state, 'audit.jsonl'));
  await fs.symlink(path.join(r.root, 'victim'), path.join(r.state, 'audit.jsonl'));
  await assert.rejects(r.audit('write_file', 'started'), code('UNSAFE_STATE'));
});

test('shutdown racing an in-flight start cannot create a surviving command', async t => {
  const r = await fixture(t, { allowHostExec: true });
  const original = r.resolve.bind(r);
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  r.resolve = async (...args) => { await gate; return original(...args); };
  const starting = r.startJob({ command: 'sleep 30' });
  await r.close(); release();
  await assert.rejects(starting, code('SHUTTING_DOWN'));
  assert.equal(r.jobs.size, 0);
});
