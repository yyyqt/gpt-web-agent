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
  await fs.writeFile(path.join(base, 'profiles', 'gpt-web-agent.yaml'), 'test');
  const env = { ...process.env, HOME: home, PATH: `${bin}:${process.env.PATH}` };
  const start = await run(process.execPath, [cli, 'start'], { env });
  assert.equal(start.code, 0, start.err);
  assert.doesNotMatch(start.out + start.err, /test-secret-value/);
  const setup = await run(process.execPath, [cli, 'setup'], { env });
  assert.notEqual(setup.code, 0);
  assert.match(setup.err, /Existing profile found/);
});

test('macOS setup quotes the wrapper command in a home directory with spaces', { skip: process.platform !== 'darwin' }, async t => {
  const parent = await fs.mkdtemp(path.join(os.tmpdir(), 'bridge-setup-'));
  t.after(() => fs.rm(parent, { recursive: true, force: true }));
  const home = path.join(parent, 'home with spaces');
  const bin = path.join(parent, 'bin');
  await fs.mkdir(home); await fs.mkdir(bin);
  const argvFile = path.join(parent, 'tunnel-args');
  await fs.writeFile(path.join(bin, 'security'), '#!/bin/sh\nif [ "$1" = find-generic-password ]; then printf test-secret-value; fi\n', { mode: 0o755 });
  await fs.writeFile(path.join(bin, 'tunnel-client'), '#!/bin/sh\ntest "$CONTROL_PLANE_API_KEY" = test-secret-value || exit 9\nprintf "%s\\0" "$@" > "$TEST_ARGV_FILE"\n', { mode: 0o755 });
  const driver = `import os, pty, select, sys, time\npid, fd = pty.fork()\nif pid == 0:\n os.execv(sys.argv[1], sys.argv[1:])\nbuf = b''\nsent_id = sent_yes = False\ndeadline = time.time() + 15\nwhile time.time() < deadline:\n ready, _, _ = select.select([fd], [], [], 1)\n if not ready: continue\n try: data = os.read(fd, 4096)\n except OSError: break\n if not data: break\n buf += data\n if not sent_id and b'Your own tunnel_' in buf:\n  os.write(fd, b'tunnel_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\\n'); sent_id = True\n if not sent_yes and b'Type YES' in buf:\n  os.write(fd, b'YES\\n'); sent_yes = True\nif time.time() >= deadline:\n try: os.kill(pid, 9)\n except ProcessLookupError: pass\n_, status = os.waitpid(pid, 0)\nsys.stdout.buffer.write(buf)\nsys.exit(os.waitstatus_to_exitcode(status))`;
  const env = { ...process.env, HOME: home, PATH: `${bin}:${process.env.PATH}`, TEST_ARGV_FILE: argvFile };
  const result = await run('python3', ['-c', driver, process.execPath, cli, 'setup'], { env });
  assert.equal(result.code, 0, result.out + result.err);
  const args = (await fs.readFile(argvFile, 'utf8')).split('\0').filter(Boolean);
  const value = args[args.indexOf('--mcp-command') + 1];
  const wrapper = path.join(home, 'Library', 'Application Support', 'gpt-web-agent', 'mcp-server.sh');
  assert.equal(value, `'${wrapper}'`);
  const resolved = await run('/bin/sh', ['-c', `set -- ${value}; printf '%s' "$1"`], { env });
  assert.equal(resolved.out, wrapper);
  assert.equal((await fs.stat(wrapper)).mode & 0o777, 0o700);
});

test('start without setup gives an actionable error', { skip: process.platform !== 'darwin' }, async t => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'bridge-unconfigured-'));
  t.after(() => fs.rm(home, { recursive: true, force: true }));
  const result = await run(process.execPath, [cli, 'start'], { env: { ...process.env, HOME: home } });
  assert.notEqual(result.code, 0);
  assert.match(result.err, /Run gpt-web-agent setup first/);
  assert.doesNotMatch(result.err, /ENOENT/);
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
  const pathValue = `/custom/homebrew/bin:/custom/with & chars:${process.env.PATH}`;
  const result = await run(process.execPath, [cli, 'install-service'], { env: { ...process.env, HOME: home, PATH: pathValue } });
  assert.equal(result.code, 0, result.err);
  const plist = path.join(home, 'Library', 'LaunchAgents', 'io.github.yyyqt.gpt-web-agent.plist');
  const content = await fs.readFile(plist, 'utf8');
  assert.match(content, /<string>start<\/string>/);
  assert.match(content, /<key>EnvironmentVariables<\/key><dict><key>PATH<\/key>/);
  assert.match(content, /\/custom\/homebrew\/bin:\/custom\/with &amp; chars/);
  assert.doesNotMatch(content, /CONTROL_PLANE_API_KEY|test-secret-value/);
  assert.equal((await fs.stat(plist)).mode & 0o777, 0o600);
  const lint = await run('/usr/bin/plutil', ['-lint', plist]);
  assert.equal(lint.code, 0, lint.out + lint.err);
});
