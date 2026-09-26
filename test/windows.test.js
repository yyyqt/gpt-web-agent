import test from 'node:test';
import assert from 'node:assert/strict';
import { commandSpec, processEnvironment, psQuote, windowsCredential } from '../src/windows.js';
import { releaseAssets } from '../src/tunnel-download.js';
import { makeWrapper, startCommandHint } from '../src/operator.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

test('Windows setup start hint uses PowerShell invocation and quote escaping', () => {
  assert.equal(startCommandHint('win32', 'C:\\Program Files\\node.exe', "C:\\demo's folder\\cli.js"), "& 'C:\\Program Files\\node.exe' 'C:\\demo''s folder\\cli.js' start");
  assert.equal(startCommandHint('darwin', '/usr/bin/node', '/tmp/cli.js'), "'/usr/bin/node' '/tmp/cli.js' start");
});

test('Windows release names map to official Windows architectures', () => {
  for (const [arch, suffix] of [['x64', 'amd64'], ['arm64', 'arm64']]) {
    const filename = `tunnel-client-v0.0.15-windows-${suffix}.zip`;
    const prefix = 'https://github.com/openai/tunnel-client/releases/download/v0.0.15/';
    const release = { tag_name: 'v0.0.15', assets: [{ name: filename, size: 1000000, browser_download_url: prefix + filename }, { name: 'SHA256SUMS.txt', browser_download_url: prefix + 'SHA256SUMS.txt' }] };
    assert.equal(releaseAssets(release, 'win32', arch).filename, filename);
  }
});
test('Windows shell preserves command and required OS environment without inherited secrets', () => {
  const command = 'npm.cmd test; exit $LASTEXITCODE';
  const spec = commandSpec(command, 'win32');
  assert.equal(spec.executable, 'powershell.exe');
  assert.equal(spec.args.at(-2), '-Command');
  const script = spec.args.at(-1);
  assert.match(script, /npm\.cmd test; exit \$LASTEXITCODE/);
  assert.match(script, /exit \$LASTEXITCODE/);
  const env = processEnvironment('C:\\demo', 'win32', { Path: 'C:\\node', SystemRoot: 'C:\\Windows', TEMP: 'C:\\temp', API_KEY: 'secret' });
  assert.ok(env.PATH.split(';').includes('C:\\node'));
  assert.ok(env.PATH.split(';').includes(path.win32.dirname(process.execPath)));
  assert.equal(env.SystemRoot, 'C:\\Windows');
  assert.equal(env.API_KEY, undefined);
  assert.equal(env.HOMEDRIVE, 'C:');
  assert.equal(env.HOMEPATH, '\\demo');
  assert.equal(psQuote("C:\\a'b"), "'C:\\a''b'");
});
test('Windows DPAPI roundtrip saves no plaintext', { skip: process.platform !== 'win32' }, async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'bridge-key-'));
  try {
    const file = path.join(dir, 'key.dpapi');
    const secret = 'test-only-key-123';
    windowsCredential(file, secret);
    assert.equal(windowsCredential(file), secret);
    assert.equal((await fs.readFile(file)).includes(Buffer.from(secret)), false);
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});
test('Windows generated wrapper starts the dynamic MCP runtime with command tools', { skip: process.platform !== 'win32' }, async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'bridge-wrapper-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const wrapper = await makeWrapper(dir, true);
  assert.equal(path.extname(wrapper), '.mjs');
  const client = new Client({ name: 'windows-wrapper-test', version: '1' });
  t.after(() => client.close());
  const env = { ...process.env, LOCALAPPDATA: path.join(dir, 'local-app-data') };
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [wrapper], env, stderr: 'pipe' }));
  const tools = (await client.listTools()).tools.map(tool => tool.name);
  assert.ok(tools.includes('write_file'));
  assert.ok(tools.includes('start_command'));
  assert.ok(!tools.includes('start_codex'));
});
