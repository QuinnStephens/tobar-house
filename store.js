// The ideas on this device, and keeping them in step with the server.
// Every idea is kept in IndexedDB, so the app opens instantly and works offline. Changes are marked dirty and
// sent to /api/ideas when there's a connection; then anything changed elsewhere is fetched. When the same
// idea was changed in two places, the edit made last wins.

const DB_NAME = 'tobar';
const listeners = new Set();
const ideas = new Map();
let db = null;
let meta = { lastSync: '' };
let state = 'idle'; // idle | syncing | synced | offline | signed-out | no-server | error
let syncing = null;
let again = false;
let timer = null;

const now = () => new Date().toISOString();
export const newId = () =>
  crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2, 10);

function emit() { for (const fn of listeners) fn(); }
export const onChange = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
export const syncState = () => state;
export const lastSync = () => meta.lastSync;
function setState(s) { if (s !== state) { state = s; emit(); } }

function open() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore('ideas', { keyPath: 'id' });
      req.result.createObjectStore('meta');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
function tx(store, mode, fn) {
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const result = fn(t.objectStore(store));
    t.oncomplete = () => resolve(result instanceof IDBRequest ? result.result : result);
    t.onerror = () => reject(t.error);
  });
}
const writeIdeas = (list) => db && tx('ideas', 'readwrite', (s) => list.forEach((i) => s.put(i)));
const writeMeta = () => db && tx('meta', 'readwrite', (s) => s.put(meta, 'meta'));

export async function load() {
  try {
    db = await open();
    const all = await tx('ideas', 'readonly', (s) => s.getAll());
    for (const i of all) ideas.set(i.id, i);
    meta = (await tx('meta', 'readonly', (s) => s.get('meta'))) || meta;
  } catch (e) {
    // Private browsing on some browsers: work from memory only
    console.warn('No IndexedDB, ideas live in memory only', e);
  }
  // Ask to keep this site's data when the device is low on space
  navigator.storage?.persist?.().catch(() => {});
  emit();
}

// Every idea that isn't deleted
export const all = () => [...ideas.values()].filter((i) => !i.deleted);
export const get = (id) => ideas.get(id);
export const pending = () => [...ideas.values()].filter((i) => i.dirty).length;

export function blank() {
  const t = now();
  return { id: newId(), title: '', body: '', kind: 'other', status: 'new', tags: [], link: '', build: false, createdAt: t, updatedAt: t, deleted: false };
}

export async function put(idea) {
  const saved = { ...idea, updatedAt: now(), dirty: true };
  ideas.set(saved.id, saved);
  emit();
  await writeIdeas([saved]);
  soon();
  return saved;
}

export const remove = (id) => { const i = ideas.get(id); return i && put({ ...i, deleted: true }); };

// Replaces every idea with a backup file's (merging by last edit)
export async function restore(list) {
  const changed = [];
  for (const raw of list) {
    if (!raw?.id) continue;
    const mine = ideas.get(raw.id);
    if (mine && mine.updatedAt >= raw.updatedAt) continue;
    const i = { ...raw, dirty: true };
    ideas.set(i.id, i);
    changed.push(i);
  }
  await writeIdeas(changed);
  emit();
  soon();
  return changed.length;
}

export function soon(ms = 800) {
  clearTimeout(timer);
  timer = setTimeout(sync, ms);
}

async function api(path, options = {}) {
  const res = await fetch('/api/' + path, {
    ...options,
    headers: { 'content-type': 'application/json', ...(options.headers || {}) },
    credentials: 'same-origin',
    // An expired Cloudflare Access session answers with a redirect to its sign-in page
    redirect: 'manual',
    cache: 'no-store',
  });
  if (res.type === 'opaqueredirect' || res.status === 401 || res.status === 403) throw Object.assign(new Error('signed-out'), { kind: 'signed-out' });
  if (res.status === 404 || res.status === 405 || res.status === 501) throw Object.assign(new Error('no-server'), { kind: 'no-server' });
  const type = res.headers.get('content-type') || '';
  if (!type.includes('application/json')) throw Object.assign(new Error('signed-out'), { kind: 'signed-out' });
  const body = await res.json();
  if (!res.ok) throw Object.assign(new Error(body.message || body.error || res.status), { kind: body.error === 'not-set-up' ? 'no-server' : 'error' });
  return body;
}

export function sync() {
  if (syncing) { again = true; return syncing; }
  syncing = (async () => {
    if (navigator.onLine === false) { setState('offline'); return; }
    setState('syncing');
    try {
      // 1. Send what changed here
      for (const idea of [...ideas.values()].filter((i) => i.dirty)) {
        const { dirty, ...body } = idea;
        const { idea: kept } = await api('ideas/' + encodeURIComponent(idea.id), { method: 'PUT', body: JSON.stringify(body) });
        const current = ideas.get(idea.id);
        // Edited again while that was on its way: keep it dirty for the next round
        if (current.updatedAt !== idea.updatedAt) continue;
        ideas.set(kept.id, kept);
        await writeIdeas([kept]);
      }
      // 2. Fetch what changed elsewhere
      const { ideas: changed, now: serverNow } = await api('ideas?since=' + encodeURIComponent(meta.lastSync || '1970-01-01T00:00:00.000Z'));
      const keep = [];
      for (const theirs of changed) {
        const mine = ideas.get(theirs.id);
        if (mine?.dirty && mine.updatedAt > theirs.updatedAt) continue;
        ideas.set(theirs.id, theirs);
        keep.push(theirs);
      }
      await writeIdeas(keep);
      meta.lastSync = serverNow;
      await writeMeta();
      setState('synced');
      emit();
    } catch (e) {
      if (e.kind) setState(e.kind);
      else setState(navigator.onLine === false ? 'offline' : 'error');
      if (!e.kind) console.warn('Sync failed', e);
    }
  })().finally(() => {
    syncing = null;
    if (again) { again = false; soon(200); }
  });
  return syncing;
}

addEventListener('online', () => soon(100));
addEventListener('offline', () => setState('offline'));
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') soon(100); });
