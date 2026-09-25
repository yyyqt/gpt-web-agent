import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { stateBase } from '../src/operator.js';

const cli = fileURLToPath(new URL('../src/cli.js', import.meta.url));
const run = (file, args, options = {}, input = '') => new Promise((resolve, reject) => {
  const child = spawn(file, args, { stdio: ['pipe', 'pipe', 'pipe'], ...options });
  let out = '', err = '';
  child.stdout.on('data', data => { out += data; });
  child.stderr.on('data', data => { err += data; });
  child.once('error', reject);
  child.once('close', code => resolve({ code, out, err }));
  child.stdin.end(input);
});

test('operator start reads saved credential and does not print it or pass it in argv', { skip: process.platform !== 'darwin' }, async t => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'bridge-operator-'));
  t.after(() => fs.rm(home, { recursive: true, force: true }));
  const bin = path.join(home, 'bin'); await fs.mkdir(bin);
  const security = path.join(bin, 'security'), tunnel = path.join(bin, 'tunnel-client');
  await fs.writeFile(security, '#!/bin/sh\nprintf test-secret-value\n', { mode: 0o755 });
  await fs.writeFile(tunnel, '#!/bin/sh\ntest "$CONTROL_PLANE_API_KEY" = test-secret-value || exit 9\nprintf \"%s\" "$*" | grep -q test-secret-value && exit 8\nexit 0\n', { mode: 0o755 });
  const base = path.join(home, 'Library', 'Application Support', 'gpt-web-agent');
  await fs.mkdir(path.join(base, 'profiles'), { recursive: true });
  await fs.writeFile(path.join(base, 'tunnel-path'), tunnel + '\n', { mode: 0o600 });
  const env = { ...process.env, HOME: home, PATH: `${bin}:${process.env.PATH}` };
  const start = await run(process.execPath, [cli, 'start'], { env });
  assert.equal(start.code, 0, start.err);
  assert.doesNotMatch(start.out + start.err, /test-secret-value/);
  const setup = await run(process.execPath, [cli, 'setup', '--tunnel-id', 'tunnel_12345678'], { env });
  assert.notEqual(setup.code, 0);
  assert.match(setup.err, /Existing tunnel-client path/);
});

test('CLI help version matches package.json; dynamic state base follows platform', async () => {
  const result = await run(process.execPath, [cli, '--help']);
  assert.equal(result.code, 0);
  const pkg = JSON.parse(await fs.readFile(new URL('../package.json', import.meta.url)));
  assert.match(result.out, new RegExp(`gpt-web-agent ${pkg.version.replaceAll('.', '\\.')}`));
  assert.ok(path.isAbsolute(stateBase()));
  assert.equal(stateBase('linux', '/home/alice'), '/home/alice/.local/state/gpt-web-agent');
  assert.equal(stateBase('linux', '/home/alice', '/state'), '/state/gpt-web-agent');
});

test('macOS service installer writes a private plist without a credential', { skip: process.platform !== 'darwin' }, async t => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'bridge-service-'));
  t.after(() => fs.rm(home, { recursive: true, force: true }));
  const base = path.join(home, 'Library', 'Application Support', 'gpt-web-agent');
  await fs.mkdir(path.join(base, 'profiles'), { recursive: true });
  await fs.writeFile(path.join(base, 'tunnel-path'), '/test/tunnel-client\n');
  await fs.writeFile(path.join(base, 'profiles', 'gpt-web-agent.yaml'), 'test');
  const result = await run(process.execPath, [cli, 'install-service'], { env: { ...process.env, HOME: home } });
  assert.equal(result.code, 0, result.err);
  const plist = path.join(home, 'Library', 'LaunchAgents', 'io.github.yyyqt.gpt-web-agent.plist');
  const content = await fs.readFile(plist, 'utf8');
  assert.match(content, /<string>start<\/string>/);
  assert.doesNotMatch(content, /CONTROL_PLANE_API_KEY|test-secret-value/);
  assert.equal((await fs.stat(plist)).mode & 0o777, 0o600);
});
