// URL validation and SSRF protection.
// Every outbound request made by the API or worker on behalf of a user must pass through
// validatePublicUrl() and (for actual connections) the safe DNS lookup in safeFetch.js.

import dns from 'node:dns/promises';
import ipaddr from 'ipaddr.js';

export class UnsafeUrlError extends Error {
  constructor(message, code = 'UNSAFE_URL') {
    super(message);
    this.name = 'UnsafeUrlError';
    this.code = code;
    this.status = 400;
  }
}

const ALLOWED_PROTOCOLS = new Set(['http:', 'https:']);
const ALLOWED_PORTS = new Set(['', '80', '443', '8080', '8443']);

const BLOCKED_HOST_SUFFIXES = [
  'localhost',
  '.localhost',
  '.local',
  '.internal',
  '.intranet',
  '.lan',
  '.home',
  '.corp',
  '.localdomain',
  '.home.arpa',
];

const BLOCKED_HOSTS = new Set([
  'metadata.google.internal',
  'metadata',
  'instance-data',
  'kubernetes.default',
  'kubernetes.default.svc',
]);

/**
 * Returns true if an IP address string is publicly routable.
 * Blocks loopback, private, link-local (incl. cloud metadata 169.254.169.254),
 * carrier-grade NAT, multicast, reserved, documentation and IPv4-mapped private ranges.
 */
export function isPublicIp(ip) {
  let addr;
  try {
    addr = ipaddr.parse(ip);
  } catch {
    return false;
  }
  if (addr.kind() === 'ipv6' && addr.isIPv4MappedAddress()) {
    addr = addr.toIPv4Address();
  }
  const range = addr.range();
  // ipaddr.js names every special-purpose range; only 'unicast' is public.
  if (range !== 'unicast') return false;

  if (addr.kind() === 'ipv4') {
    const extraBlocked = [
      ['0.0.0.0', 8],
      ['100.64.0.0', 10],
      ['192.0.0.0', 24],
      ['192.0.2.0', 24],
      ['198.18.0.0', 15],
      ['198.51.100.0', 24],
      ['203.0.113.0', 24],
      ['240.0.0.0', 4],
    ];
    for (const [base, bits] of extraBlocked) {
      if (addr.match(ipaddr.parse(base), bits)) return false;
    }
  } else {
    const extraBlocked = [
      ['64:ff9b::', 96],
      ['64:ff9b:1::', 48],
      ['2001:db8::', 32],
      ['2002::', 16],
      ['fc00::', 7],
      ['fe80::', 10],
    ];
    for (const [base, bits] of extraBlocked) {
      if (addr.match(ipaddr.parse(base), bits)) return false;
    }
  }
  return true;
}

/** Normalise user input into a URL object (adds https:// when no scheme is given). */
export function normalizeUrl(input) {
  if (typeof input !== 'string') throw new UnsafeUrlError('URL must be a string', 'INVALID_URL');
  let raw = input.trim();
  if (!raw) throw new UnsafeUrlError('URL is required', 'INVALID_URL');
  if (raw.length > 2048) throw new UnsafeUrlError('URL is too long (max 2048 characters)', 'INVALID_URL');
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) raw = `https://${raw}`;
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new UnsafeUrlError('This is not a valid URL', 'INVALID_URL');
  }
  url.hash = '';
  return url;
}

/** Synchronous structural checks (no DNS). */
export function checkUrlStructure(url) {
  if (!ALLOWED_PROTOCOLS.has(url.protocol)) {
    throw new UnsafeUrlError('Only http:// and https:// URLs can be scanned', 'BLOCKED_PROTOCOL');
  }
  if (url.username || url.password) {
    throw new UnsafeUrlError('URLs containing credentials are not allowed', 'BLOCKED_CREDENTIALS');
  }
  if (!ALLOWED_PORTS.has(url.port)) {
    throw new UnsafeUrlError('Only ports 80, 443, 8080 and 8443 are allowed', 'BLOCKED_PORT');
  }
  const host = url.hostname.toLowerCase().replace(/\.$/, '').replace(/^\[|\]$/g, '');
  if (!host) throw new UnsafeUrlError('URL has no host', 'INVALID_URL');
  if (BLOCKED_HOSTS.has(host) || BLOCKED_HOST_SUFFIXES.some((s) => host === s.replace(/^\./, '') || host.endsWith(s))) {
    throw new UnsafeUrlError('Local and internal hostnames cannot be scanned', 'BLOCKED_HOST');
  }
  if (ipaddr.isValid(host)) {
    if (!isPublicIp(host)) throw new UnsafeUrlError('Private, loopback and reserved IP addresses cannot be scanned', 'BLOCKED_IP');
  } else if (!host.includes('.')) {
    throw new UnsafeUrlError('Hostname must be a public domain name', 'BLOCKED_HOST');
  }
  return host;
}

const dnsCache = new Map();
const DNS_TTL_MS = 60_000;

/** Resolve all A/AAAA records and require every one of them to be public. */
export async function resolvePublic(host) {
  if (ipaddr.isValid(host)) {
    if (!isPublicIp(host)) throw new UnsafeUrlError('Address is not public', 'BLOCKED_IP');
    return [{ address: host, family: ipaddr.parse(host).kind() === 'ipv6' ? 6 : 4 }];
  }
  const cached = dnsCache.get(host);
  if (cached && cached.expires > Date.now()) return cached.addresses;

  let addresses;
  try {
    addresses = await dns.lookup(host, { all: true, verbatim: true });
  } catch (err) {
    throw new UnsafeUrlError(`Could not resolve host "${host}" (${err.code || 'DNS error'})`, 'DNS_FAILED');
  }
  if (!addresses.length) throw new UnsafeUrlError(`Host "${host}" has no DNS records`, 'DNS_FAILED');
  const bad = addresses.find((a) => !isPublicIp(a.address));
  if (bad) {
    throw new UnsafeUrlError(`Host "${host}" resolves to a non-public address and cannot be scanned`, 'BLOCKED_IP');
  }
  dnsCache.set(host, { addresses, expires: Date.now() + DNS_TTL_MS });
  return addresses;
}

/** Full validation: structure + DNS resolution. Returns the normalised URL string. */
export async function validatePublicUrl(input) {
  const url = input instanceof URL ? input : normalizeUrl(input);
  const host = checkUrlStructure(url);
  await resolvePublic(host);
  return url.toString();
}
