import { createHash, randomBytes, randomUUID, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import Stripe from 'stripe';
import { databaseConfigured, ensureSchema, getPool } from './db.js';
import { isRuntimeConfigPath, isSubscriptionExemptPath, subscriptionTierForPath } from './subscriptionPolicy.js';

const scrypt = promisify(scryptCallback);
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const MAGIC_TTL_MS = 15 * 60 * 1000;
const BODY_LIMIT = 32 * 1024;
const AUTH_WINDOW_MS = 10 * 60 * 1000;
const AUTH_MAX_ATTEMPTS = 12;
const authAttempts = new Map();
let stripe;
let freeForAllCache = { value: true, expiresAt: 0 };

function json(res, status, body) {
  if (res.headersSent) return;
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(JSON.stringify(body));
}

async function readBody(req, maxBytes = BODY_LIMIT) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBytes) throw Object.assign(new Error('Request body too large'), { status: 413 });
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function readJson(req) {
  let value;
  try {
    value = JSON.parse((await readBody(req)).toString('utf8') || '{}');
  } catch (error) {
    if (error.status) throw error;
    throw Object.assign(new Error('Invalid JSON body'), { status: 400 });
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw Object.assign(new Error('Invalid JSON body'), { status: 400 });
  }
  return value;
}

function hash(value) {
  return createHash('sha256').update(value).digest('hex');
}

function normalizeEmail(value) {
  const email = String(value || '').trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return email;
}

function parseCookies(header = '') {
  return Object.fromEntries(String(header).split(';').map((part) => {
    const index = part.indexOf('=');
    if (index < 0) return ['', ''];
    const key = part.slice(0, index).trim();
    try { return [key, decodeURIComponent(part.slice(index + 1).trim())]; } catch { return [key, '']; }
  }).filter(([key]) => key));
}

function clientKey(req) {
  if (process.env.GEV_TRUST_PROXY === '1') {
    const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
    if (forwarded) return forwarded;
  }
  return String(req.socket?.remoteAddress || 'local');
}

function authAllowed(req) {
  const now = Date.now();
  const key = clientKey(req);
  const recent = (authAttempts.get(key) || []).filter((time) => now - time < AUTH_WINDOW_MS);
  if (recent.length >= AUTH_MAX_ATTEMPTS) {
    authAttempts.set(key, recent);
    return false;
  }
  recent.push(now);
  authAttempts.set(key, recent);
  if (authAttempts.size > 2000) authAttempts.delete(authAttempts.keys().next().value);
  return true;
}

function requestOrigin(req) {
  if (process.env.APP_BASE_URL) {
    try { return new URL(process.env.APP_BASE_URL).origin; } catch { return ''; }
  }
  const protocol = process.env.GEV_TRUST_PROXY === '1'
    ? String(req.headers['x-forwarded-proto'] || 'http').split(',')[0].trim()
    : 'http';
  return `${protocol}://${req.headers.host || ''}`;
}

function validOrigin(req) {
  return typeof req.headers.origin === 'string' && req.headers.origin === requestOrigin(req);
}

function cookieOptions() {
  const secure = String(process.env.APP_BASE_URL || '').startsWith('https://');
  return `Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}${secure ? '; Secure' : ''}`;
}

function setSessionCookie(res, token) {
  res.setHeader('Set-Cookie', `gev_session=${encodeURIComponent(token)}; ${cookieOptions()}`);
}

function clearSessionCookie(res) {
  const secure = String(process.env.APP_BASE_URL || '').startsWith('https://');
  res.setHeader('Set-Cookie', `gev_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure ? '; Secure' : ''}`);
}

async function sessionUser(req) {
  const token = parseCookies(req.headers.cookie).gev_session;
  if (!token || !databaseConfigured()) return null;
  await ensureSchema();
  const result = await getPool().query(
    `SELECT u.id, u.email, u.email_verified_at
     FROM gev_sessions s JOIN gev_users u ON u.id = s.user_id
     WHERE s.token_hash = $1 AND s.expires_at > NOW()`,
    [hash(token)],
  );
  return result.rows[0] || null;
}

async function issueSession(userId, res) {
  const token = randomBytes(32).toString('base64url');
  await getPool().query(
    'INSERT INTO gev_sessions (token_hash, user_id, expires_at) VALUES ($1, $2, $3)',
    [hash(token), userId, new Date(Date.now() + SESSION_TTL_MS)],
  );
  setSessionCookie(res, token);
}

async function passwordHash(password) {
  const salt = randomBytes(16).toString('hex');
  const derived = await scrypt(password, salt, 64);
  return `${salt}:${Buffer.from(derived).toString('hex')}`;
}

