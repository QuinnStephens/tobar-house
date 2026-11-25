// Every /api request has to come from Quinn. Cloudflare Access sits in front of the whole site and only lets
// Quinn in (signing in with GitHub, so a passkey / Face ID). Access passes each request on with a signed token
// in the Cf-Access-Jwt-Assertion header, and this checks that token too, so the API stays shut even if the
// Access app is ever switched off or a path is left out of it.
//
// Settings on the Pages project (see the README):
//   ACCESS_TEAM_DOMAIN  e.g. "quinn.cloudflareaccess.com" (Zero Trust > Settings > Custom Pages shows the team name)
//   ACCESS_AUD          the Access application's "Application Audience (AUD) Tag"
// With neither set, the API only answers on localhost, for `wrangler pages dev`.

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });

const b64url = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), (c) => c.charCodeAt(0));
const parse = (part) => JSON.parse(new TextDecoder().decode(b64url(part)));

// The team's signing keys, kept for an hour per worker
let keys = { domain: null, at: 0, byKid: new Map() };
async function keyFor(domain, kid) {
  const stale = keys.domain !== domain || Date.now() - keys.at > 3600_000;
  if (stale || !keys.byKid.has(kid)) {
    const res = await fetch(`https://${domain}/cdn-cgi/access/certs`);
    if (!res.ok) throw new Error(`certs ${res.status}`);
    const { keys: jwks = [] } = await res.json();
    const byKid = new Map();
    for (const jwk of jwks) {
      byKid.set(jwk.kid, await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']));
    }
    keys = { domain, at: Date.now(), byKid };
  }
  return keys.byKid.get(kid);
}

async function verify(token, env) {
  const [h, p, s] = token.split('.');
  if (!h || !p || !s) return null;
  let header, payload;
  try { header = parse(h); payload = parse(p); } catch { return null; }
  if (header.alg !== 'RS256') return null;
  const key = await keyFor(env.ACCESS_TEAM_DOMAIN, header.kid);
  if (!key) return null;
  let sig;
  try { sig = b64url(s); } catch { return null; }
  const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, sig, new TextEncoder().encode(`${h}.${p}`));
  if (!ok) return null;
  const now = Date.now() / 1000;
  const aud = [].concat(payload.aud || []);
  if (!aud.includes(env.ACCESS_AUD) || payload.exp < now - 30) return null;
  if (payload.iss && payload.iss !== `https://${env.ACCESS_TEAM_DOMAIN}`) return null;
  // A person has an email; a service token (for Claude) has a common_name
  return { email: payload.email || '', service: payload.common_name || '' };
}

export async function onRequest(context) {
  const { request, env } = context;
  const host = new URL(request.url).hostname;
  if (!env.ACCESS_TEAM_DOMAIN || !env.ACCESS_AUD) {
    if (host === 'localhost' || host === '127.0.0.1') {
      context.data.user = { email: 'local', service: '' };
      return context.next();
    }
    return json({ error: 'not-set-up', message: 'Set ACCESS_TEAM_DOMAIN and ACCESS_AUD on the Pages project (see the README).' }, 503);
  }
  const token = request.headers.get('cf-access-jwt-assertion') || '';
  let user = null;
  try { user = token ? await verify(token, env) : null; } catch (e) { return json({ error: 'certs', message: String(e) }, 502); }
  if (!user) return json({ error: 'signed-out', message: 'Sign in again.' }, 401);
  context.data.user = user;
  return context.next();
}
