// API client. Attaches the Supabase access token when signed in.

import { getAccessToken } from './supabase.js';

const BASE = (import.meta.env.VITE_API_BASE || '').replace(/\/+$/, '');

export class ApiError extends Error {
  constructor(message, status, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function headers(extra = {}) {
  const h = { ...extra };
  const token = await getAccessToken();
  if (token) h.authorization = `Bearer ${token}`;
  return h;
}

export async function api(path, { method = 'GET', body, signal, raw = false, form } = {}) {
  const init = { method, signal, headers: await headers(body !== undefined ? { 'content-type': 'application/json' } : {}) };
  if (body !== undefined) init.body = JSON.stringify(body);
  if (form) init.body = form;
  let res;
  try {
    res = await fetch(`${BASE}/api${path}`, init);
  } catch (err) {
    if (err.name === 'AbortError') throw err;
    throw new ApiError('Cannot reach the SpeedLab API. Is the server running?', 0, 'NETWORK');
  }
  if (raw) {
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      throw new ApiError(j.error || `Request failed (${res.status})`, res.status, j.code);
    }
    return res;
  }
  if (res.status === 204) return null;
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(json?.error || `Request failed (${res.status})`, res.status, json?.code);
  return json;
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function downloadText(text, filename, type = 'text/plain') {
  downloadBlob(new Blob([text], { type: `${type};charset=utf-8` }), filename);
}
