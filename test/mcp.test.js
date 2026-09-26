import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import net from 'node:net';
import { request } from 'node:http';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { stateBase } from '../src/operator.js';
import { cwdCommand, writeLaterCommand } from './support.js';

async function stopServer(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const stopped = once(child, 'exit');
  if (process.platform === 'win32') {
    const result = spawnSync('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, timeout: 10000 });
    if (result.error || result.status !== 0) child.kill();
  } else child.kill('SIGTERM');
  await stopped;
}

const cli = fileURLToPath(new URL('../src/cli.js', import.meta.url));
async function workspace(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'bridge-mcp-'));
  t.after(() => fs.rm(root, { recursive: true, force: true })); return root;
}
const data = r => { assert.ok(!r.isError, JSON.stringify(r)); return JSON.parse(r.content[0].text); };
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function exercise(client, root) {
  const tools = (await client.listTools()).tools;
  assert.equal(tools.length, 14);
  const image = tools.find(t => t.name === 'import_image');
  assert.deepEqual(image._meta['openai/fileParams'], ['file']);
  assert.deepEqual(image.inputSchema.properties.file.required, ['download_url', 'file_id']);
  assert.equal(tools.find(t => t.name === 'start_command').annotations.readOnlyHint, false);
  const info = data(await client.callTool({ name: 'workspace_info', arguments: {} }));
  assert.equal(info.sandboxed, false); assert.equal(info.hostExecution, true);
  assert.equal(info.platform, process.platform); assert.equal(info.architecture, process.arch);
  // Real agent-shaped loop: create buggy program + test, observe failure, edit, rerun.
  await client.callTool({ name: 'write_file', arguments: { path: 'sum.cjs', content: 'module.exports = (a, b) => a - b;', expectedSha256: null } });
  await client.callTool({ name: 'write_file', arguments: { path: 'sum.test.cjs', content: "require('node:assert/strict').equal(require('./sum.cjs')(2, 3), 5);", expectedSha256: null } });
  const run = async () => {
    const started = data(await client.callTool({ name: 'start_command', arguments: { command: 'node sum.test.cjs', timeoutSeconds: 10 } }));
    for (let i = 0; i < 100; i++) {
      const result = data(await client.callTool({ name: 'get_command', arguments: { id: started.id } }));
      if (result.status !== 'running') return result;
      await sleep(25);
    }
    assert.fail('Command did not finish');
  };
  const failed = await run(); assert.equal(failed.status, 'failed'); assert.notEqual(failed.exitCode, 0);
  const page = data(await client.callTool({ name: 'read_command_output', arguments: { id: failed.id, stream: 'stderr', limit: 20 } }));
  assert.equal(page.output.length, 20); assert.equal(page.hasMore, true);
  const status = data(await client.callTool({ name: 'get_command', arguments: { id: failed.id, includeOutput: false } }));
  assert.equal(status.stderr, undefined);
  const before = data(await client.callTool({ name: 'read_file', arguments: { path: 'sum.cjs' } }));
  data(await client.callTool({ name: 'patch_file', arguments: { path: 'sum.cjs', edits: [{ oldText: 'a - b', newText: 'a + b' }], expectedSha256: before.sha256 } }));
  const fixed = await run(); assert.equal(fixed.status, 'succeeded', JSON.stringify(fixed));
  assert.match(await fs.readFile(path.join(root, 'sum.cjs'), 'utf8'), /a \+ b/);
  const bad = await client.callTool({ name: 'read_file', arguments: { path: '../secret' } });
  assert.equal(bad.isError, true);
  const invalid = await client.callTool({ name: 'start_command', arguments: { command: 'true', timeoutSeconds: 9999 } });
  assert.equal(invalid.isError, true);
}