async function passwordMatches(password, stored) {
  const [salt, expectedHex] = String(stored || '').split(':');
  if (!salt || !/^[a-f0-9]{128}$/i.test(expectedHex || '')) return false;
  const actual = Buffer.from(await scrypt(password, salt, 64));
  const expected = Buffer.from(expectedHex, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

async function sendMagicLink(email, userId, purpose) {
  const resendKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM;
  if (!resendKey || !from) throw Object.assign(new Error('Email delivery is not configured'), { status: 503 });
  const token = randomBytes(32).toString('base64url');
  await getPool().query(
    'INSERT INTO gev_magic_tokens (token_hash, user_id, purpose, expires_at) VALUES ($1, $2, $3, $4)',
    [hash(token), userId, purpose, new Date(Date.now() + MAGIC_TTL_MS)],
  );
  const baseUrl = String(process.env.APP_BASE_URL || '').replace(/\/$/, '');
  if (!baseUrl) throw Object.assign(new Error('APP_BASE_URL is not configured'), { status: 503 });
  const link = `${baseUrl}/?magic=${encodeURIComponent(token)}`;
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from,
      to: [email],
      subject: purpose === 'verify' ? 'Verify your email' : 'Your sign-in link',
      text: `Use this one-time link within 15 minutes:\n\n${link}`,
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw Object.assign(new Error('Email could not be sent'), { status: 502 });
}

function stripeClient() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw Object.assign(new Error('Billing is not configured'), { status: 503 });
  if (!stripe) stripe = new Stripe(key);
  return stripe;
}

function freeForAllDefault() {
  return process.env.GEV_FREE_FOR_ALL !== '0';
}

async function freeForAll() {
  if (!databaseConfigured()) return freeForAllDefault();
  if (Date.now() < freeForAllCache.expiresAt) return freeForAllCache.value;
  try {
    await ensureSchema();
    const result = await getPool().query(
      "SELECT setting_value FROM gev_app_settings WHERE setting_key = 'free_for_all'",
    );
    const value = result.rows.length ? result.rows[0].setting_value === 'true' : freeForAllDefault();
    freeForAllCache = { value, expiresAt: Date.now() + 2_000 };
    return value;
  } catch {
    throw Object.assign(new Error('Subscription settings are unavailable'), { status: 503 });
  }
}

async function hasSubscription(userId) {
  if (!userId) return false;
  const result = await getPool().query(
    `SELECT 1 FROM gev_subscriptions
     WHERE user_id = $1 AND status IN ('active', 'trialing')
       AND (current_period_end IS NULL OR current_period_end > NOW())
     LIMIT 1`,
    [userId],
  );
  return Boolean(result.rows.length);
}

function isAdmin(email) {
  const allowlist = String(process.env.ADMIN_EMAILS || '').split(',').map((value) => value.trim().toLowerCase()).filter(Boolean);
  return Boolean(email && allowlist.includes(email.toLowerCase()));
}

async function handleAccount(req, res, pathname) {
  if (req.method === 'GET' && pathname === '/api/account/me') {
    const user = await sessionUser(req);
    if (!user) return json(res, 200, { user: null, freeForAll: await freeForAll() });
    return json(res, 200, {
      user: { email: user.email, emailVerified: Boolean(user.email_verified_at), admin: isAdmin(user.email) },
      activeSubscription: await hasSubscription(user.id),
      freeForAll: await freeForAll(),
    });
  }
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });
  if (!validOrigin(req)) return json(res, 403, { error: 'Invalid request origin' });
  if (!authAllowed(req)) return json(res, 429, { error: 'Too many attempts' });
  const body = await readJson(req);
  const email = normalizeEmail(body.email);

  if (pathname === '/api/account/signup') {
    const password = String(body.password || '');
    if (!email || password.length < 10 || password.length > 200) {
      return json(res, 400, { error: 'Use a valid email and a password of at least 10 characters' });
    }
    const id = randomUUID();
    try {
      const result = await getPool().query(
        'INSERT INTO gev_users (id, email, password_hash) VALUES ($1, $2, $3) RETURNING id',
        [id, email, await passwordHash(password)],
      );
      await sendMagicLink(email, result.rows[0].id, 'verify');
      return json(res, 201, { ok: true, verificationRequired: true });
    } catch (error) {
      if (error.code === '23505') return json(res, 409, { error: 'An account already exists for this email' });
      throw error;
    }
  }

  if (pathname === '/api/account/login') {
    const result = email ? await getPool().query('SELECT id, email, password_hash, email_verified_at FROM gev_users WHERE email = $1', [email]) : { rows: [] };
    const user = result.rows[0];
    if (!user || !await passwordMatches(String(body.password || ''), user.password_hash)) {
      return json(res, 401, { error: 'Email or password is incorrect' });
    }
    await issueSession(user.id, res);
    return json(res, 200, { ok: true, emailVerified: Boolean(user.email_verified_at) });
  }

  if (pathname === '/api/account/magic-link') {
    if (!email) return json(res, 200, { ok: true });
    const result = await getPool().query('SELECT id, email, email_verified_at FROM gev_users WHERE email = $1', [email]);
    if (result.rows[0]) await sendMagicLink(email, result.rows[0].id, result.rows[0].email_verified_at ? 'login' : 'verify');
    return json(res, 200, { ok: true });
  }

  if (pathname === '/api/account/magic-link/consume') {
    const token = String(body.token || '');
    if (!/^[A-Za-z0-9_-]{40,50}$/.test(token)) return json(res, 400, { error: 'Invalid or expired sign-in link' });
    const client = await getPool().connect();
    try {
      await client.query('BEGIN');
      const result = await client.query(
        'DELETE FROM gev_magic_tokens WHERE token_hash = $1 AND expires_at > NOW() RETURNING user_id, purpose',
        [hash(token)],
      );
      const row = result.rows[0];
      if (!row) {
        await client.query('ROLLBACK');
        return json(res, 400, { error: 'Invalid or expired sign-in link' });
      }
      if (row.purpose === 'verify') await client.query('UPDATE gev_users SET email_verified_at = NOW() WHERE id = $1', [row.user_id]);
      await client.query('COMMIT');
      await issueSession(row.user_id, res);
      return json(res, 200, { ok: true });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  if (pathname === '/api/account/logout') {
    const token = parseCookies(req.headers.cookie).gev_session;
    if (token && databaseConfigured()) await getPool().query('DELETE FROM gev_sessions WHERE token_hash = $1', [hash(token)]);
    clearSessionCookie(res);
    return json(res, 200, { ok: true });
  }

  if (pathname === '/api/account/subscribe') {
    const user = await sessionUser(req);
    if (!user) return json(res, 401, { error: 'Sign in to subscribe' });
    if (!user.email_verified_at) return json(res, 403, { error: 'Verify your email before subscribing' });
    if (await hasSubscription(user.id)) return json(res, 409, { error: 'An active subscription already exists' });
    const priceId = body.interval === 'annual' ? process.env.STRIPE_PRICE_ANNUAL : process.env.STRIPE_PRICE_MONTHLY;
    if (!priceId) return json(res, 503, { error: 'Subscription pricing is not configured' });
    const baseUrl = String(process.env.APP_BASE_URL || '').replace(/\/$/, '');
    if (!baseUrl) return json(res, 503, { error: 'APP_BASE_URL is not configured' });
    const checkout = await stripeClient().checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      customer_email: user.email,
      client_reference_id: user.id,
      subscription_data: { metadata: { userId: user.id } },
      success_url: `${baseUrl}/?billing=success`,
      cancel_url: `${baseUrl}/?billing=cancelled`,
    });
    return json(res, 200, { url: checkout.url });
  }

  if (pathname === '/api/account/portal') {
    const user = await sessionUser(req);
    if (!user) return json(res, 401, { error: 'Sign in to manage your subscription' });
    const result = await getPool().query('SELECT stripe_customer_id FROM gev_subscriptions WHERE user_id = $1 ORDER BY updated_at DESC LIMIT 1', [user.id]);
    const customerId = result.rows[0]?.stripe_customer_id;
    if (!customerId) return json(res, 404, { error: 'No billing account was found' });
    const baseUrl = String(process.env.APP_BASE_URL || '').replace(/\/$/, '');
    const portal = await stripeClient().billingPortal.sessions.create({ customer: customerId, return_url: `${baseUrl}/` });
    return json(res, 200, { url: portal.url });
  }

  if (pathname === '/api/account/admin/free-for-all') {
    const user = await sessionUser(req);
    if (!user || !isAdmin(user.email)) return json(res, 403, { error: 'Admin access required' });
    const enabled = body.enabled === true;
    await getPool().query(
      `INSERT INTO gev_app_settings (setting_key, setting_value) VALUES ('free_for_all', $1)
       ON CONFLICT (setting_key) DO UPDATE SET setting_value = EXCLUDED.setting_value, updated_at = NOW()`,
      [String(enabled)],
    );
    freeForAllCache = { value: enabled, expiresAt: Date.now() + 2_000 };
    return json(res, 200, { freeForAll: enabled });
  }

  return json(res, 404, { error: 'Not found' });
}

