const enc = new TextEncoder();
const COOKIE = 'intake_session';
const TTL_SECONDS = 60 * 60 * 24 * 30;

async function hmac(secret, value) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(value));
  return btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// Compare via HMAC so neither length nor content leaks through timing.
export async function safeEqual(a, b, secret) {
  const [x, y] = await Promise.all([hmac(secret, String(a)), hmac(secret, String(b))]);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.min(x.length, y.length); i++) diff |= x.charCodeAt(i) ^ y.charCodeAt(i);
  return diff === 0;
}

export async function sessionCookie(secret, now = Date.now()) {
  const exp = Math.floor(now / 1000) + TTL_SECONDS;
  const value = `${exp}.${await hmac(secret, `session:${exp}`)}`;
  return `${COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${TTL_SECONDS}`;
}

export function clearCookie() {
  return `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

export async function hasSession(request, secret, now = Date.now()) {
  const cookies = Object.fromEntries(
    (request.headers.get('Cookie') || '').split(';').map((c) => c.trim().split('=')).filter((p) => p.length === 2)
  );
  const raw = cookies[COOKIE];
  if (!raw) return false;
  const [exp, sig] = raw.split('.');
  if (!exp || !sig || Number(exp) * 1000 < now) return false;
  return safeEqual(sig, await hmac(secret, `session:${exp}`), secret);
}
