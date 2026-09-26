import { spawnSync } from 'node:child_process';
import path from 'node:path';

export const psQuote = value => `'${value.replaceAll("'", "''")}'`;
export function powershell(script, input) {
  const result = spawnSync('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from("$ErrorActionPreference='Stop'; " + script, 'utf16le').toString('base64')], {
    input, encoding: 'utf8', windowsHide: true, timeout: 30000, maxBuffer: 1024 * 1024,
  });
  if (result.error || result.status !== 0) throw new Error(`Windows operation failed: ${result.error?.message || result.stderr.trim()}`);
  return result.stdout.trimEnd();
}
export function windowsCredential(file, secret) {
  const target = psQuote(file);
  if (secret !== undefined) {
    // DPAPI CurrentUser encryption: plaintext is passed over stdin, never argv or disk.
    powershell(`Add-Type -AssemblyName System.Security; $value=[Console]::In.ReadToEnd(); $bytes=[Text.Encoding]::UTF8.GetBytes($value); $encrypted=[Security.Cryptography.ProtectedData]::Protect($bytes,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser); [IO.File]::WriteAllBytes(${target},$encrypted)`, secret);
    return;
  }
  return powershell(`Add-Type -AssemblyName System.Security; $encrypted=[IO.File]::ReadAllBytes(${target}); $bytes=[Security.Cryptography.ProtectedData]::Unprotect($encrypted,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser); [Console]::Write([Text.Encoding]::UTF8.GetString($bytes))`);
}
export function commandSpec(command, platform = process.platform) {
  return platform === 'win32'
    ? { executable: 'powershell.exe', args: ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', command] }
    : { executable: '/bin/sh', args: ['-c', command] };
}
export function processEnvironment(root, platform = process.platform, source = process.env) {
  const env = { PATH: source.PATH || '/usr/bin:/bin', HOME: root, TMPDIR: source.TMPDIR || '/tmp', LANG: 'en_US.UTF-8' };
  if (platform === 'win32') {
    for (const key of ['SystemRoot', 'WINDIR', 'COMSPEC', 'PATHEXT', 'TEMP', 'TMP', 'APPDATA', 'LOCALAPPDATA', 'USERPROFILE']) if (source[key]) env[key] = source[key];
    env.PATH = source.PATH || source.Path || '';
    env.USERPROFILE = root;
  }
  return env;
}
