// The ideas, in a D1 database (bound to the Worker as DB in wrangler.jsonc). The table makes itself the first time.
// The app keeps a full copy on the device and syncs, so it works offline:
//
//   GET    /api/ideas                  every idea that isn't deleted, newest first
//   GET    /api/ideas?since=<iso>      everything changed on the server since then, deleted ones too
//                                      (the app's sync); answers with { ideas, now } and the next since is `now`
//   GET    /api/ideas?build=1          the build queue: ideas marked "Build this", oldest first
//   GET    /api/ideas?q=words          a search of titles, notes and tags (every word has to match)
//   GET    /api/ideas/<id>             one idea
//   PUT    /api/ideas/<id>             make or change an idea (send the whole idea). The one changed last on its
//                                      device wins: an older edit that arrives late is ignored, and the reply
//                                      holds what's kept.
//   PATCH  /api/ideas/<id>             change some fields (for Claude, e.g. { "link": "/play/x/", "build": false })
//   DELETE /api/ideas/<id>             deletes it (kept as a tombstone so other devices hear about it)
//
// An idea: { id, title, body, kind, status, tags: [..], link, build, createdAt, updatedAt, deleted }

const KINDS = ['game', 'comic', 'painting', 'play', 'novel', 'other'];
const STATUSES = ['new', 'someday', 'active', 'done', 'dropped'];
const MAX = { title: 200, body: 20000, tag: 40, tags: 30, link: 500, id: 64 };

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });

const clip = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const isoOr = (v, fallback) => (typeof v === 'string' && !Number.isNaN(Date.parse(v)) ? new Date(v).toISOString() : fallback);

let ready = null;
function setUp(db) {
  ready ??= db
    .batch([
      db.prepare(`CREATE TABLE IF NOT EXISTS ideas (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL DEFAULT '',
        body TEXT NOT NULL DEFAULT '',
        kind TEXT NOT NULL DEFAULT 'other',
        status TEXT NOT NULL DEFAULT 'new',
        tags TEXT NOT NULL DEFAULT '[]',
        link TEXT NOT NULL DEFAULT '',
        build INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        synced_at TEXT NOT NULL,
        deleted INTEGER NOT NULL DEFAULT 0
      )`),
      db.prepare('CREATE INDEX IF NOT EXISTS ideas_synced ON ideas (synced_at)'),
    ])
    .catch((e) => { ready = null; throw e; });
  return ready;
}

const shape = (r) => ({
  id: r.id, title: r.title, body: r.body, kind: r.kind, status: r.status,
  tags: (() => { try { return JSON.parse(r.tags); } catch { return []; } })(),
  link: r.link, build: !!r.build, createdAt: r.created_at, updatedAt: r.updated_at, deleted: !!r.deleted,
});

