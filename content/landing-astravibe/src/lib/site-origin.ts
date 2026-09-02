import { getSecret } from 'astro:env/server';
import { isIP } from 'node:net';

export class SiteOriginError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SiteOriginError';
  }
}
export interface CanonicalOriginValues {
  siteUrl?: string | undefined;
  vercelProductionUrl?: string | undefined;
  requestUrl: URL;
  allowLocalRequestOrigin: boolean;
}

function normalizeHostname(hostname: string): string {
  const withoutTrailingDot = hostname.toLowerCase().replace(/\.+$/, '');
  return withoutTrailingDot.startsWith('[') && withoutTrailingDot.endsWith(']')
    ? withoutTrailingDot.slice(1, -1)
    : withoutTrailingDot;
}

function isLocalhostName(hostname: string): boolean {
  return hostname === 'localhost' || hostname.endsWith('.localhost');
}
function isLoopbackHostname(hostname: string): boolean {
  if (isLocalhostName(hostname)) return true;
  if (isIP(hostname) === 4) return hostname.startsWith('127.');
  return hostname === '::1' || /^::ffff:7f[\da-f]{2}:[\da-f]+$/i.test(hostname);
}

function isPublicDnsHostname(hostname: string): boolean {
  if (isIP(hostname) !== 0 || isLocalhostName(hostname) || !hostname.includes('.') || hostname.length > 253) {
    return false;
  }
  return hostname.split('.').every((label) =>
    label.length > 0 && label.length <= 63 && /^[a-z\d](?:[a-z\d-]*[a-z\d])?$/i.test(label),
  );
}

function parseConfiguredOrigin(
  rawValue: string,
  source: string,
  addHttpsWhenMissing: boolean,
  allowLoopback: boolean,
): string {
  const value = rawValue.trim();
  const candidate = addHttpsWhenMissing && !value.includes('://') ? `https://${value}` : value;

  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    throw new SiteOriginError(`${source} must be a valid absolute URL origin`);
  }

  if (url.username || url.password) {
    throw new SiteOriginError(`${source} must not contain credentials`);
  }
  if (url.pathname !== '/' || url.search || url.hash) {
    throw new SiteOriginError(`${source} must contain only an origin, without path, query, or fragment`);
  }
  const hostname = normalizeHostname(url.hostname);
  const loopback = isLoopbackHostname(hostname);
  if (!isPublicDnsHostname(hostname) && !(allowLoopback && loopback)) {
    throw new SiteOriginError(`${source} must use a public DNS hostname in production`);
  }
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && allowLoopback && loopback)) {
    throw new SiteOriginError(`${source} must use HTTPS outside localhost`);
  }

  url.hostname = isIP(hostname) === 6 ? `[${hostname}]` : hostname;
  return url.origin;
}

/**
 * Resolves the one trusted public origin used in server-generated callback
 * URLs. An explicit SITE_URL wins; Vercel's production domain is the safe
 * deployment fallback. Request hosts are never trusted outside local dev.
 */
export function resolveCanonicalOriginFromValues(values: CanonicalOriginValues): string {
  if (values.siteUrl?.trim()) {
    return parseConfiguredOrigin(values.siteUrl, 'SITE_URL', false, values.allowLocalRequestOrigin);
  }
  if (values.vercelProductionUrl?.trim()) {
    return parseConfiguredOrigin(
      values.vercelProductionUrl,
      'VERCEL_PROJECT_PRODUCTION_URL',
      true,
      values.allowLocalRequestOrigin,
    );
  }

  if (values.allowLocalRequestOrigin) {
    const { requestUrl } = values;
    const hostname = normalizeHostname(requestUrl.hostname);
    if (!isLoopbackHostname(hostname)) {
      throw new SiteOriginError('Refusing non-loopback request origin without SITE_URL');
    }
    if (requestUrl.username || requestUrl.password) {
      throw new SiteOriginError('Local request URL must not contain credentials');
    }
    if (requestUrl.protocol !== 'http:' && requestUrl.protocol !== 'https:') {
      throw new SiteOriginError('Local request URL must use HTTP or HTTPS');
    }
    const normalizedUrl = new URL(requestUrl);
    normalizedUrl.hostname = isIP(hostname) === 6 ? `[${hostname}]` : hostname;
    return normalizedUrl.origin;
  }

  throw new SiteOriginError(
    'Missing SITE_URL / VERCEL_PROJECT_PRODUCTION_URL — cannot create trusted payment callback URLs',
  );
}

export function resolveCanonicalOrigin(requestUrl: URL): string {
  return resolveCanonicalOriginFromValues({
    siteUrl: getSecret('SITE_URL'),
    vercelProductionUrl: getSecret('VERCEL_PROJECT_PRODUCTION_URL'),
    requestUrl,
    allowLocalRequestOrigin: import.meta.env.DEV,
  });
}
