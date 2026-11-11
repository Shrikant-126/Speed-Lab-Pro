// In-browser image optimiser (runs in a Web Worker, nothing is uploaded).
// Decode: native createImageBitmap (respects EXIF orientation) with WASM decoders as fallback
// for very large images. Encode: WebP, AVIF, MozJPEG and OxiPNG via @jsquash (Squoosh codecs).
import { decode as decodeJpeg, encode as encodeJpeg } from '@jsquash/jpeg';
import { decode as decodePng, encode as encodePng } from '@jsquash/png';
import { decode as decodeWebp, encode as encodeWebp } from '@jsquash/webp';
import { decode as decodeAvif, encode as encodeAvif } from '@jsquash/avif';
import { optimise as oxipng } from '@jsquash/oxipng';
import resize from '@jsquash/resize';

const MIME = { webp: 'image/webp', avif: 'image/avif', jpeg: 'image/jpeg', png: 'image/png' };
const EXT = { webp: 'webp', avif: 'avif', jpeg: 'jpg', png: 'png' };
const CANVAS_MAX_AREA = 200_000_000;

function sniff(u8) {
  if (u8[0] === 0xff && u8[1] === 0xd8) return 'jpeg';
  if (u8[0] === 0x89 && u8[1] === 0x50 && u8[2] === 0x4e) return 'png';
  if (u8[0] === 0x52 && u8[1] === 0x49 && u8[8] === 0x57 && u8[9] === 0x45) return 'webp';
  if (u8[4] === 0x66 && u8[5] === 0x74 && u8[6] === 0x79 && u8[7] === 0x70) {
    const brand = String.fromCharCode(u8[8], u8[9], u8[10], u8[11]);
    if (/avi[fs]/.test(brand)) return 'avif';
    if (/hei[cx]|mif1|heix/.test(brand)) return 'heic';
  }
  if (u8[0] === 0x47 && u8[1] === 0x49 && u8[2] === 0x46) return 'gif';
  if ((u8[0] === 0x49 && u8[1] === 0x49) || (u8[0] === 0x4d && u8[1] === 0x4d)) return 'tiff';
  if (u8[0] === 0x42 && u8[1] === 0x4d) return 'bmp';
  return 'unknown';
}

async function decodeNative(buffer, type) {
  const bmp = await createImageBitmap(new Blob([buffer], { type }), { imageOrientation: 'from-image' });
  if (bmp.width * bmp.height > CANVAS_MAX_AREA) {
    bmp.close();
    throw new Error('too large for canvas');
  }
  const c = new OffscreenCanvas(bmp.width, bmp.height);
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(bmp, 0, 0);
  bmp.close();
  return g.getImageData(0, 0, c.width, c.height);
}

async function decode(buffer, format) {
  try {
    return await decodeNative(buffer, MIME[format] || `image/${format}`);
  } catch {
    if (format === 'jpeg') return decodeJpeg(buffer);
    if (format === 'png') return decodePng(buffer);
    if (format === 'webp') return decodeWebp(buffer);
    if (format === 'avif') return decodeAvif(buffer);
    throw new Error(`${format.toUpperCase()} cannot be decoded in this browser`);
  }
}

function hasAlpha(img) {
  const d = img.data;
  const step = Math.max(4, Math.floor(d.length / 4 / 200_000) * 4);
  for (let i = 3; i < d.length; i += step) if (d[i] < 255) return true;
  return false;
}

function flatten(img) {
  const d = new Uint8ClampedArray(img.data);
  for (let i = 0; i < d.length; i += 4) {
    const a = d[i + 3] / 255;
    d[i] = d[i] * a + 255 * (1 - a);
    d[i + 1] = d[i + 1] * a + 255 * (1 - a);
    d[i + 2] = d[i + 2] * a + 255 * (1 - a);
    d[i + 3] = 255;
  }
  return new ImageData(d, img.width, img.height);
}

async function encode(img, fmt, q, alpha) {
  if (fmt === 'webp') return encodeWebp(img, { quality: q.webp });
  if (fmt === 'avif') return encodeAvif(img, { quality: q.avif, speed: img.width * img.height > 8_000_000 ? 8 : 6 });
  if (fmt === 'jpeg') return encodeJpeg(alpha ? flatten(img) : img, { quality: q.jpeg, progressive: true });
  if (fmt === 'png') return oxipng(await encodePng(img), { level: 2 });
  throw new Error(`Unknown format ${fmt}`);
}

const baseName = (n) => (String(n || 'image').replace(/\.[a-z0-9]+$/i, '').replace(/[^a-zA-Z0-9._-]+/g, '-').slice(0, 80) || 'image');

self.onmessage = async ({ data }) => {
  const { id, buffer, name, options } = data;
  try {
    const u8 = new Uint8Array(buffer, 0, Math.min(32, buffer.byteLength));
    const format = sniff(u8);
    // GIF/BMP (and HEIC/TIFF where the browser supports them) are decoded natively below.
    if (format === 'unknown') throw new Error('Not a recognised image file');
    self.postMessage({ id, progress: 'Decoding…' });
    const img = await decode(buffer, format);
    const alpha = hasAlpha(img);
    const input = { name, format, width: img.width, height: img.height, bytes: buffer.byteLength, hasAlpha: alpha };
    const widths = [...new Set((options.widths || []).map((w) => Math.min(w, img.width)))].sort((a, b) => a - b);
    const sizes = widths.length ? widths : [img.width];
    const formats = [...new Set(options.formats.map((f) => (f === 'original' ? (['jpeg', 'png'].includes(format) ? format : 'webp') : f)))];
    const outputs = [];
    const transfer = [];
    for (const w of sizes) {
      const src = w < img.width ? await resize(img, { width: w, height: Math.round((img.height * w) / img.width), method: 'lanczos3', fitMethod: 'stretch' }) : img;
      for (const fmt of formats) {
        self.postMessage({ id, progress: `Encoding ${fmt.toUpperCase()}${sizes.length > 1 ? ` ${w}px` : ''}…` });
        const out = await encode(src, fmt, options.quality, alpha);
        outputs.push({
          filename: `${baseName(name)}${w < img.width ? `-${w}w` : ''}.${EXT[fmt]}`,
          format: fmt,
          mime: MIME[fmt],
          width: src.width,
          height: src.height,
          bytes: out.byteLength,
          savedPercent: Math.round((1 - out.byteLength / buffer.byteLength) * 1000) / 10,
          quality: fmt === 'png' ? 'lossless' : options.quality[fmt],
          buffer: out,
        });
        transfer.push(out);
      }
    }
    self.postMessage({ id, ok: true, result: { input, outputs } }, transfer);
  } catch (err) {
    self.postMessage({ id, ok: false, error: err?.message || String(err) });
  }
};
