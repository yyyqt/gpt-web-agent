import sharp from 'sharp';
import path from 'node:path';
import { BridgeError } from './runtime.js';
export const IMAGE_LIMIT = 20 * 1024 * 1024;
const reject = (code, message) => { throw new BridgeError(code, message); };
export function imageURL(value) {
  let url;
  try { url = new URL(value); } catch { reject('IMAGE_URL', 'Expected an HTTPS OpenAI file URL'); }
  if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443') ||
      !(url.hostname === 'files.oaiusercontent.com' || url.hostname.endsWith('.oaiusercontent.com')))
    reject('IMAGE_URL', 'Only HTTPS oaiusercontent.com file hosts are accepted');
  return url;
}
export async function downloadImage(value, fetcher = fetch) {
  let url = imageURL(value);
  const signal = AbortSignal.timeout(30000);
  try {
    for (let i = 0; i < 4; i++) {
      const response = await fetcher(url, { redirect: 'manual', signal });
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        await response.body?.cancel();
        const location = response.headers.get('location');
        if (!location) reject('IMAGE_DOWNLOAD', 'Redirect missing destination');
        url = imageURL(new URL(location, url).href); continue;
      }
      if (!response.ok) { await response.body?.cancel(); reject('IMAGE_DOWNLOAD', `Download returned HTTP ${response.status}; request a fresh file reference`); }
      if (Number(response.headers.get('content-length')) > IMAGE_LIMIT) { await response.body?.cancel(); reject('IMAGE_TOO_LARGE', 'Image exceeds 20 MiB'); }
      const chunks = []; let bytes = 0;
      for await (const chunk of response.body) {
        bytes += chunk.length;
        if (bytes > IMAGE_LIMIT) reject('IMAGE_TOO_LARGE', 'Image exceeds 20 MiB');
        chunks.push(chunk);
      }
      return Buffer.concat(chunks);
    }
    reject('IMAGE_DOWNLOAD', 'Too many redirects');
  } catch (e) {
    if (e instanceof BridgeError) throw e;
    // Never return signed download URLs or low-level request details.
    reject('IMAGE_DOWNLOAD', 'Image download failed or timed out; request a fresh file reference');
  }
}
export async function validateImage(bytes, destination, mime) {
  if (!bytes.length || bytes.length > IMAGE_LIMIT) reject('IMAGE_TOO_LARGE', 'Image must be nonempty and at most 20 MiB');
  let info;
  try {
    const options = { limitInputPixels: 40000000, failOn: 'warning' };
    info = await sharp(bytes, options).metadata();
    if (!['png', 'jpeg', 'webp'].includes(info.format) || (info.pages || 1) !== 1 || !info.width || !info.height || info.width > 16384 || info.height > 16384)
      reject('IMAGE_FORMAT', 'Only single-frame PNG, JPEG or WebP up to 40 megapixels and 16384 pixels per side');
    await sharp(bytes, options).raw().toBuffer(); // Decode the complete image, not just its header.
  } catch (e) {
    if (e instanceof BridgeError) throw e;
    reject('IMAGE_INVALID', 'Image decoding failed or pixel limit exceeded');
  }
  const extensions = { png: ['.png'], jpeg: ['.jpg', '.jpeg'], webp: ['.webp'] };
  if (!extensions[info.format].includes(path.extname(destination).toLowerCase())) reject('IMAGE_EXTENSION', 'Destination extension does not match decoded format');
  if (mime && mime !== 'application/octet-stream' && mime !== `image/${info.format}`) reject('IMAGE_MIME', 'File MIME type does not match decoded format');
  return { format: info.format, width: info.width, height: info.height };
}
