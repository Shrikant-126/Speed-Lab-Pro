// Minimal, safe helpers for rewriting a single HTML start tag (no DOM required, works in
// browser and Node). They operate on the opening tag of a snippet only.

import { escapeHtmlAttr } from '../format.js';

const TAG_RE = /^<([a-zA-Z][\w-]*)([^>]*?)(\/?)>/;

export function parseTag(snippet) {
  if (!snippet) return null;
  const m = snippet.trim().match(TAG_RE);
  if (!m) return null;
  const attrs = [];
  const attrRe = /([^\s=/]+)(?:\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;
  let a;
  while ((a = attrRe.exec(m[2]))) {
    attrs.push([a[1], a[3] ?? a[4] ?? a[5] ?? null]);
  }
  return { tag: m[1].toLowerCase(), attrs, selfClosing: !!m[3], rest: snippet.trim().slice(m[0].length) };
}

export function getAttr(parsed, name) {
  const hit = parsed?.attrs.find(([k]) => k.toLowerCase() === name);
  return hit ? hit[1] ?? '' : null;
}

/** Return a new start tag with attributes set (string), boolean (true = bare attr) or removed (null). */
export function setAttrs(snippet, changes, { order } = {}) {
  const p = parseTag(snippet);
  if (!p) return snippet;
  const attrs = [...p.attrs];
  for (const [name, value] of Object.entries(changes)) {
    const idx = attrs.findIndex(([k]) => k.toLowerCase() === name.toLowerCase());
    if (value === null || value === undefined || value === false) {
      if (idx >= 0) attrs.splice(idx, 1);
    } else if (idx >= 0) attrs[idx] = [attrs[idx][0], value === true ? null : String(value)];
    else attrs.push([name, value === true ? null : String(value)]);
  }
  if (order) {
    attrs.sort((x, y) => {
      const ix = order.indexOf(x[0]);
      const iy = order.indexOf(y[0]);
      return (ix < 0 ? 99 : ix) - (iy < 0 ? 99 : iy);
    });
  }
  return buildTag(p.tag, attrs, p.selfClosing) + p.rest;
}

export function buildTag(tag, attrs, selfClosing = false) {
  const list = Array.isArray(attrs) ? attrs : Object.entries(attrs).filter(([, v]) => v !== null && v !== undefined && v !== false);
  const s = list.map(([k, v]) => (v === null || v === true ? ` ${k}` : ` ${k}="${escapeHtmlAttr(v)}"`)).join('');
  return `<${tag}${s}${selfClosing ? ' /' : ''}>`;
}

/** Pretty-print a single tag across lines when it is long. */
export function prettyTag(tagHtml, indent = '') {
  if (tagHtml.length < 100) return indent + tagHtml;
  const p = parseTag(tagHtml);
  if (!p) return indent + tagHtml;
  const lines = p.attrs.map(([k, v]) => `${indent}  ${v === null ? k : `${k}="${escapeHtmlAttr(v)}"`}`);
  return `${indent}<${p.tag}\n${lines.join('\n')}\n${indent}${p.selfClosing ? '/>' : '>'}${p.rest}`;
}

/** Build a reasonable srcset width ladder for a given rendered width. */
export function widthLadder(renderedW, naturalW) {
  const base = [320, 480, 640, 750, 960, 1080, 1280, 1500, 1920, 2400];
  const max = Math.max(renderedW * 2, 640);
  const cap = naturalW ? Math.min(naturalW, max) : max;
  const list = base.filter((w) => w <= cap);
  if (!list.length || list[list.length - 1] < cap * 0.9) list.push(Math.round(cap));
  return [...new Set(list)];
}

/** Insert a width descriptor into a URL using common CDN conventions, or a placeholder. */
export function variantUrl(url, width, format) {
  try {
    const u = new URL(url);
    if (/cdn\.shopify\.com|\/cdn\/shop\//.test(u.href)) {
      u.searchParams.set('width', String(width));
      if (format) u.searchParams.set('format', format === 'jpeg' ? 'pjpg' : format);
      return u.toString();
    }
    if (/imgix\.net|images\.prismic|cloudinary|images\.ctfassets|cdn\.sanity|wixstatic|twic/.test(u.host)) {
      u.searchParams.set('w', String(width));
      if (format) u.searchParams.set('fm', format);
      return u.toString();
    }
    const path = u.pathname;
    const dot = path.lastIndexOf('.');
    const name = dot > 0 ? path.slice(0, dot) : path;
    const ext = format || (dot > 0 ? path.slice(dot + 1) : 'jpg');
    u.pathname = `${name}-${width}w.${ext}`;
    u.search = '';
    return u.toString();
  } catch {
    return url;
  }
}

export function isCdnResizable(url) {
  return /cdn\.shopify\.com|\/cdn\/shop\/|imgix\.net|cloudinary|images\.ctfassets|cdn\.sanity|wixstatic/.test(url || '');
}
