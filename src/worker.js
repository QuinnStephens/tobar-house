// The Worker. Cloudflare serves everything in public/ as static files by itself; only /api/* reaches this
// (run_worker_first in wrangler.jsonc). Every API request has to carry Quinn's Cloudflare Access sign-in.
//
//   /api/ideas...   the ideas, in D1 (src/ideas.js)
//   /api/me         who's signed in
import { signedIn } from './access.js';
import { ideas } from './ideas.js';

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);

    const user = await signedIn(request, env);
    if (user instanceof Response) return user;

    const parts = url.pathname.slice('/api/'.length).split('/').filter(Boolean);
    try {
      if (parts[0] === 'ideas') return await ideas(request, env, parts.slice(1));
      if (parts[0] === 'me' && parts.length === 1) return json({ email: user.email, service: user.service });
      return json({ error: 'not-found' }, 404);
    } catch (e) {
      console.error(e);
      return json({ error: 'server', message: 'Something went wrong on the server.' }, 500);
    }
  },
};
