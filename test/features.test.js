import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { Runtime } from '../src/runtime.js';
import { downloadImage, imageURL, validateImage, IMAGE_LIMIT } from '../src/images.js';
import { nodeCommand } from './support.js';
const code = value => e => e.code === value;
async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'bridge-feature-'));
  const r = new Runtime(root, { allowHostExec: true }); await r.init();
  t.after(async () => { await r.close(); await fs.rm(root, { recursive: true, force: true }); }); return r;
}
test('patches original text atomically, preserves CRLF, rejects overlap, ambiguity and stale hashes', async t => {
  const r = await fixture(t);
  const first = await r.write({ path: 'a.txt', content: 'one\r\ntwo\r\nthree', expectedSha256: null });
  const args = { path: 'a.txt', expectedSha256: first.sha256 };
  await assert.rejects(r.patch({ ...args, edits: [{ oldText: 'one', newText: 'x' }, { oldText: 'missing', newText: 'y' }] }), code('PATCH_MATCH'));
  await assert.rejects(r.patch({ ...args, edits: [{ oldText: 'one', newText: 'x' }, { oldText: 'on', newText: 'y' }] }), code('PATCH_OVERLAP'));
  assert.equal((await r.file('a.txt')).sha256, first.sha256);
  await r.patch({ ...args, edits: [{ oldText: 'one', newText: 'two' }, { oldText: 'two', newText: 'second' }] });
  assert.equal((await r.file('a.txt')).content, 'two\r\nsecond\r\nthree');
  await assert.rejects(r.patch({ ...args, edits: [{ oldText: 'three', newText: '' }] }), code('CONFLICT'));
});
test('log pages reconstruct Unicode output and survive restart', async t => {
  const r = await fixture(t);
  const j = await r.startJob({ command: nodeCommand("process.stdout.write('你好😀abc')") }); await r.jobs.get(j.id).done;
  let offset = 0, result = '';
  do { const page = r.output({ id: j.id, offset, limit: 1 }); result += page.output; offset = page.nextOffset; if (!page.hasMore) break; } while (true);
  assert.equal(result, '你好😀abc');
  const resumed = new Runtime(r.root); await resumed.init();
  assert.equal(resumed.output({ id: j.id }).output, result);
  assert.throws(() => r.output({ id: j.id, offset: 3 }), code('INVALID_OFFSET'));
});
test('image downloads reject unsafe redirects and oversized bodies without exposing URLs', async () => {
  assert.equal(imageURL('https://oaisdmntprnorthcentralus.blob.core.windows.net/private/file?sig=example').hostname, 'oaisdmntprnorthcentralus.blob.core.windows.net');
  assert.equal(imageURL('https://oaisdmntprcentralus.blob.core.windows.net/file').hostname, 'oaisdmntprcentralus.blob.core.windows.net');
  assert.throws(() => imageURL('https://untrusted.blob.core.windows.net/a'), code('IMAGE_URL'));
  assert.throws(() => imageURL('https://oaisdmntprnorthcentralus.blob.core.windows.net.evil.com/a'), code('IMAGE_URL'));
  for (const url of ['http://files.oaiusercontent.com/a', 'https://localhost/a', 'https://files.oaiusercontent.com.evil.com/a', 'https://u:p@files.oaiusercontent.com/a']) assert.throws(() => imageURL(url), code('IMAGE_URL'));
  assert.throws(() => imageURL('https://untrusted.blob.core.windows.net/a?sig=DO_NOT_EXPOSE'), e => e.code === 'IMAGE_URL' && !e.message.includes('DO_NOT_EXPOSE'));
  await assert.rejects(downloadImage('https://files.oaiusercontent.com/a', async () => new Response(null, { status: 302, headers: { location: 'https://127.0.0.1/private' } })), code('IMAGE_URL'));
  await assert.rejects(downloadImage('https://files.oaiusercontent.com/a', async () => new Response('x', { headers: { 'content-length': String(IMAGE_LIMIT + 1) } })), code('IMAGE_TOO_LARGE'));
});
test('real image decoding and atomic import enforce format, path and conflicts', async t => {
  const r = await fixture(t);
  const bytes = await sharp({ create: { width: 16, height: 12, channels: 3, background: 'red' } }).png().toBuffer();
  assert.deepEqual(await validateImage(bytes, 'a.png', 'image/png'), { format: 'png', width: 16, height: 12 });
  await assert.rejects(validateImage(bytes, 'a.jpg'), code('IMAGE_EXTENSION'));
  await assert.rejects(validateImage(bytes.subarray(0, 50), 'a.png'), code('IMAGE_INVALID'));
  const oldFetch = globalThis.fetch; globalThis.fetch = async () => new Response(bytes);
  t.after(() => { globalThis.fetch = oldFetch; });
  const args = { file: { download_url: 'https://oaisdmntprnorthcentralus.blob.core.windows.net/test?sig=fixture', file_id: 'fixture', mime_type: 'image/png' }, path: 'assets/test.png' };
  const saved = await r.importImage(args);
  assert.deepEqual(await fs.readFile(path.join(r.root, args.path)), bytes);
  await assert.rejects(r.importImage(args), code('CONFLICT'));
  await assert.rejects(r.importImage({ ...args, path: '../escape.png' }), code('PATH_DENIED'));
  assert.equal((await r.importImage({ ...args, expectedSha256: saved.sha256 })).sha256, saved.sha256);
});
