// Uploaded source project optimizer.
// SECURITY: uploaded files are treated purely as data. Nothing is executed; HTML/CSS/JS are
// transformed with string/regex rewrites, CSS is minified with csso and JS with terser
// (both only parse – they never evaluate code). Images are processed with Sharp if installed.
//
// The flow is stateless: analyzeProject() proposes changes; applyProject() re-runs the same
// deterministic analysis and applies only the change ids the user approved.

import JSZip from 'jszip';
import path from 'node:path';

export const UPLOAD_LIMITS = {
  maxUploadBytes: 25 * 1024 * 1024,
  maxFiles: 3000,
  maxUncompressedBytes: 150 * 1024 * 1024,
  maxFileBytes: 15 * 1024 * 1024,
};

const TEXT_EXT = new Set(['.html', '.htm', '.liquid', '.php', '.twig', '.hbs', '.njk', '.ejs', '.css', '.scss', '.js', '.mjs', '.jsx', '.json', '.svg', '.txt', '.md', '.xml', '.vue', '.svelte', '.ts', '.tsx']);
const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.avif', '.ico']);
const OTHER_EXT = new Set(['.woff', '.woff2', '.ttf', '.otf', '.eot', '.mp4', '.webm']);
const MARKUP_EXT = new Set(['.html', '.htm', '.liquid', '.php', '.twig', '.hbs', '.njk', '.ejs', '.vue', '.svelte']);
const SKIP_DIRS = /(^|\/)(node_modules|\.git|\.svn|__MACOSX|vendor\/bundle)(\/|$)/;

export class UploadError extends Error {
  constructor(message) {
    super(message);
    this.status = 400;
    this.code = 'UPLOAD_INVALID';
  }
}

export function safeRelativePath(p) {
  const norm = path.posix.normalize(String(p).replace(/\\/g, '/')).replace(/^\/+/, '');
  if (!norm || norm.startsWith('..') || norm.includes('/../') || /^[a-zA-Z]:/.test(norm) || norm.includes('\0')) return null;
  return norm;
}

export function isAllowedFile(p) {
  const ext = path.posix.extname(p).toLowerCase();
  return TEXT_EXT.has(ext) || IMAGE_EXT.has(ext) || OTHER_EXT.has(ext);
}

/** Read uploaded files (individual files or a single .zip) into [{ path, buffer }]. */
export async function readUpload(uploaded) {
  let total = 0;
  const out = [];
  const skipped = [];
  for (const f of uploaded) {
    const name = safeRelativePath(f.originalname || f.name || 'file');
    if (!name) throw new UploadError(`Invalid file name: ${f.originalname}`);
    if (name.toLowerCase().endsWith('.zip')) {
      let zip;
      try {
        zip = await JSZip.loadAsync(f.buffer, { checkCRC32: true });
      } catch {
        throw new UploadError('The ZIP archive could not be read');
      }
      const entries = Object.values(zip.files).filter((e) => !e.dir);
      if (entries.length > UPLOAD_LIMITS.maxFiles) throw new UploadError(`Archive contains more than ${UPLOAD_LIMITS.maxFiles} files`);
      for (const e of entries) {
        const p = safeRelativePath(e.name);
        if (!p) throw new UploadError(`Archive contains an unsafe path: ${e.name}`);
        if (SKIP_DIRS.test(p) || !isAllowedFile(p)) {
          skipped.push(p);
          continue;
        }
        // eslint-disable-next-line no-underscore-dangle
        const declared = e._data?.uncompressedSize ?? 0;
        if (declared > UPLOAD_LIMITS.maxFileBytes) throw new UploadError(`${p} is larger than ${UPLOAD_LIMITS.maxFileBytes / 1048576} MB`);
        const buffer = await e.async('nodebuffer');
        total += buffer.length;
        if (buffer.length > UPLOAD_LIMITS.maxFileBytes) throw new UploadError(`${p} is too large`);
        if (total > UPLOAD_LIMITS.maxUncompressedBytes) throw new UploadError('Archive expands beyond the 150 MB limit');
        out.push({ path: p, buffer });
      }
    } else {
      if (!isAllowedFile(name)) {
        skipped.push(name);
        continue;
      }
      total += f.buffer.length;
      out.push({ path: name, buffer: f.buffer });
    }
  }
  if (!out.length) throw new UploadError('No supported files found (HTML, Liquid, PHP, CSS, JS, images).');
  // Strip a single common top-level folder for nicer paths.
  const tops = new Set(out.map((f) => f.path.split('/')[0]));
  if (tops.size === 1 && out.every((f) => f.path.includes('/'))) {
    const prefix = `${[...tops][0]}/`;
    for (const f of out) f.path = f.path.slice(prefix.length);
  }
  return { files: out, skipped };
}

