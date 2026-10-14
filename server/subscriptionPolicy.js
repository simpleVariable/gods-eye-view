const PAID_API_PREFIXES = Object.freeze([
  '/api/realtime/token',
  '/api/openai/hud-summary',
  '/api/ais-live',
  '/api/firms',
  '/api/tomtom',
  '/api/google/nearby-places',
  '/api/google/text-search',
]);

const PUBLIC_API_PREFIXES = Object.freeze([
  '/api/account',
  '/api/stripe/webhook',
]);

function matchesPrefix(pathname, prefix) {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function subscriptionTierForPath(pathname) {
  const path = String(pathname || '').split('?')[0];
  return PAID_API_PREFIXES.some((prefix) => matchesPrefix(path, prefix))
    ? 'paid'
    : 'free';
}

export function isSubscriptionExemptPath(pathname) {
  const path = String(pathname || '').split('?')[0];
  return PUBLIC_API_PREFIXES.some((prefix) => matchesPrefix(path, prefix));
}

export function isRuntimeConfigPath(pathname) {
  return String(pathname || '').split('?')[0] === '/api/config';
}
