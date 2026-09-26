import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Runtime } from '../src/runtime.js';
import { delayCommand, nodeCommand } from './support.js';

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
  for (const p of ['../escape', 'a/../../escape', '.env', '.env.local', '.dev.vars', '.dev.vars.production', '.wrangler/state/db', '.codex/auth.json', 'a/.git/config', '.web-agent/tasks.json', 'a/key.pem']) {
    await assert.rejects(r.resolve(p, { missing: true }), code('PATH_DENIED'));
  }
  for (const p of ['/etc/passwd', 'a\\b', 'a\0b']) await assert.rejects(r.resolve(p), code('INVALID_PATH'));
  await fs.symlink(os.tmpdir(), path.join(r.root, 'escape'), process.platform === 'win32' ? 'junction' : undefined);
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
  const j = await r.startJob({ command: nodeCommand("process.stdout.write(process.env.WEB_AGENT_TEST_SECRET ?? 'unset'); process.stderr.write('err'); process.exit(7)") });
  await r.jobs.get(j.id).done;
  assert.equal(r.job(j.id).stdout, 'unset'); assert.equal(r.job(j.id).stderr, 'err');
  assert.equal(r.job(j.id).exitCode, 7); assert.equal(r.job(j.id).status, 'failed');
  const out = await r.startJob({ command: 'node -e "process.stdout.write(\'x\'.repeat(200000))"' });
  await r.jobs.get(out.id).done;
  assert.equal(r.job(out.id).stdout.length, 131072); assert.equal(r.job(out.id).truncated, true);
  const slow = await r.startJob({ command: delayCommand(30000), timeoutSeconds: 1 });
  await r.jobs.get(slow.id).done; assert.equal(r.job(slow.id).status, 'timed_out');
  const cancelled = await r.startJob({ command: delayCommand(30000) });
  r.stopJob(cancelled.id); await r.jobs.get(cancelled.id).done;
  assert.equal(r.job(cancelled.id).status, 'cancelled');
  const good = await r.startJob({ command: nodeCommand("process.stdout.write('ok')") }); await r.jobs.get(good.id).done;
  assert.equal(r.job(good.id).status, 'succeeded'); assert.equal(r.job(good.id).stdout, 'ok');
});

test('concurrent cap, FIFO queue, cancellation and shutdown cleanup', async t => {
  const r = await fixture(t, { allowHostExec: true, limits: { concurrency: 1 } });
  const first = await r.startJob({ command: delayCommand(30000) });
  const second = await r.startJob({ command: nodeCommand("process.stdout.write('second')") });
  const third = await r.startJob({ command: nodeCommand("process.stdout.write('third')") });
  assert.equal(r.job(first.id).status, 'running');
  assert.equal(r.job(second.id).status, 'queued');
  r.stopJob(first.id);
  await r.jobs.get(second.id).done; await r.jobs.get(third.id).done;
  assert.equal(r.job(second.id).stdout, 'second');
  assert.equal(r.job(third.id).stdout, 'third');
  const fourth = await r.startJob({ command: delayCommand(30000) });
  const fifth = await r.startJob({ command: nodeCommand("require('node:fs').writeFileSync('must-not-run', '')") });
  await r.close();
  assert.equal(r.job(fourth.id).status, 'cancelled');
  assert.equal(r.job(fifth.id).status, 'cancelled');
  await assert.rejects(fs.stat(path.join(r.root, 'must-not-run')), { code: 'ENOENT' });
});

test('audit contains metadata only, unsafe state and corruption are explicit errors', async t => {
  const r = await fixture(t);
  await r.audit('read_file', 'succeeded');
  const entries = (await fs.readFile(path.join(r.state, 'audit.jsonl'), 'utf8')).trim().split('\n').map(JSON.parse);
  assert.deepEqual(Object.keys(entries[0]).sort(), ['outcome', 'time', 'tool']);
  await fs.writeFile(path.join(r.state, 'tasks.json'), '{broken');
  await assert.rejects(r.tasks(), SyntaxError);
  await fs.rm(path.join(r.state, 'audit.jsonl'));
  if (process.platform === 'win32') { await fs.writeFile(path.join(r.root, 'victim'), 'private'); await fs.link(path.join(r.root, 'victim'), path.join(r.state, 'audit.jsonl')); }
  else await fs.symlink(path.join(r.root, 'victim'), path.join(r.state, 'audit.jsonl'));
  await assert.rejects(r.audit('write_file', 'started'), code('UNSAFE_STATE'));
});

test('shutdown racing an in-flight start cannot create a surviving command', async t => {
  const r = await fixture(t, { allowHostExec: true });
  const original = r.resolve.bind(r);
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  r.resolve = async (...args) => { await gate; return original(...args); };
  const starting = r.startJob({ command: delayCommand(30000) });
  await r.close(); release();
  await assert.rejects(starting, code('SHUTTING_DOWN'));
  assert.equal(r.jobs.size, 0);
});

