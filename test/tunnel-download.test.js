import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { downloadOfficialTunnel, releaseAssets } from '../src/tunnel-download.js';

const tag = 'v1.2.3';
const releasePlatform = process.platform === 'win32' ? 'windows' : process.platform;
const filename = `tunnel-client-${tag}-${releasePlatform}-${process.arch === 'x64' ? 'amd64' : 'arm64'}.zip`;
const prefix = `https://github.com/openai/tunnel-client/releases/download/${tag}/`;
const release = { tag_name: tag, assets: [
  { name: filename, browser_download_url: prefix + filename, size: 100 },
  { name: 'SHA256SUMS.txt', browser_download_url: prefix + 'SHA256SUMS.txt' }
] };

test('official release selection rejects a substituted download URL', () => {
  assert.equal(releaseAssets(release).filename, filename);
  const substituted = structuredClone(release);
  substituted.assets[0].browser_download_url = 'https://example.com/other.zip';
  assert.throws(() => releaseAssets(substituted), /missing the expected archive/);
});

test('download rejects a bad SHA-256 before unpacking or installing', async t => {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), 'gwa-bad-download-'));
  t.after(() => fs.rm(base, { recursive: true, force: true }));
  const archive = Buffer.from('not a real archive');
  const checksum = createHash('sha256').update('different').digest('hex');
  const fetcher = async url => {
    if (url.endsWith('/releases/latest')) return new Response(JSON.stringify(release));
    if (url.endsWith('SHA256SUMS.txt')) return new Response(`${checksum}  ${filename}\n`);
    if (url.endsWith(filename)) return new Response(archive);
    throw new Error(`Unexpected URL: ${url}`);
  };
  await assert.rejects(downloadOfficialTunnel(base, fetcher), /SHA-256 mismatch/);
  await assert.rejects(fs.access(path.join(base, 'bin', process.platform === 'win32' ? 'tunnel-client.exe' : 'tunnel-client')), /ENOENT/);
});
