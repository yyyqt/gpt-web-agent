import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline/promises';

const PROFILE = 'gpt-web-agent';
const SERVICE = 'gpt-web-agent-tunnel';
const cliPath = fileURLToPath(new URL('cli.js', import.meta.url));
const configBase = () => process.platform === 'darwin'
  ? path.join(os.homedir(), 'Library', 'Application Support', 'gpt-web-agent')
  : path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'), 'gpt-web-agent');
export const stateBase = (platform = process.platform, home = os.homedir(), xdgStateHome = process.env.XDG_STATE_HOME) => platform === 'darwin'
  ? path.join(home, 'Library', 'Application Support', 'gpt-web-agent', 'local-state')
  : path.join(xdgStateHome || path.join(home, '.local', 'state'), 'gpt-web-agent');
const run = (file, args, options = {}) => new Promise((resolve, reject) => {
  const child = spawn(file, args, { stdio: 'inherit', ...options });
  child.once('error', reject);
  child.once('close', (code, signal) => code === 0 ? resolve() : reject(new Error(`${path.basename(file)} exited with ${code ?? signal}`)));
});
const capture = (file, args) => {
  const result = spawnSync(file, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 16384 });
  if (result.error || result.status !== 0) throw new Error(`${path.basename(file)} could not retrieve the saved credential`);
  return result.stdout.trimEnd();
};
const executable = name => {
  const result = spawnSync('which', [name], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`${name} is not on PATH. Install it from its official release and retry.`);
  return result.stdout.trim();
};
const shellQuote = value => `'${value.replaceAll("'", "'\\''")}'`;
const account = () => os.userInfo().username;
const serviceName = () => `gpt-web-agent-tunnel-${account()}`;

async function askTunnelId() {
  if (!process.stdin.isTTY) throw new Error('Pass --tunnel-id tunnel_... in non-interactive setup');
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try { return (await rl.question('Your own tunnel_... ID: ')).trim(); }
  finally { rl.close(); }
}
function validateTunnelId(id) {
  if (!/^tunnel_[a-z0-9]{32}$/.test(id)) throw new Error('Expected tunnel_ followed by 32 lowercase letters or digits from your Platform Tunnels page');
}
async function saveCredential() {
  if (process.platform === 'darwin') {
    executable('security');
    process.stdout.write('macOS Keychain will securely prompt for your tunnel runtime key. Do not paste it into chat.\n');
    await run('security', ['add-generic-password', '-U', '-a', account(), '-s', serviceName(), '-w']);
  } else {
    executable('secret-tool');
    if (!process.stdin.isTTY) throw new Error('Run setup in an interactive terminal to save a Linux Secret Service credential');
    const secret = await new Promise((resolve, reject) => {
      process.stdout.write('Paste tunnel runtime key (hidden), then Enter: ');
      let value = '';
      process.stdin.setRawMode(true); process.stdin.resume();
      const onData = chunk => {
        for (const char of chunk.toString()) {
          if (char === '\r' || char === '\n') { process.stdin.off('data', onData); process.stdin.setRawMode(false); process.stdin.pause(); process.stdout.write('\n'); resolve(value); return; }
          if (char === '\u0003') { process.stdin.off('data', onData); process.stdin.setRawMode(false); process.stdin.pause(); reject(new Error('Cancelled')); return; }
          if (char === '\u007f') value = value.slice(0, -1);
          else value += char;
        }
      };
      process.stdin.on('data', onData);
    });
    if (!secret) throw new Error('Tunnel key cannot be empty');
    const child = spawn('secret-tool', ['store', '--label=GPT Web Agent tunnel', 'application', 'gpt-web-agent', 'account', account()], { stdio: ['pipe', 'inherit', 'inherit'] });
    child.stdin.end(secret);
    await new Promise((resolve, reject) => { child.once('error', reject); child.once('close', code => code === 0 ? resolve() : reject(new Error('secret-tool store failed'))); });
  }
}
function loadCredential() {
  const secret = process.platform === 'darwin'
    ? capture('security', ['find-generic-password', '-a', account(), '-s', serviceName(), '-w'])
    : capture('secret-tool', ['lookup', 'application', 'gpt-web-agent', 'account', account()]);
  if (!secret) throw new Error('Saved tunnel key is empty; rerun setup');
  return secret;
}
async function makeWrapper(base, hostExec) {
  const node = executable('node');
  const wrapper = path.join(base, 'mcp-server.sh');
  const flags = ['--dynamic-projects', ...(hostExec ? ['--allow-host-exec'] : []), '--max-concurrent', '4', '--max-seconds', '7200', '--max-output-bytes', '1048576', '--max-file-bytes', '4194304'];
  await fs.writeFile(wrapper, `#!/bin/sh\nexec ${shellQuote(node)} ${shellQuote(cliPath)} ${flags.map(shellQuote).join(' ')}\n`, { mode: 0o700, flag: 'wx' });
  return wrapper;
}
export async function setup(args) {
  const idIndex = args.indexOf('--tunnel-id');
  if (args.length && (idIndex !== 0 || args.length !== 2)) throw new Error('Usage: gpt-web-agent setup [--tunnel-id tunnel_...]');
  const base = configBase();
  const profileDir = path.join(base, 'profiles');
  const existing = path.join(profileDir, `${PROFILE}.yaml`);
  try { await fs.access(existing); throw new Error('Existing profile found. Inspect it before replacing or remove it explicitly.'); }
  catch (e) { if (e.code !== 'ENOENT') throw e; }
  const wrapper = path.join(base, 'mcp-server.sh');
  try { await fs.access(wrapper); throw new Error('Existing MCP wrapper found. Inspect it before replacing or remove it explicitly.'); }
  catch (e) { if (e.code !== 'ENOENT') throw e; }
  const tunnelPathRecord = path.join(base, 'tunnel-path');
  try { await fs.access(tunnelPathRecord); throw new Error('Existing tunnel-client path found. Inspect it before replacing or remove it explicitly.'); }
  catch (e) { if (e.code !== 'ENOENT') throw e; }
  const tunnelId = idIndex === 0 ? args[1] : await askTunnelId();
  validateTunnelId(tunnelId);
  const tunnel = executable('tunnel-client');
  if (!process.stdin.isTTY) throw new Error('Run setup in an interactive terminal so the credential prompt is private');
  process.stdout.write('Enable host shell commands? They run with your OS user permissions. Type YES to enable; anything else keeps shell disabled: ');
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const hostExec = (await rl.question('')).trim() === 'YES'; rl.close();
  await saveCredential();
  try {
    await fs.mkdir(profileDir, { mode: 0o700, recursive: true });
    await makeWrapper(base, hostExec);
    await fs.writeFile(tunnelPathRecord, tunnel + '\n', { mode: 0o600, flag: 'wx' });
    await run(tunnel, ['init', '--sample', 'sample_mcp_stdio_local', '--profile', PROFILE, '--profile-dir', profileDir, '--tunnel-id', tunnelId, '--mcp-command', shellQuote(wrapper)], { env: { ...process.env, CONTROL_PLANE_API_KEY: loadCredential() } });
  } catch (error) {
    await Promise.allSettled([fs.rm(wrapper, { force: true }), fs.rm(tunnelPathRecord, { force: true })]);
    throw error;
  }
  process.stdout.write(`Configured. Run: ${shellQuote(process.execPath)} ${shellQuote(cliPath)} start\n`);
}
export async function start() {
  let tunnel;
  try { tunnel = (await fs.readFile(path.join(configBase(), 'tunnel-path'), 'utf8')).trim(); }
  catch (error) { if (error.code === 'ENOENT') throw new Error('No tunnel configuration found. Run gpt-web-agent setup first.'); throw error; }
  if (!path.isAbsolute(tunnel)) throw new Error('Saved tunnel-client path is invalid; rerun setup');
  const profileDir = path.join(configBase(), 'profiles');
  try { await fs.access(path.join(profileDir, `${PROFILE}.yaml`)); }
  catch (error) { if (error.code === 'ENOENT') throw new Error('Tunnel profile is missing. Run gpt-web-agent setup first.'); throw error; }
  const key = loadCredential();
  await run(tunnel, ['run', '--profile', PROFILE, '--profile-dir', profileDir], { env: { ...process.env, CONTROL_PLANE_API_KEY: key } });
}