test('configured limits enforce runtime boundaries and results survive restart', async t => {
  assert.throws(() => new Runtime('/tmp', { limits: { concurrency: 0 } }), code('INVALID_LIMIT'));
  const r = await fixture(t, { allowHostExec: true, limits: { concurrency: 1, timeoutSeconds: 3600, fileBytes: 2097152, outputBytes: 262144 } });
  await r.write({ path: 'large.txt', content: 'x'.repeat(1100000), expectedSha256: null });
  const j = await r.startJob({ command: nodeCommand("process.stdout.write('persisted')"), timeoutSeconds: 1200 });
  await r.jobs.get(j.id).done;
  await r.close();
  const next = new Runtime(r.root); await next.init();
  assert.equal(next.job(j.id).stdout, 'persisted');
  assert.equal(next.listJobs()[0].status, 'succeeded');
  const persisted = await fs.stat(path.join(r.state, `job-${j.id}.json`));
  assert.equal(persisted.isFile(), true);
  if (process.platform !== 'win32') assert.equal(persisted.mode & 0o777, 0o600);
  await assert.rejects(r.startJob({ command: 'true', timeoutSeconds: 3601 }), code('INVALID_TIMEOUT'));
  await next.close();
});

test('Codex delegation uses stdin, workspace sandbox and explicit opt-in', { skip: process.platform === 'win32' }, async t => {
  const r = await fixture(t, { allowCodex: true });
  const fake = path.join(r.root, 'fake-codex');
  await fs.writeFile(fake, '#!/bin/sh\nprintf "%s\\n" "$@"\ncat\n', { mode: 0o700 });
  r.codexBinary = fake;
  await assert.rejects(r.startCodex({ prompt: 'not authorized' }), code('DELEGATION_NOT_REQUESTED'));
  const prompt = 'Do not execute $(touch injected) or `touch injected2`';
  const j = await r.startCodex({ prompt, userRequestedDelegation: true }); await r.jobs.get(j.id).done;
  assert.equal(r.job(j.id).status, 'succeeded');
  assert.match(r.job(j.id).stdout, /--sandbox\nworkspace-write/);
  assert.ok(r.job(j.id).stdout.endsWith(prompt));
  await assert.rejects(fs.stat(path.join(r.root, 'injected')), { code: 'ENOENT' });
  await assert.rejects(r.startJob({ command: 'true' }), code('EXEC_DISABLED'));
  const off = await fixture(t); await assert.rejects(off.startCodex({ prompt: 'hi' }), code('CODEX_DISABLED'));
  r.codexBinary = path.join(r.root, 'absent');
  const bad = await r.startCodex({ prompt: 'hi', userRequestedDelegation: true }); await r.jobs.get(bad.id).done;
  assert.equal(r.job(bad.id).status, 'failed');
});

test('unfinished saved jobs recover as interrupted, never rerun or signal stale PIDs', async t => {
  const r = await fixture(t, { allowHostExec: true });
  const j = await r.startJob({ command: nodeCommand("process.stdout.write('done')") }); await r.jobs.get(j.id).done; await r.close();
  const p = path.join(r.state, `job-${j.id}.json`);
  const saved = JSON.parse(await fs.readFile(p, 'utf8')); saved.status = 'running'; await fs.writeFile(p, JSON.stringify(saved));
  const next = new Runtime(r.root); await next.init();
  assert.equal(next.job(j.id).status, 'interrupted');
  assert.match(next.job(j.id).recoveryNote, /No automatic retry/);
  next.stopJob(j.id); await next.close();
});

test('default runs four jobs and queues the fifth; queued cancellation never launches', async t => {
  const r = await fixture(t, { allowHostExec: true });
  const jobs = await Promise.all(Array.from({ length: 5 }, () => r.startJob({ command: delayCommand(30000) })));
  assert.equal(jobs.filter(j => j.status === 'running').length, 4);
  assert.equal(jobs.filter(j => j.status === 'queued').length, 1);
  const queued = jobs.find(j => j.status === 'queued');
  r.stopJob(queued.id); await r.jobs.get(queued.id).done;
  assert.equal(r.job(queued.id).startedAt, null);
  assert.equal(r.job(queued.id).status, 'cancelled');
});

test('execution timeout begins on launch, not while queued', async t => {
  const r = await fixture(t, { allowHostExec: true, limits: { concurrency: 1 } });
  const first = await r.startJob({ command: delayCommand(1200), timeoutSeconds: 3 });
  const second = await r.startJob({ command: nodeCommand("process.stdout.write('after-wait')"), timeoutSeconds: 1 });
  assert.equal(second.status, 'queued');
  await r.jobs.get(first.id).done; await r.jobs.get(second.id).done;
  assert.equal(r.job(second.id).status, 'succeeded');
  assert.equal(r.job(second.id).stdout, 'after-wait');
});
