// Sharp image probe: downloads the most important images (SSRF-safe, size-limited) and
// measures real re-encoded sizes for WebP, AVIF and same-format optimisation.

import { safeFetch, readLimited } from '@speedlab/shared/net';

let sharpMod;
export async function sharpAvailable() {
  if (sharpMod !== undefined) return !!sharpMod;
  try {
    sharpMod = (await import('sharp')).default;
  } catch {
    sharpMod = null;
  }
  return !!sharpMod;
}

function candidates({ lhr, inspection }) {
  const list = new Map();
  const add = (url, weight) => {
    if (!url || !/^https?:/.test(url) || /\.svg(\?|$)/i.test(url)) return;
    list.set(url, Math.max(list.get(url) || 0, weight));
  };
  if (inspection?.lcp?.url) add(inspection.lcp.url, 1e12);
  for (const i of inspection?.images || []) {
    const area = (i.rendered?.w || 0) * (i.rendered?.h || 0);
    add(i.currentSrc || i.src, area + (i.aboveFold ? 1e9 : 0));
  }
  for (const b of inspection?.backgroundImages || []) add(b.url, (b.rendered?.w || 0) * (b.rendered?.h || 0));
  for (const r of lhr?.audits?.['network-requests']?.details?.items || []) {
    if (r.resourceType === 'Image') add(r.url, r.transferSize || 0);
  }
  return [...list.entries()].sort((a, b) => b[1] - a[1]).map(([u]) => u);
}

export async function probeImages({ lhr, inspection, signal, max = Number(process.env.IMAGE_PROBE_MAX || 15) }) {
  if (!(await sharpAvailable())) return null;
  const sharp = sharpMod;
  sharp.concurrency(2);
  const urls = candidates({ lhr, inspection }).slice(0, max);
  const out = {};
  const queue = [...urls];
  const worker = async () => {
    while (queue.length) {
      if (signal?.aborted) return;
      const url = queue.shift();
      try {
        const { response } = await safeFetch(url, { signal, timeoutMs: 15_000, headers: { accept: 'image/avif,image/webp,image/*;q=0.8' } });
        if (!response.ok) {
          await response.body?.cancel().catch(() => {});
          continue;
        }
        const buf = await readLimited(response, 10 * 1024 * 1024);
        const img = sharp(buf, { limitInputPixels: 40_000_000, animated: false, failOn: 'none' });
        const meta = await img.metadata();
        const info = { format: meta.format === 'jpg' ? 'jpeg' : meta.format, width: meta.width, height: meta.height, bytes: buf.length, hasAlpha: !!meta.hasAlpha, servedType: response.headers.get('content-type') };
        if (['jpeg', 'png', 'webp', 'gif', 'tiff', 'avif', 'heif'].includes(meta.format)) {
          const base = () => sharp(buf, { limitInputPixels: 40_000_000, failOn: 'none' }).rotate();
          info.webpBytes = (await base().webp({ quality: 75, effort: 4 }).toBuffer()).length;
          if ((meta.width || 0) * (meta.height || 0) <= 6_000_000) {
            info.avifBytes = (await base().avif({ quality: 50, effort: 2 }).toBuffer()).length;
          }
          if (meta.format === 'jpeg') info.optimizedBytes = (await base().jpeg({ quality: 78, mozjpeg: true }).toBuffer()).length;
          else if (meta.format === 'png') info.optimizedBytes = (await base().png({ compressionLevel: 9, palette: true, quality: 85 }).toBuffer()).length;
          info.quality = { webp: 75, avif: 50, jpeg: 78 };
        }
        out[url] = info;
      } catch {
        /* skip images that fail to download/decode */
      }
    }
  };
  await Promise.all([worker(), worker(), worker()]);
  return out;
}