function cleanTags(v) {
  if (!Array.isArray(v)) return [];
  const out = [];
  for (const t of v) {
    const tag = clip(String(t), MAX.tag).toLowerCase().replace(/^#/, '').replace(/\s+/g, '-');
    if (tag && !out.includes(tag)) out.push(tag);
  }
  return out.slice(0, MAX.tags);
}

// Only paths on this site or http(s) links, so a link can't run script when it's opened
function cleanLink(v) {
  const link = clip(v, MAX.link);
  return /^(\/|https?:\/\/)/i.test(link) ? link : '';
}

function fromBody(body, existing, now) {
  const base = existing ? shape(existing) : {};
  const pick = (k) => (k in body ? body[k] : base[k]);
  return {
    title: clip(pick('title') ?? '', MAX.title),
    body: typeof pick('body') === 'string' ? pick('body').slice(0, MAX.body) : '',
    kind: KINDS.includes(pick('kind')) ? pick('kind') : 'other',
    status: STATUSES.includes(pick('status')) ? pick('status') : 'new',
    tags: JSON.stringify(cleanTags(pick('tags'))),
    link: cleanLink(pick('link') ?? ''),
    build: pick('build') ? 1 : 0,
    deleted: pick('deleted') ? 1 : 0,
    created_at: existing?.created_at ?? isoOr(body.createdAt, now),
    updated_at: isoOr(body.updatedAt, now),
  };
}

async function save(db, id, row, now) {
  // Kept only if it's at least as new as what's there
  return db.prepare(`INSERT INTO ideas (id, title, body, kind, status, tags, link, build, created_at, updated_at, synced_at, deleted)
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)
      ON CONFLICT (id) DO UPDATE SET title = excluded.title, body = excluded.body, kind = excluded.kind,
        status = excluded.status, tags = excluded.tags, link = excluded.link, build = excluded.build,
        updated_at = excluded.updated_at, synced_at = excluded.synced_at, deleted = excluded.deleted
      WHERE excluded.updated_at >= ideas.updated_at`)
    .bind(id, row.title, row.body, row.kind, row.status, row.tags, row.link, row.build, row.created_at, row.updated_at, now, row.deleted)
    .run();
}

// path: what comes after /api/ideas/, split on / (empty for /api/ideas)
export async function ideas(request, env, path) {
  const db = env.DB;
  if (!db) return json({ error: 'not-set-up', message: 'Bind a D1 database to the Worker as DB (see wrangler.jsonc).' }, 503);
  await setUp(db);
  const url = new URL(request.url);
  const id = path.length ? clip(decodeURIComponent(path[0]), MAX.id) : '';
  const method = request.method;
  const now = new Date().toISOString();

  if (!id && method === 'GET') {
    const since = url.searchParams.get('since');
    if (since) {
      const { results } = await db.prepare('SELECT * FROM ideas WHERE synced_at > ?1 ORDER BY synced_at').bind(isoOr(since, '')).all();
      return json({ ideas: results.map(shape), now });
    }
    if (url.searchParams.get('build')) {
      const { results } = await db.prepare('SELECT * FROM ideas WHERE build = 1 AND deleted = 0 ORDER BY created_at').all();
      return json({ ideas: results.map(shape) });
    }
    const { results } = await db.prepare('SELECT * FROM ideas WHERE deleted = 0 ORDER BY created_at DESC').all();
    let ideas = results.map(shape);
    const q = (url.searchParams.get('q') || '').toLowerCase().split(/\s+/).filter(Boolean);
    if (q.length) {
      ideas = ideas.filter((i) => {
        const hay = `${i.title}\n${i.body}\n${i.tags.join(' ')}\n${i.kind}`.toLowerCase();
        return q.every((w) => hay.includes(w.replace(/^#/, '')));
      });
    }
    return json({ ideas, now });
  }

  if (!id || !/^[\w-]+$/.test(id)) return json({ error: 'not-found' }, 404);
  const existing = await db.prepare('SELECT * FROM ideas WHERE id = ?1').bind(id).first();

  if (method === 'GET') return existing ? json({ idea: shape(existing) }) : json({ error: 'not-found' }, 404);

  if (method === 'PUT' || method === 'PATCH') {
    if (method === 'PATCH' && !existing) return json({ error: 'not-found' }, 404);
    let body;
    try { body = await request.json(); } catch { return json({ error: 'bad-json' }, 400); }
    if (!body || typeof body !== 'object') return json({ error: 'bad-json' }, 400);
    // A PATCH is "now", wherever it comes from
    if (method === 'PATCH') body.updatedAt = now;
    const row = fromBody(body, method === 'PATCH' ? existing : null, now);
    if (existing && method === 'PUT') row.created_at = existing.created_at;
    await save(db, id, row, now);
    const kept = await db.prepare('SELECT * FROM ideas WHERE id = ?1').bind(id).first();
    return json({ idea: shape(kept), now }, existing ? 200 : 201);
  }

  if (method === 'DELETE') {
    if (!existing) return json({ error: 'not-found' }, 404);
    await db.prepare('UPDATE ideas SET deleted = 1, updated_at = ?1, synced_at = ?1 WHERE id = ?2').bind(now, id).run();
    return json({ ok: true });
  }

  return json({ error: 'method' }, 405);
}
