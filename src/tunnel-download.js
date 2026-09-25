import fs from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const RELEASE_API = 'https://api.github.com/repos/openai/tunnel-client/releases/latest';
const MAX_ARCHIVE = 50 * 1024 * 1024;

async function response(url, fetcher) {
  const result = await fetcher(url, { headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'gpt-web-agent' } });
  if (!result.ok) throw new Error(`Official tunnel-client download failed: HTTP ${result.status} (${url})`);
  return result;
}

export function releaseAssets(release, platform = process.platform, arch = process.arch) {
  if (!['darwin', 'linux'].includes(platform) || !['arm64', 'x64'].includes(arch)) throw new Error(`No supported tunnel-client build for ${platform}/${arch}`);
  const tag = release.tag_name;
  if (!/^v\d+\.\d+\.\d+$/.test(tag)) throw new Error('Unexpected official tunnel-client release tag');
  const filename = `tunnel-client-${tag}-${platform}-${arch === 'x64' ? 'amd64' : 'arm64'}.zip`;
  const prefix = `https://github.com/openai/tunnel-client/releases/download/${tag}/`;
  const asset = release.assets?.find(item => item.name === filename && item.browser_download_url === prefix + filename);
  const sums = release.assets?.find(item => item.name === 'SHA256SUMS.txt' && item.browser_download_url === prefix + 'SHA256SUMS.txt');
  if (!asset || !sums || !Number.isSafeInteger(asset.size) || asset.size <= 0 || asset.size > MAX_ARCHIVE) throw new Error('Official release is missing the expected archive or checksum file');
  return { asset, sums, filename };
}

export async function downloadOfficialTunnel(base, fetcher = fetch) {
  const release = await (await response(RELEASE_API, fetcher)).json();
  const { asset, sums, filename } = releaseAssets(release);
  const checksumText = await (await response(sums.browser_download_url, fetcher)).text();
  if (checksumText.length > 200000) throw new Error('Official checksum list is unexpectedly large');
  const hashLine = checksumText.split(/\r?\n/).find(line => line.endsWith(`  ${filename}`));
  const expected = hashLine?.match(/^([0-9a-f]{64})  /)?.[1];
  if (!expected) throw new Error('Official checksum list has no matching SHA-256');

  await fs.mkdir(base, { recursive: true, mode: 0o700 });
  const temp = await fs.mkdtemp(path.join(base, 'download-'));
  const archive = path.join(temp, filename);
  const binary = path.join(temp, 'tunnel-client');
  try {
    const assetResponse = await response(asset.browser_download_url, fetcher);
    const hash = createHash('sha256');
    let total = 0;
    const limit = new Transform({ transform(chunk, _encoding, done) {
      total += chunk.length;
      if (total > MAX_ARCHIVE) return done(new Error('Official tunnel-client archive exceeds size limit'));
      hash.update(chunk); done(null, chunk);
    } });
    await pipeline(Readable.fromWeb(assetResponse.body), limit, createWriteStream(archive, { mode: 0o600 }));
    if (hash.digest('hex') !== expected) throw new Error('Official tunnel-client archive SHA-256 mismatch');
    await new Promise((resolve, reject) => {
      const child = spawn('unzip', ['-p', archive, 'tunnel-client'], { stdio: ['ignore', 'pipe', 'pipe'] });
      let error = '';
      child.stderr.on('data', chunk => { error += chunk; });
      const writing = pipeline(child.stdout, createWriteStream(binary, { mode: 0o700 }));
      child.once('error', reject);
      child.once('close', async code => {
        try { await writing; if (code === 0) resolve(); else reject(new Error(`Could not unpack tunnel-client: ${error.trim()}`)); }
        catch (cause) { reject(cause); }
      });
    });
    const stat = await fs.stat(binary);
    if (!stat.isFile() || stat.size < 100000) throw new Error('Official archive did not contain a valid tunnel-client binary');
    const destination = path.join(base, 'bin');
    await fs.mkdir(destination, { recursive: true, mode: 0o700 });
    const installed = path.join(destination, 'tunnel-client');
    try { await fs.access(installed); throw new Error('Managed tunnel-client already exists; inspect it before replacing'); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    await fs.rename(binary, installed);
    await fs.chmod(installed, 0o700);
    return installed;
  } finally {
    await fs.rm(temp, { recursive: true, force: true });
  }
}
