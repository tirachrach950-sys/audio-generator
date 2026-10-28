'use strict';
// Shared helpers: Gumroad license-key check (the key Gumroad e-mails to the buyer). No access token needed.
const crypto = require('crypto');

const DEFAULT_PRODUCT_ID = 'hFTjHs7DYv_muQf_Np1vcw==';
const PRO_COOKIE = 'vx_pro';
const TRIAL_COOKIE = 'vx_trial';
const COOKIE_MAX_AGE = 30 * 24 * 3600;     // 30 days

const productId = () => (process.env.GUMROAD_PRODUCT_ID || DEFAULT_PRODUCT_ID).trim();
const paymentsOn = () => (process.env.PAYMENTS || '').trim().toLowerCase() !== 'off';

function parseCookies(h) {
  const out = {};
  String(h || '').split(';').forEach((p) => {
    const i = p.indexOf('=');
    if (i > 0) out[p.slice(0, i).trim()] = p.slice(i + 1).trim();
  });
  return out;
}
const cookieStr = (name, val, maxAge) =>
  `${name}=${val}; Path=/; Max-Age=${maxAge}; SameSite=Lax; Secure; HttpOnly`;
// The cookie holds the license key itself; every request is re-checked against Gumroad (cached),
// so a forged cookie is useless without a real, active key.
const proCookie = (key) => cookieStr(PRO_COOKIE, encodeURIComponent(key), COOKIE_MAX_AGE);
const clearProCookie = () => cookieStr(PRO_COOKIE, '', 0);

// ---- Gumroad: is this license key valid and still active? ----
const past = (d) => d && !isNaN(Date.parse(d)) && Date.parse(d) <= Date.now();
function purchaseActive(p) {
  if (!p) return true;
  if (p.refunded || p.chargebacked || p.disputed) return false;
  if (past(p.subscription_ended_at) || past(p.subscription_cancelled_at) || past(p.subscription_failed_at)) return false;
  return true;
}

const cache = new Map(); // sha256(key) -> {ok, until}
async function checkKey(key) {
  key = String(key || '').trim();
  if (!key) return false;
  const id = crypto.createHash('sha256').update(key).digest('hex');
  const hit = cache.get(id);
  if (hit && hit.until > Date.now()) return hit.ok;
  let r;
  try {
    r = await fetch('https://api.gumroad.com/v2/licenses/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: new URLSearchParams({ product_id: productId(), license_key: key, increment_uses_count: 'false' }).toString(),
      signal: AbortSignal.timeout(9000),
    });
  } catch (err) { const e = new Error('network'); e.code = 'network'; throw e; }
  if (r.status >= 500 || r.status === 429) { const e = new Error('network'); e.code = 'network'; throw e; }
  const j = await r.json().catch(() => ({}));
  const ok = !!(j && j.success && purchaseActive(j.purchase));
  if (cache.size > 2000) cache.clear();
  cache.set(id, { ok, until: Date.now() + (ok ? 10 * 60 * 1000 : 60 * 1000) });
  return ok;
}

// ---- Session from the cookie ----
async function getSession(req) {
  if (!paymentsOn()) return { pro: true, open: true };
  let key = parseCookies(req.headers && req.headers.cookie)[PRO_COOKIE];
  try { key = key ? decodeURIComponent(key) : ''; } catch (e) { key = ''; }
  if (!key || key.length > 200) return { pro: false };
  try {
    if (await checkKey(key)) return { pro: true };
    return { pro: false, setCookie: clearProCookie() };
  } catch (e) {
    return { pro: false };
  }
}

// ---- tiny in-memory rate limit (per server instance) ----
const hits = new Map();
function limited(key, max, windowMs) {
  const now = Date.now();
  const arr = (hits.get(key) || []).filter((t) => now - t < windowMs);
  arr.push(now);
  hits.set(key, arr);
  if (hits.size > 5000) hits.clear();
  return arr.length > max;
}
const clientIp = (req) => String((req.headers['x-forwarded-for'] || '').split(',')[0] || (req.socket && req.socket.remoteAddress) || 'x').trim();

function readBody(req) {
  let b = req.body;
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch (e) { b = {}; } }
  if (Buffer.isBuffer(b)) { try { b = JSON.parse(b.toString('utf8')); } catch (e) { b = {}; } }
  return b && typeof b === 'object' ? b : {};
}

module.exports = {
  DEFAULT_PRODUCT_ID, PRO_COOKIE, TRIAL_COOKIE, COOKIE_MAX_AGE,
  productId, paymentsOn, parseCookies, cookieStr,
  proCookie, clearProCookie, checkKey, getSession, limited, clientIp, readBody,
};