async function upsertSubscription(subscription, fallbackUserId = null) {
  const userId = subscription.metadata?.userId || fallbackUserId;
  const pool = getPool();
  let resolvedUserId = userId;
  if (!resolvedUserId && subscription.customer) {
    const existing = await pool.query('SELECT user_id FROM gev_subscriptions WHERE stripe_customer_id = $1 LIMIT 1', [subscription.customer]);
    resolvedUserId = existing.rows[0]?.user_id;
  }
  if (!resolvedUserId) return;
  await pool.query(
    `INSERT INTO gev_subscriptions
       (stripe_subscription_id, user_id, stripe_customer_id, status, current_period_end, updated_at)
     VALUES ($1, $2, $3, $4, $5, NOW())
     ON CONFLICT (stripe_subscription_id) DO UPDATE SET
       user_id = EXCLUDED.user_id,
       stripe_customer_id = EXCLUDED.stripe_customer_id,
       status = EXCLUDED.status,
       current_period_end = EXCLUDED.current_period_end,
       updated_at = NOW()`,
    [subscription.id, resolvedUserId, subscription.customer, subscription.status, subscription.current_period_end ? new Date(subscription.current_period_end * 1000) : null],
  );
}

async function handleWebhook(req, res) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return json(res, 503, { error: 'Billing webhook is not configured' });
  let event;
  try {
    const body = await readBody(req, 1024 * 1024);
    event = stripeClient().webhooks.constructEvent(body, req.headers['stripe-signature'], secret);
  } catch {
    return json(res, 400, { error: 'Invalid webhook signature or payload' });
  }
  try {
    await ensureSchema();
    if (event.type === 'checkout.session.completed') {
      const checkout = event.data.object;
      if (checkout.subscription && checkout.client_reference_id) {
        const subscription = await stripeClient().subscriptions.retrieve(checkout.subscription);
        await upsertSubscription(subscription, checkout.client_reference_id);
      }
    } else if (event.type.startsWith('customer.subscription.')) {
      await upsertSubscription(event.data.object);
    }
    return json(res, 200, { received: true });
  } catch {
    return json(res, 500, { error: 'Webhook processing failed' });
  }
}