async function loadSharp() {
  try {
    return (await import('sharp')).default;
  } catch {
    return null;
  }
}

function tagIter(text, tagName) {
  const re = new RegExp(`<${tagName}\\b[^>]*>`, 'gi');
  const list = [];
  let m;
  while ((m = re.exec(text))) list.push({ start: m.index, end: m.index + m[0].length, html: m[0] });
  return list;
}

const has = (tag, attr) => new RegExp(`\\s${attr}(\\s*=|\\s|>|/)`, 'i').test(tag);
const attrVal = (tag, attr) => tag.match(new RegExp(`\\s${attr}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'))?.slice(2).find((x) => x !== undefined) ?? null;
const addAttrs = (tag, s) => tag.replace(/\s*(\/?)>$/, (m, slash) => `${s}${slash ? ' /' : ''}>`);

function lineOf(text, index) {
  return text.slice(0, index).split('\n').length;
}

/** Deterministic analysis. Returns proposed changes (with ids) and file stats. */
export async function analyzeProject(files, { withSharp = true } = {}) {
  const sharp = withSharp ? await loadSharp() : null;
  const changes = [];
  const advisories = [];
  const imageMeta = new Map();

  if (sharp) {
    for (const f of files) {
      const ext = path.posix.extname(f.path).toLowerCase();
      if (!['.jpg', '.jpeg', '.png', '.gif', '.webp', '.avif'].includes(ext)) continue;
      try {
        const meta = await sharp(f.buffer, { limitInputPixels: 50_000_000 }).metadata();
        imageMeta.set(f.path, { width: meta.width, height: meta.height, format: meta.format, hasAlpha: meta.hasAlpha, bytes: f.buffer.length });
      } catch {
        /* unreadable image – ignore */
      }
    }
  }
  const findImage = (fromPath, src) => {
    if (!src || /^(https?:|data:|\/\/)|\{\{|<\?/.test(src)) return null;
    const clean = src.split(/[?#]/)[0];
    const candidates = [
      path.posix.normalize(path.posix.join(path.posix.dirname(fromPath), clean)),
      clean.replace(/^\/+/, ''),
    ];
    for (const c of candidates) if (imageMeta.has(c)) return c;
    const base = path.posix.basename(clean);
    const hits = [...imageMeta.keys()].filter((k) => path.posix.basename(k) === base);
    return hits.length === 1 ? hits[0] : null;
  };

  for (const f of files) {
    const ext = path.posix.extname(f.path).toLowerCase();
    if (MARKUP_EXT.has(ext)) {
      const text = f.buffer.toString('utf8');
      const headEnd = text.search(/<\/head>/i);
      const imgs = tagIter(text, 'img');
      imgs.forEach((t, i) => {
        const loading = attrVal(t.html, 'loading');
        if (i === 0 && loading === 'lazy' && ext !== '.php') {
          changes.push({ rule: 'img-first-eager', file: f.path, start: t.start, end: t.end, before: t.html, after: addAttrs(t.html.replace(/\sloading\s*=\s*("lazy"|'lazy'|lazy)/i, ' loading="eager"'), has(t.html, 'fetchpriority') ? '' : ' fetchpriority="high"'), description: 'First image in the file is lazy-loaded; it is likely above the fold (verify it is your LCP image).', risk: 'medium', selected: false });
        } else if (i >= 2 && !loading) {
          changes.push({ rule: 'img-lazy', file: f.path, start: t.start, end: t.end, before: t.html, after: addAttrs(t.html, ` loading="lazy"${has(t.html, 'decoding') ? '' : ' decoding="async"'}`), description: 'Lazy-load image that is not among the first two images in the template.', risk: 'low', selected: true });
        }
        if (!has(t.html, 'width') || !has(t.html, 'height')) {
          const img = findImage(f.path, attrVal(t.html, 'src'));
          const meta = img && imageMeta.get(img);
          if (meta?.width && meta?.height && !has(t.html, 'width') && !has(t.html, 'height')) {
            changes.push({ rule: 'img-dimensions', file: f.path, start: t.start, end: t.end, before: t.html, after: addAttrs(t.html, ` width="${meta.width}" height="${meta.height}"`), description: `Add intrinsic size ${meta.width}×${meta.height} (read from ${img}) to prevent layout shift. Make sure your CSS sets height:auto.`, risk: 'low', selected: true });
          }
        }
      });
      // Scripts
      const scripts = tagIter(text, 'script');
      scripts.forEach((t) => {
        if (!has(t.html, 'src') || has(t.html, 'async') || has(t.html, 'defer') || /type\s*=\s*["']?module/i.test(t.html)) return;
        if (headEnd >= 0 && t.start > headEnd) return;
        const src = attrVal(t.html, 'src') || '';
        const laterInline = scripts.some((s) => s.start > t.start && !has(s.html, 'src') && !/type\s*=\s*["']?(application\/ld\+json|text\/template)/i.test(s.html));
        changes.push({ rule: 'script-defer', file: f.path, start: t.start, end: t.end, before: t.html, after: addAttrs(t.html, ' defer'), description: `Defer render-blocking script ${src}.${laterInline ? ' Inline scripts follow it in this file – if they depend on it, wrap them in a DOMContentLoaded listener.' : ''}`, risk: laterInline || /jquery/i.test(src) ? 'medium' : 'low', selected: !laterInline && !/jquery/i.test(src) });
      });
      tagIter(text, 'iframe').forEach((t) => {
        if (has(t.html, 'loading')) return;
        changes.push({ rule: 'iframe-lazy', file: f.path, start: t.start, end: t.end, before: t.html, after: addAttrs(t.html, ' loading="lazy"'), description: 'Lazy-load iframe embed.', risk: 'low', selected: true });
      });
      tagIter(text, 'video').forEach((t) => {
        const add = [];
        if (has(t.html, 'autoplay') && !has(t.html, 'muted')) add.push(' muted');
        if (has(t.html, 'autoplay') && !has(t.html, 'playsinline')) add.push(' playsinline');
        if (!has(t.html, 'preload')) add.push(has(t.html, 'autoplay') ? ' preload="metadata"' : ' preload="none"');
        if (add.length) changes.push({ rule: 'video-attrs', file: f.path, start: t.start, end: t.end, before: t.html, after: addAttrs(t.html, add.join('')), description: `Add ${add.join('').trim()} to <video>.`, risk: 'low', selected: true });
        if (!has(t.html, 'poster')) advisories.push({ file: f.path, line: lineOf(text, t.start), message: '<video> has no poster image.' });
      });
      tagIter(text, 'link').forEach((t) => {
        const href = attrVal(t.html, 'href') || '';
        if (/fonts\.googleapis\.com\/css/.test(href) && !/display=/.test(href)) {
          const newHref = href + (href.includes('?') ? '&' : '?') + 'display=swap';
          changes.push({ rule: 'google-fonts-display', file: f.path, start: t.start, end: t.end, before: t.html, after: t.html.replace(href, newHref), description: 'Add display=swap to Google Fonts so text renders immediately.', risk: 'low', selected: true });
        }
      });
      if (/fonts\.googleapis\.com/.test(text) && !/rel\s*=\s*["']?preconnect["']?[^>]*fonts\.gstatic\.com|fonts\.gstatic\.com[^>]*preconnect/i.test(text)) {
        const firstLink = tagIter(text, 'link').find((t) => /fonts\.googleapis\.com/.test(t.html));
        if (firstLink) {
          changes.push({ rule: 'preconnect-fonts', file: f.path, start: firstLink.start, end: firstLink.start, before: '', after: '<link rel="preconnect" href="https://fonts.googleapis.com">\n<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n', description: 'Preconnect to Google Fonts origins.', risk: 'low', selected: true });
        }
      }
      if (/\|\s*img_url\s*:/.test(text)) advisories.push({ file: f.path, line: lineOf(text, text.search(/\|\s*img_url\s*:/)), message: 'Deprecated Shopify img_url filter – replace with image_url | image_tag (responsive srcset, width/height, lazy loading).' });
      if (/wp_enqueue_script\s*\([^;]*\)\s*;/.test(text) && !/strategy/.test(text)) advisories.push({ file: f.path, line: lineOf(text, text.search(/wp_enqueue_script/)), message: 'wp_enqueue_script without a loading strategy – WordPress 6.3+ supports array( "strategy" => "defer" ).' });
    }

    if (ext === '.css' || ext === '.scss') {
      const text = f.buffer.toString('utf8');
      const re = /@font-face\s*\{[^}]*\}/gi;
      let m;
      while ((m = re.exec(text))) {
        if (/font-display\s*:/i.test(m[0])) continue;
        const after = m[0].replace(/\}\s*$/, '  font-display: swap;\n}');
        changes.push({ rule: 'font-display', file: f.path, start: m.index, end: m.index + m[0].length, before: m[0], after, description: 'Add font-display: swap to @font-face.', risk: 'low', selected: true });
      }
      const imp = text.match(/@import\s+(url\()?["']?[^"');]+/gi);
      if (imp) advisories.push({ file: f.path, line: lineOf(text, text.indexOf(imp[0])), message: `@import creates sequential requests: ${imp.slice(0, 3).join(', ')}. Link these files from HTML or bundle them.` });
      if (ext === '.css' && !/\.min\.css$/i.test(f.path) && f.buffer.length > 2048) {
        changes.push({ rule: 'minify-css', file: f.path, whole: true, before: `${f.buffer.length} bytes`, after: '(minified with csso)', description: 'Minify CSS (csso, structural optimisations off).', risk: 'low', selected: false });
      }
    }
    if ((ext === '.js' || ext === '.mjs') && !/\.min\.m?js$/i.test(f.path) && f.buffer.length > 2048) {
      changes.push({ rule: 'minify-js', file: f.path, whole: true, before: `${f.buffer.length} bytes`, after: '(minified with terser)', description: 'Minify JavaScript (terser, no unsafe transforms).', risk: 'medium', selected: false });
    }
    if (sharp && ['.jpg', '.jpeg', '.png'].includes(ext) && f.buffer.length > 30_000) {
      changes.push({ rule: 'webp-convert', file: f.path, whole: true, before: `${f.buffer.length} bytes`, after: `${f.path.replace(/\.(jpe?g|png)$/i, '.webp')}`, description: 'Create a WebP copy (quality 78) next to the original and serve it via <picture> in templates that reference it.', risk: 'low', selected: false });
    }
  }

  changes.forEach((c, i) => {
    c.id = `${c.rule}:${c.file}:${c.start ?? 'all'}:${i}`;
    if (c.start !== undefined && !c.whole) {
      const text = files.find((f) => f.path === c.file).buffer.toString('utf8');
      c.line = lineOf(text, c.start);
    }
  });

  return {
    files: files.map((f) => ({ path: f.path, bytes: f.buffer.length, image: imageMeta.get(f.path) || null })),
    changes,
    advisories,
    sharpAvailable: !!sharp,
  };
}

/** Apply approved changes and build the output ZIP (original/, optimized/, CHANGES.md). */
export async function applyProject(files, approvedIds) {
  const approved = new Set(approvedIds);
  const analysis = await analyzeProject(files);
  const chosen = analysis.changes.filter((c) => approved.has(c.id));
  const sharp = await loadSharp();
  const out = new Map(files.map((f) => [f.path, f.buffer]));
  const extra = new Map();
  const applied = [];
  const failed = [];

  // 1) Text edits per file, applied from the end so offsets stay valid.
  const byFile = new Map();
  for (const c of chosen.filter((x) => !x.whole)) byFile.set(c.file, [...(byFile.get(c.file) || []), c]);
  for (const [file, list] of byFile) {
    let text = out.get(file).toString('utf8');
    const sorted = [...list].sort((a, b) => b.start - a.start || b.end - a.end);
    let lastStart = Infinity;
    for (const c of sorted) {
      if (c.end > lastStart) {
        failed.push({ ...c, reason: 'Overlaps another change on the same tag' });
        continue;
      }
      text = text.slice(0, c.start) + c.after + text.slice(c.end);
      lastStart = c.start;
      applied.push(c);
    }
    out.set(file, Buffer.from(text, 'utf8'));
  }

  // 2) WebP conversions + <picture> wrapping in markup that references them.
  const converted = [];
  for (const c of chosen.filter((x) => x.rule === 'webp-convert')) {
    if (!sharp) {
      failed.push({ ...c, reason: 'Sharp is not installed on the server' });
      continue;
    }
    try {
      const webp = await sharp(out.get(c.file), { limitInputPixels: 50_000_000 }).webp({ quality: 78 }).toBuffer();
      const target = c.file.replace(/\.(jpe?g|png)$/i, '.webp');
      if (webp.length < out.get(c.file).length) {
        extra.set(target, webp);
        converted.push({ from: c.file, to: target });
        applied.push({ ...c, after: `${target} (${webp.length} bytes, ${Math.round((1 - webp.length / out.get(c.file).length) * 100)}% smaller)` });
      } else failed.push({ ...c, reason: 'WebP was not smaller than the original' });
    } catch (err) {
      failed.push({ ...c, reason: err.message });
    }
  }
  if (converted.length) {
    for (const [file, buf] of out) {
      if (!MARKUP_EXT.has(path.posix.extname(file).toLowerCase())) continue;
      let text = buf.toString('utf8');
      let changed = 0;
      text = text.replace(/<img\b[^>]*>/gi, (tag, offset, whole) => {
        const src = attrVal(tag, 'src');
        if (!src) return tag;
        const hit = converted.find((cv) => path.posix.basename(src.split(/[?#]/)[0]) === path.posix.basename(cv.from));
        if (!hit) return tag;
        if (/<picture[^>]*>\s*(<source[^>]*>\s*)*$/i.test(whole.slice(Math.max(0, offset - 400), offset))) return tag;
        changed += 1;
        const webpSrc = src.replace(/\.(jpe?g|png)(?=([?#]|$))/i, '.webp');
        return `<picture><source type="image/webp" srcset="${webpSrc}">${tag}</picture>`;
      });
      if (changed) {
        out.set(file, Buffer.from(text, 'utf8'));
        applied.push({ rule: 'picture-webp', file, description: `Wrapped ${changed} <img> in <picture> with WebP source.` });
      }
    }
  }

  // 3) Minification (runs on the already-edited content).
  for (const c of chosen.filter((x) => x.rule === 'minify-css' || x.rule === 'minify-js')) {
    try {
      const src = out.get(c.file).toString('utf8');
      let min;
      if (c.rule === 'minify-css') {
        const { minify } = await import('csso');
        min = minify(src, { restructure: false, comments: false }).css;
      } else {
        const { minify } = await import('terser');
        const r = await minify(src, { compress: { unsafe: false, passes: 1 }, mangle: true, module: /\.mjs$/.test(c.file) || /\b(import|export)\s/.test(src) });
        min = r.code;
      }
      if (min && min.length < src.length) {
        out.set(c.file, Buffer.from(min, 'utf8'));
        applied.push({ ...c, after: `${min.length} bytes (${Math.round((1 - min.length / src.length) * 100)}% smaller)` });
      }
    } catch (err) {
      failed.push({ ...c, reason: `Minification failed: ${err.message}` });
    }
  }

  const zip = new JSZip();
  for (const f of files) zip.file(`original/${f.path}`, f.buffer);
  for (const [p, b] of out) zip.file(`optimized/${p}`, b);
  for (const [p, b] of extra) zip.file(`optimized/${p}`, b);
  const md = [
    '# SpeedLab Pro – Optimization change summary',
    '',
    `Generated: ${new Date().toISOString()}`,
    '',
    '- `original/` – untouched backup of your uploaded files',
    '- `optimized/` – files with the approved changes applied',
    '',
    `## Applied changes (${applied.length})`,
    '',
    ...applied.map((c) => `- **${c.rule}** \`${c.file}\`${c.line ? ` (line ${c.line})` : ''} – ${c.description}${c.whole ? ` → ${c.after}` : ''}`),
    '',
    failed.length ? `## Not applied (${failed.length})\n\n${failed.map((c) => `- ${c.rule} \`${c.file}\` – ${c.reason}`).join('\n')}\n` : '',
    analysis.advisories.length ? `## Manual review recommended\n\n${analysis.advisories.map((a) => `- \`${a.file}\`${a.line ? `:${a.line}` : ''} – ${a.message}`).join('\n')}\n` : '',
    '## Before deploying',
    '',
    'Review the diff (e.g. `git diff --no-index original optimized`), test every template, then deploy.',
  ].join('\n');
  zip.file('CHANGES.md', md);
  const buffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 6 } });
  return { buffer, applied, failed };
}
