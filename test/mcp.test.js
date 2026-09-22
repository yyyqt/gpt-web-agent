import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import net from 'node:net';
import { request } from 'node:http';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const cli = fileURLToPath(new URL('../src/cli.js', import.meta.url));
async function workspace(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'bridge-mcp-'));
  t.after(() => fs.rm(root, { recursive: true, force: true })); return root;
}
const data = r => { assert.ok(!r.isError, JSON.stringify(r)); return JSON.parse(r.content[0].text); };
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function exercise(client, root) {
  const tools = (await client.listTools()).tools;
  assert.equal(tools.length, 11);
  assert.equal(tools.find(t => t.name === 'start_command').annotations.readOnlyHint, false);
  const info = data(await client.callTool({ name: 'workspace_info', arguments: {} }));
  assert.equal(info.sandboxed, false); assert.equal(info.hostExecution, true);
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
  const before = data(await client.callTool({ name: 'read_file', arguments: { path: 'sum.cjs' } }));
  data(await client.callTool({ name: 'write_file', arguments: { path: 'sum.cjs', content: 'module.exports = (a, b) => a + b;', expectedSha256: before.sha256 } }));
  assert.equal((await run()).status, 'succeeded');
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
  t.after(async () => { if (child.exitCode === null) { const stopped = once(child, 'exit'); child.kill('SIGTERM'); await stopped; } });
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
  const child = spawn(process.execPath, [cli, '--root', root, '--transport', 'http', '--port', String(port), '--allow-host-exec', '--allow-codex', '--max-seconds', '7200'], { stdio: ['ignore', 'ignore', 'pipe'] });
  child.stderr.resume();
  t.after(async () => { if (child.exitCode === null) { const stopped = once(child, 'exit'); child.kill('SIGTERM'); await stopped; } });
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 100; i++) { try { if ((await fetch(base + '/health')).ok) break; } catch {} await sleep(30); }
  const connect = async () => { const c = new Client({ name: 'reconnect-test', version: '1' }); await c.connect(new StreamableHTTPClientTransport(new URL(base + '/mcp'))); return c; };
  const first = await connect();
  const names = (await first.listTools()).tools.map(t => t.name);
  assert.ok(names.includes('start_codex'));
  const info = data(await first.callTool({ name: 'workspace_info', arguments: {} }));
  assert.equal(info.maxCommandSeconds, 7200);
  const job = data(await first.callTool({ name: 'start_command', arguments: { command: 'sleep 1; printf survived > survived.txt' } }));
  await first.close();
  await sleep(1200);
  const second = await connect(); t.after(() => second.close());
  const result = data(await second.callTool({ name: 'get_command', arguments: { id: job.id } }));
  assert.equal(result.status, 'succeeded'); assert.equal(result.exitCode, 0);
  assert.equal(await fs.readFile(path.join(root, 'survived.txt'), 'utf8'), 'survived');
  assert.ok(data(await second.callTool({ name: 'list_commands', arguments: {} })).jobs.some(j => j.id === job.id));
});