test('stdio MCP: initialize, discover, fail a test, fix code, rerun and validate', async t => {
  const root = await workspace(t);
  const client = new Client({ name: 'acceptance-test', version: '1' });
  const transport = new StdioClientTransport({ command: process.execPath, args: [cli, '--root', root, '--allow-host-exec'], stderr: 'pipe' });
  t.after(() => client.close());
  await client.connect(transport); await exercise(client, root);
});

test('read-only discovery excludes all mutation tools', async t => {
  const root = await workspace(t);
  const client = new Client({ name: 'readonly-test', version: '1' });
  t.after(() => client.close());
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [cli, '--root', root, '--read-only'], stderr: 'pipe' }));
  const names = (await client.listTools()).tools.map(t => t.name);
  assert.deepEqual(names.sort(), ['workspace_info', 'list_files', 'read_file', 'search_text', 'list_tasks'].sort());
});

test('HTTP MCP: real tool loop plus Origin/Host/JSON rejection', async t => {
  const root = await workspace(t);
  const probe = net.createServer(); probe.listen(0, '127.0.0.1'); await once(probe, 'listening');
  const port = probe.address().port; await new Promise(resolve => probe.close(resolve));
  const child = spawn(process.execPath, [cli, '--root', root, '--transport', 'http', '--port', String(port), '--allow-host-exec'], { stdio: ['ignore', 'ignore', 'pipe'] });
  let stderr = ''; child.stderr.on('data', d => { stderr += d; });
  t.after(() => stopServer(child));
  const base = `http://127.0.0.1:${port}`;
  let ready = false;
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(base + '/health')).ok) { ready = true; break; } }
    catch { /* process may still be starting; bounded retry with stderr on failure */ }
    await sleep(30);
  }
  assert.ok(ready, stderr);
  assert.equal((await fetch(base + '/health', { headers: { Origin: 'https://evil.example' } })).status, 403);
  const hostStatus = await new Promise((resolve, reject) => {
    const req = request(base + '/health', { headers: { Host: 'evil.example' } }, res => { res.resume(); resolve(res.statusCode); });
    req.on('error', reject); req.end();
  });
  assert.equal(hostStatus, 403);
  assert.equal((await fetch(base + '/mcp', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{' })).status, 400);
  assert.equal((await fetch(base + '/mcp')).status, 405);
  const client = new Client({ name: 'http-test', version: '1' });
  t.after(() => client.close());
  await client.connect(new StreamableHTTPClientTransport(new URL(base + '/mcp')));
  await exercise(client, root);
});

test('HTTP client disconnect does not stop dispatched job; reconnect can retrieve it', async t => {
  const root = await workspace(t);
  const probe = net.createServer(); probe.listen(0, '127.0.0.1'); await once(probe, 'listening');
  const port = probe.address().port; await new Promise(resolve => probe.close(resolve));
  const flags = [cli, '--root', root, '--transport', 'http', '--port', String(port), '--allow-host-exec', '--max-seconds', '7200'];
  if (process.platform !== 'win32') flags.push('--allow-codex');
  const child = spawn(process.execPath, flags, { stdio: ['ignore', 'ignore', 'pipe'] });
  child.stderr.resume();
  t.after(() => stopServer(child));
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 100; i++) { try { if ((await fetch(base + '/health')).ok) break; } catch {} await sleep(30); }
  const connect = async () => { const c = new Client({ name: 'reconnect-test', version: '1' }); await c.connect(new StreamableHTTPClientTransport(new URL(base + '/mcp'))); return c; };
  const first = await connect();
  const names = (await first.listTools()).tools.map(t => t.name);
  assert.equal(names.includes('start_codex'), process.platform !== 'win32');
  const info = data(await first.callTool({ name: 'workspace_info', arguments: {} }));
  assert.equal(info.maxCommandSeconds, 7200);
  const job = data(await first.callTool({ name: 'start_command', arguments: { command: writeLaterCommand('survived.txt', 'survived', 1000) } }));
  await first.close();
  await sleep(1200);
  const second = await connect(); t.after(() => second.close());
  let result;
  const deadline = Date.now() + 15000;
  do {
    result = data(await second.callTool({ name: 'get_command', arguments: { id: job.id } }));
    if (!['running', 'queued'].includes(result.status)) break;
    await sleep(100);
  } while (Date.now() < deadline);
  assert.equal(result.status, 'succeeded'); assert.equal(result.exitCode, 0);
  assert.equal(await fs.readFile(path.join(root, 'survived.txt'), 'utf8'), 'survived');
  assert.ok(data(await second.callTool({ name: 'list_commands', arguments: {} })).jobs.some(j => j.id === job.id));
});

test('local paths mode: no project parameter or switch; files, patches, cwd and jobs across directories', async t => {
  const home = await fs.realpath(await workspace(t));
  const a = await fs.realpath(await workspace(t)), b = await fs.realpath(await workspace(t));
  const client = new Client({ name: 'local-paths-test', version: '1' });
  t.after(() => client.close());
  const dynamicEnv = { ...process.env, HOME: home, USERPROFILE: home };
  if (process.platform === 'win32') dynamicEnv.LOCALAPPDATA = path.join(home, 'AppData', 'Local');
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [cli, '--dynamic-projects', '--allow-host-exec', '--max-concurrent', '1'], env: dynamicEnv, stderr: 'pipe' }));
  const tools = (await client.listTools()).tools;
  assert.ok(tools.every(tool => !tool.inputSchema.properties.projectRoot));
  assert.deepEqual(tools.find(t => t.name === 'import_image')._meta['openai/fileParams'], ['file']);
  const call = async (name, args = {}) => data(await client.callTool({ name, arguments: args }));
  const info = await call('workspace_info');
  assert.equal(info.workspace, home); assert.equal(info.fixedProject, false); assert.equal(info.absolutePaths, true);
  for (const [dir, content] of [[a, 'A'], [b, 'B']]) await call('write_file', { path: path.join(dir, 'same.txt'), content, expectedSha256: null });
  const before = await call('read_file', { path: path.join(a, 'same.txt') });
  await call('patch_file', { path: path.join(a, 'same.txt'), expectedSha256: before.sha256, edits: [{ oldText: 'A', newText: 'AA' }] });
  assert.equal((await call('read_file', { path: path.join(b, 'same.txt') })).content, 'B');
  assert.equal((await call('read_file', { path: path.join(a, 'same.txt') })).content, 'AA');
  await call('write_file', { path: 'relative.txt', content: 'home', expectedSha256: null });
  assert.equal(await fs.readFile(path.join(home, 'relative.txt'), 'utf8'), 'home');
  assert.ok((await call('list_files', { directory: b })).entries.some(e => e.name === 'same.txt'));
  assert.equal((await call('search_text', { directory: b, query: 'B' })).hits.length, 1);
  await fs.symlink(b, path.join(a, 'link'), process.platform === 'win32' ? 'junction' : undefined);
  const privateState = path.join(stateBase(process.platform, home, process.env.XDG_STATE_HOME, dynamicEnv.LOCALAPPDATA), 'audit.jsonl');
  for (const target of [privateState, path.join(a, '.env'), path.join(a, 'link', 'same.txt'), a + '/../escape']) assert.equal((await client.callTool({ name: 'read_file', arguments: { path: target } })).isError, true);
  const first = await call('start_command', { cwd: a, command: cwdCommand(1000) });
  const second = await call('start_command', { cwd: b, command: cwdCommand() });
  assert.equal(first.status, 'running'); assert.equal(second.status, 'queued');
  for (let i = 0; i < 100; i++) {
    if ((await call('get_command', { id: second.id })).status === 'succeeded') break;
    await sleep(25);
  }
  assert.equal((await call('get_command', { id: first.id })).stdout.trim(), a);
  assert.equal((await call('get_command', { id: second.id })).stdout.trim(), b);
  assert.equal((await call('list_commands')).jobs.length, 2);
});
