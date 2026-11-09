// Image conversion/optimisation with Sharp: WebP, AVIF, optimised JPEG/PNG, optional
// responsive widths. Input is treated as untrusted data (pixel limits, format whitelist).

export class ImageConvertError extends Error {
  constructor(message) {
    super(message);
    this.status = 400;
    this.code = 'IMAGE_INVALID';
  }
}

let sharpMod;
export async function loadSharp() {
  if (sharpMod !== undefined) return sharpMod;
  try {
    sharpMod = (await import('sharp')).default;
  } catch {
    sharpMod = null;
  }
  return sharpMod;
}

const INPUT_FORMATS = new Set(['jpeg', 'png', 'webp', 'avif', 'gif', 'tiff', 'heif']);
const MIME = { webp: 'image/webp', avif: 'image/avif', jpeg: 'image/jpeg', png: 'image/png' };
const EXT = { webp: 'webp', avif: 'avif', jpeg: 'jpg', png: 'png' };
export const DEFAULT_QUALITY = { webp: 78, avif: 50, jpeg: 80, png: 85 };
export const LIMITS = { maxFiles: 15, maxFileBytes: 15 * 1024 * 1024, maxOutputs: 80, maxPixels: 60_000_000 };

function clampQ(q, fallback) {
  const n = Number(q);
  return Number.isFinite(n) ? Math.max(1, Math.min(100, Math.round(n))) : fallback;
}

export function parseOptions(raw = {}) {
  const formats = (Array.isArray(raw.formats) ? raw.formats : String(raw.formats || 'webp').split(','))
    .map((f) => String(f).trim().toLowerCase())
    .map((f) => (f === 'jpg' ? 'jpeg' : f))
    .filter((f) => ['webp', 'avif', 'jpeg', 'png', 'original'].includes(f));
  const widths = (Array.isArray(raw.widths) ? raw.widths : String(raw.widths || '').split(','))
    .map((w) => parseInt(w, 10))
    .filter((w) => Number.isFinite(w) && w >= 16 && w <= 8000);
  const q = raw.quality || {};
  return {
    formats: [...new Set(formats.length ? formats : ['webp'])],
    widths: [...new Set(widths)].sort((a, b) => a - b).slice(0, 8),
    quality: {
      webp: clampQ(q.webp, DEFAULT_QUALITY.webp),
      avif: clampQ(q.avif, DEFAULT_QUALITY.avif),
      jpeg: clampQ(q.jpeg, DEFAULT_QUALITY.jpeg),
      png: clampQ(q.png, DEFAULT_QUALITY.png),
    },
    keepMetadata: raw.keepMetadata === true || raw.keepMetadata === 'true',
  };
}

const baseName = (name) => (String(name || 'image').split(/[\\/]/).pop().replace(/\.[a-z0-9]+$/i, '').replace(/[^a-zA-Z0-9._-]+/g, '-').slice(0, 80) || 'image');

/**
 * Convert one image buffer.
 * @returns {{ input, outputs: Array<{ filename, format, mime, width, height, bytes, savedPercent, data: Buffer }> }}
 */
export async function convertImage(buffer, name, options) {
  const sharp = await loadSharp();
  if (!sharp) {
    const err = new Error('Sharp is not installed on the server (npm i sharp)');
    err.status = 503;
    err.code = 'SHARP_UNAVAILABLE';
    throw err;
  }
  const opts = parseOptions(options);
  const open = () => sharp(buffer, { limitInputPixels: LIMITS.maxPixels, failOn: 'error', animated: false });
  let meta;
  try {
    meta = await open().metadata();
  } catch {
    throw new ImageConvertError(`${name}: not a valid image`);
  }
  if (!INPUT_FORMATS.has(meta.format)) throw new ImageConvertError(`${name}: unsupported format ${meta.format || 'unknown'} (use JPG, PNG, WebP, AVIF, GIF or TIFF)`);
  if (!meta.width || !meta.height) throw new ImageConvertError(`${name}: missing dimensions`);

  // Account for EXIF orientation when reporting dimensions.
  const rotated = (meta.orientation || 1) >= 5;
  const width = rotated ? meta.height : meta.width;
  const height = rotated ? meta.width : meta.height;
  const input = { name, format: meta.format === 'jpeg' ? 'jpeg' : meta.format, width, height, bytes: buffer.length, hasAlpha: !!meta.hasAlpha };

  const targetWidths = opts.widths.length ? [...new Set(opts.widths.map((w) => Math.min(w, width)))] : [null];
  const formats = opts.formats.map((f) => (f === 'original' ? (['jpeg', 'png'].includes(input.format) ? input.format : 'webp') : f));
  const uniqFormats = [...new Set(formats)];
  if (targetWidths.length * uniqFormats.length > LIMITS.maxOutputs) throw new ImageConvertError('Too many output variants requested');

  const outputs = [];
  const base = baseName(name);
  for (const w of targetWidths) {
    for (const fmt of uniqFormats) {
      let p = open().rotate();
      if (w && w < width) p = p.resize({ width: w, withoutEnlargement: true });
      if (opts.keepMetadata) p = p.keepMetadata?.() || p.withMetadata();
      if (fmt === 'webp') p = p.webp({ quality: opts.quality.webp, effort: 5, alphaQuality: 90, smartSubsample: true });
      else if (fmt === 'avif') p = p.avif({ quality: opts.quality.avif, effort: width * height > 12_000_000 ? 2 : 4, chromaSubsampling: '4:2:0' });
      else if (fmt === 'jpeg') p = (input.hasAlpha ? p.flatten({ background: '#ffffff' }) : p).jpeg({ quality: opts.quality.jpeg, mozjpeg: true, progressive: true });
      else if (fmt === 'png') p = p.png({ compressionLevel: 9, adaptiveFiltering: true, palette: opts.quality.png < 100, quality: opts.quality.png, effort: 8 });
      const { data, info } = await p.toBuffer({ resolveWithObject: true });
      const suffix = w && w < width ? `-${info.width}w` : '';
      outputs.push({
        filename: `${base}${suffix}.${EXT[fmt]}`,
        format: fmt,
        mime: MIME[fmt],
        width: info.width,
        height: info.height,
        bytes: data.length,
        savedPercent: Math.round((1 - data.length / buffer.length) * 1000) / 10,
        quality: opts.quality[fmt],
        data,
      });
    }
  }
  return { input, outputs, options: opts };
}
