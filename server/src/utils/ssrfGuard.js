const dns = require('dns').promises;
const net = require('net');

const BLOCKED_HOSTNAMES = new Set(['localhost', 'metadata.google.internal']);

function isPrivateIpv4(ip) {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some(p => Number.isNaN(p))) return true;
  const [a, b] = parts;
  if (a === 127) return true; // loopback
  if (a === 10) return true; // 10.0.0.0/8
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  if (a === 169 && b === 254) return true; // 169.254.0.0/16 - link-local, incl. cloud metadata (169.254.169.254)
  if (a === 0) return true; // 0.0.0.0/8
  if (a >= 224) return true; // multicast/reserved
  return false;
}

function isPrivateIp(ip) {
  const type = net.isIP(ip);
  if (type === 4) return isPrivateIpv4(ip);
  if (type === 6) {
    const lower = ip.toLowerCase();
    if (lower === '::1' || lower === '::') return true; // loopback / unspecified
    if (lower.startsWith('::ffff:')) return isPrivateIpv4(lower.slice(7));
    if (/^fe[89ab][0-9a-f]:/.test(lower)) return true; // fe80::/10 link-local
    if (/^f[cd][0-9a-f]{2}:/.test(lower)) return true; // fc00::/7 unique local
    return false;
  }
  return true; // not a recognizable IP literal - treat as unsafe
}

// Resolves the hostname and checks every returned address, so a DNS-rebinding
// hostname (public at registration time, private/metadata at request time)
// is caught at the point where it matters - right before the request is made.
async function isUrlSafe(urlString) {
  let url;
  try {
    url = new URL(urlString);
  } catch {
    return false;
  }

  if (!['http:', 'https:'].includes(url.protocol)) return false;
  if (BLOCKED_HOSTNAMES.has(url.hostname.toLowerCase())) return false;

  // url.hostname keeps the surrounding brackets for IPv6 literals
  // (e.g. "[::1]"), which net.isIP() does not recognize - strip them before
  // checking, otherwise IPv6 literals fall through to a DNS lookup of the
  // literal bracketed string, which fails and is blocked for the wrong
  // reason (masking that public IPv6 literals would be wrongly blocked too).
  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  if (net.isIP(hostname)) {
    return !isPrivateIp(hostname);
  }

  try {
    const records = await dns.lookup(url.hostname, { all: true, verbatim: true });
    if (!records.length) return false;
    return records.every(r => !isPrivateIp(r.address));
  } catch {
    return false; // fail closed if the hostname can't be resolved
  }
}

module.exports = { isUrlSafe, isPrivateIp };