async function handleRuntimeConfig(req, res) {
  const user = await sessionUser(req);
  const entitled = await freeForAll() || Boolean(user && await hasSubscription(user.id));
  return json(res, 200, {
    googleMapsApiKey: entitled ? (process.env.GOOGLE_MAPS_API_KEY || null) : null,
    cesiumIonToken: entitled ? (process.env.CESIUM_ION_TOKEN || null) : null,
    paidFeatures: entitled,
  });
}

function sendError(res, error) {
  const status = Number.isInteger(error?.status) ? error.status : 500;
  if (status >= 500) console.error('[Subscription]', error?.message || error);
  json(res, status, { error: status >= 500 ? 'Service temporarily unavailable' : error.message });
}

async function middleware(req, res, next) {
  const pathname = String(req.url || '/').split('?')[0];
  if (!pathname.startsWith('/api/')) return next();
  if (pathname === '/api/stripe/webhook') {
    if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });
    return handleWebhook(req, res);
  }
  if (pathname.startsWith('/api/account')) {
    if (!databaseConfigured()) return json(res, 503, { error: 'DATABASE_URL is not configured' });
    try {
      await ensureSchema();
      return await handleAccount(req, res, pathname);
    } catch (error) {
      return sendError(res, error);
    }
  }
  if (isRuntimeConfigPath(pathname)) {
    try { return await handleRuntimeConfig(req, res); } catch (error) { return sendError(res, error); }
  }
  if (pathname.startsWith('/api/cctv/frame/')) {
    try {
      const free = await freeForAll();
      const user = free || !databaseConfigured() ? null : await sessionUser(req);
      req.gevAllowGoogleFallback = free || Boolean(user && await hasSubscription(user.id));
      return next();
    } catch (error) {
      return sendError(res, error);
    }
  }
  if (isSubscriptionExemptPath(pathname) || subscriptionTierForPath(pathname) !== 'paid') return next();
  try {
    if (await freeForAll()) return next();
    if (!databaseConfigured()) return json(res, 503, { error: 'Subscription service is unavailable' });
    const user = await sessionUser(req);
    if (!user) return json(res, 401, { error: 'Sign in required', code: 'AUTH_REQUIRED' });
    if (!await hasSubscription(user.id)) return json(res, 402, { error: 'An active subscription is required', code: 'SUBSCRIPTION_REQUIRED' });
    return next();
  } catch (error) {
    return sendError(res, error);
  }
}

export function subscriptionPlugin() {
  const install = (server) => {
    server.middlewares.use(middleware);
  };
  return {
    name: 'gev-subscriptions',
    configureServer: install,
    configurePreviewServer: install,
  };
}
