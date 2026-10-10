import path from 'path';

/**
 * Strict Security Utilities for SyncCast (Phase 5 Hardening)
 * Defends against: SSRF, Path Traversal, Stored XSS, and Injection.
 */

// Allowed audio extensions and MIME types
export const ALLOWED_AUDIO_EXTS = new Set([
  '.mp3',
  '.wav',
  '.m4a',
  '.aac',
  '.ogg',
  '.webm',
  '.flac'
]);

export const ALLOWED_AUDIO_MIMES = new Set([
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/wave',
  'audio/x-wav',
  'audio/mp4',
  'audio/m4a',
  'audio/x-m4a',
  'audio/aac',
  'audio/ogg',
  'audio/webm',
  'audio/flac',
  'application/ogg',
  'application/octet-stream'
]);

/**
 * Validates if an IP address belongs to private/internal/cloud metadata subnets (SSRF Protection)
 */
export function isPrivateOrBlockedHost(hostname) {
  if (!hostname || typeof hostname !== 'string') return true;

  const host = hostname.toLowerCase().trim();

  // Known loopback and cloud metadata names
  const blockedNames = [
    'localhost',
    'localhost.localdomain',
    'metadata.google.internal',
    'instance-data',
    'metadata.aws'
  ];

  if (blockedNames.includes(host)) return true;
  if (host.endsWith('.local') || host.endsWith('.internal') || host.endsWith('.onion')) return true;

  // Handle standard dotted IPv4
  const ipv4Match = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4Match) {
    const [_, o1, o2, o3, o4] = ipv4Match.map(Number);

    // Invalid octets
    if (o1 > 255 || o2 > 255 || o3 > 255 || o4 > 255) return true;

    // 0.0.0.0/8 (Broadcast/Current network)
    if (o1 === 0) return true;

    // 127.0.0.0/8 (Loopback)
    if (o1 === 127) return true;

    // 10.0.0.0/8 (RFC 1918 Private)
    if (o1 === 10) return true;

    // 172.16.0.0/12 (RFC 1918 Private: 172.16 - 172.31)
    if (o1 === 172 && o2 >= 16 && o2 <= 31) return true;

    // 192.168.0.0/16 (RFC 1918 Private)
    if (o1 === 192 && o2 === 168) return true;

    // 169.254.0.0/16 (Link-Local & Cloud Metadata e.g. 169.254.169.254)
    if (o1 === 169 && o2 === 254) return true;

    // 100.64.0.0/10 (Carrier-Grade NAT)
    if (o1 === 100 && o2 >= 64 && o2 <= 127) return true;

    // 224.0.0.0/4 (Multicast) & 240.0.0.0/4 (Reserved)
    if (o1 >= 224) return true;
  }

  // IPv6 loopback / private
  if (host === '::1' || host === '0:0:0:0:0:0:0:1' || host.startsWith('fc') || host.startsWith('fd') || host.startsWith('fe80')) {
    return true;
  }

  // Decimal / hex IP bypasses (e.g. 2130706433 = 127.0.0.1 or 0x7f000001)
  if (/^(0x[0-9a-f]+|\d+)$/i.test(host)) {
    return true;
  }

  return false;
}

/**
 * Sanitizes input strings to prevent Stored XSS and injection
 */
export function sanitizeString(raw, maxLength = 60, fallback = '') {
  if (!raw || typeof raw !== 'string') return fallback;
  // Strip control characters, quotes, and dangerous HTML characters
  const clean = raw.replace(/[<>'"`&\\/]/g, '').trim().slice(0, maxLength);
  return clean || fallback;
}

/**
 * Validates filename to prevent Path Traversal
 */
export function isSafeFilename(filename, targetDir) {
  if (!filename || typeof filename !== 'string') return false;

  // Reject path separators and dot-dot patterns
  if (filename.includes('/') || filename.includes('\\') || filename.includes('..')) {
    return false;
  }

  // Strict alphanumeric, dash, dot, underscore check
  if (!/^[a-zA-Z0-9_\-\.]+$/.test(filename)) {
    return false;
  }

  const ext = path.extname(filename).toLowerCase();
  if (!ALLOWED_AUDIO_EXTS.has(ext)) {
    return false;
  }

  // Verify resolved path stays strictly within target directory
  if (targetDir) {
    const resolvedPath = path.resolve(targetDir, filename);
    const resolvedTarget = path.resolve(targetDir);
    if (!resolvedPath.startsWith(resolvedTarget)) {
      return false;
    }
  }

  return true;
}
