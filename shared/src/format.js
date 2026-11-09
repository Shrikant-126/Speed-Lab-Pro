// Formatting helpers shared by the client, PDF generator and code generators.

export function formatBytes(bytes, digits = 1) {
  if (bytes === null || bytes === undefined || Number.isNaN(bytes)) return '—';
  const abs = Math.abs(bytes);
  if (abs < 1024) return `${Math.round(bytes)} B`;
  if (abs < 1024 * 1024) return `${(bytes / 1024).toFixed(digits)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(digits)} MB`;
}

export function formatMs(ms) {
  if (ms === null || ms === undefined || Number.isNaN(ms)) return '—';
  if (Math.abs(ms) >= 1000) return `${(ms / 1000).toFixed(2)} s`;
  return `${Math.round(ms)} ms`;
}

export function formatMetric(key, value) {
  if (value === null || value === undefined || Number.isNaN(value)) return 'Unavailable';
  if (key === 'cls') return value.toFixed(3);
  return formatMs(value);
}

export function formatPercent(v, digits = 0) {
  if (v === null || v === undefined || Number.isNaN(v)) return '—';
  return `${v.toFixed(digits)}%`;
}

export function shortUrl(url, max = 70) {
  if (!url) return '';
  let s = url;
  try {
    const u = new URL(url);
    s = u.host + u.pathname + (u.search || '');
  } catch {
    /* keep raw */
  }
  if (s.length <= max) return s;
  return `${s.slice(0, Math.floor(max / 2) - 1)}…${s.slice(-Math.floor(max / 2))}`;
}

export function fileName(url) {
  try {
    const u = new URL(url);
    const parts = u.pathname.split('/').filter(Boolean);
    return parts[parts.length - 1] || u.host;
  } catch {
    return url;
  }
}

export function hostOf(url) {
  try {
    return new URL(url).host;
  } catch {
    return '';
  }
}

export function escapeHtmlAttr(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