export async function installService() {
  if (process.platform !== 'darwin') throw new Error('install-service currently supports macOS LaunchAgent; Linux can use a user systemd service');
  const base = configBase();
  try { await fs.access(path.join(base, 'tunnel-path')); await fs.access(path.join(base, 'profiles', `${PROFILE}.yaml`)); }
  catch { throw new Error('Run setup successfully before install-service'); }
  const label = 'io.github.yyyqt.gpt-web-agent';
  const agentDir = path.join(os.homedir(), 'Library', 'LaunchAgents');
  await fs.mkdir(agentDir, { recursive: true });
  const target = path.join(agentDir, `${label}.plist`);
  try { await fs.access(target); throw new Error('LaunchAgent already exists; inspect it before replacing'); }
  catch (e) { if (e.code !== 'ENOENT') throw e; }
  const xml = value => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
  const logPath = path.join(base, 'tunnel-service.log');
  const servicePath = [...new Set([path.dirname(process.execPath), ...(process.env.PATH || '').split(path.delimiter).filter(Boolean), '/usr/bin', '/bin', '/usr/sbin', '/sbin'])].join(path.delimiter);
  const plist = `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0"><dict><key>Label</key><string>${label}</string><key>ProgramArguments</key><array><string>${xml(process.execPath)}</string><string>${xml(cliPath)}</string><string>start</string></array><key>EnvironmentVariables</key><dict><key>PATH</key><string>${xml(servicePath)}</string></dict><key>RunAtLoad</key><true/><key>KeepAlive</key><true/><key>StandardOutPath</key><string>${xml(logPath)}</string><key>StandardErrorPath</key><string>${xml(logPath)}</string></dict></plist>\n`;
  await fs.writeFile(target, plist, { mode: 0o600, flag: 'wx' });
  process.stdout.write(`Installed ${target}. Run launchctl bootstrap gui/$(id -u) ${shellQuote(target)} after confirming your Keychain is unlocked. No key is stored in the plist.\n`);
}

export async function operatorMain(command, args) {
  if (command === 'setup') return setup(args);
  if (args.length) throw new Error(`Unexpected arguments for ${command}`);
  if (command === 'start') return start();
  if (command === 'install-service') return installService();
  throw new Error(`Unknown command ${command}`);
}
