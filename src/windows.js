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
  if (platform !== 'win32') return { executable: '/bin/sh', args: ['-c', command] };
  // Windows PowerShell otherwise reports success when the final native command
  // exits non-zero, and its redirected output may use a legacy code page.
  const script = [
    "$ErrorActionPreference='Stop'",
    "$ProgressPreference='SilentlyContinue'",
    "$OutputEncoding=[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false)",
    `& { ${command} }`,
    'if ($null -ne $LASTEXITCODE) { exit $LASTEXITCODE }',
  ].join('; ');
  return {
    executable: 'powershell.exe',
    args: ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', script],
  };
}
export function processEnvironment(root, platform = process.platform, source = process.env) {
  const env = { PATH: source.PATH || '/usr/bin:/bin', HOME: root, TMPDIR: source.TMPDIR || '/tmp', LANG: 'en_US.UTF-8' };
  if (platform === 'win32') {
    for (const key of ['SystemRoot', 'WINDIR', 'COMSPEC', 'PATHEXT', 'TEMP', 'TMP', 'APPDATA', 'LOCALAPPDATA']) if (source[key]) env[key] = source[key];
    const systemRoot = source.SystemRoot || source.WINDIR || path.win32.join(path.win32.parse(process.execPath).root, 'Windows');
    env.SystemRoot ||= systemRoot;
    env.WINDIR ||= systemRoot;
    env.COMSPEC ||= path.win32.join(systemRoot, 'System32', 'cmd.exe');
    env.PATHEXT ||= '.COM;.EXE;.BAT;.CMD';
    env.PATH = [...new Set([
      path.win32.dirname(process.execPath),
      ...(source.PATH || source.Path || '').split(path.win32.delimiter).filter(Boolean),
      path.win32.join(systemRoot, 'System32'),
      systemRoot,
    ])].join(path.win32.delimiter);
    env.USERPROFILE = root;
    const parsed = path.win32.parse(root);
    env.HOMEDRIVE = parsed.root.slice(0, 2);
    env.HOMEPATH = root.slice(parsed.root.length - 1);
    env.TMPDIR = source.TEMP || source.TMP || root;
  }
  return env;
}
