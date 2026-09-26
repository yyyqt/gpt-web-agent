import test from 'node:test';
import assert from 'node:assert/strict';
import { commandSpec, processEnvironment, psQuote, windowsCredential } from '../src/windows.js';
import { releaseAssets } from '../src/tunnel-download.js';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

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
  assert.equal(spec.args.at(-1), command);
  const env = processEnvironment('C:\\demo', 'win32', { Path: 'C:\\node', SystemRoot: 'C:\\Windows', TEMP: 'C:\\temp', API_KEY: 'secret' });
  assert.equal(env.PATH, 'C:\\node');
  assert.equal(env.SystemRoot, 'C:\\Windows');
  assert.equal(env.API_KEY, undefined);
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
