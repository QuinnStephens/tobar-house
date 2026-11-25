// Tobar House: the ideas list, search, filters, the editor and the prototypes shelf.
import * as store from './store.js';
import * as pad from './pad.js';

const $ = (id) => document.getElementById(id);
const KINDS = [
  { id: 'game', label: 'Game', plural: 'Games', words: ['game', 'games'] },
  { id: 'comic', label: 'Comic', plural: 'Comics', words: ['comic', 'comics'] },
  { id: 'painting', label: 'Painting', plural: 'Paintings', words: ['painting', 'paintings', 'art'] },
  { id: 'play', label: 'Play', plural: 'Plays', words: ['play', 'plays', 'theatre', 'theater'] },
  { id: 'novel', label: 'Novel', plural: 'Novels', words: ['novel', 'novels', 'book'] },
  { id: 'other', label: 'Other', plural: 'Other', words: ['other'] },
];
const STATUSES = [
  { id: 'new', label: 'New' },
  { id: 'someday', label: 'Someday' },
  { id: 'active', label: 'Working on it' },
  { id: 'done', label: 'Done' },
  { id: 'dropped', label: 'Let go' },
];
const kindOf = (id) => KINDS.find((k) => k.id === id) || KINDS[KINDS.length - 1];
const statusOf = (id) => STATUSES.find((s) => s.id === id) || STATUSES[0];
const OPEN = ['new', 'someday', 'active'];

/* ---------- Little helpers ---------- */
function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else if (k === 'style' && typeof v === 'object') for (const [prop, val] of Object.entries(v)) node.style.setProperty(prop.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase()), val);
    else node.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) if (c != null && c !== false) node.append(c.nodeType ? c : document.createTextNode(c));
  return node;
}
const icon = (id) => {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  use.setAttribute('href', '#' + id);
  svg.append(use);
  return svg;
};
const kc = (kind) => ({ '--kc': `var(--k-${kind})` });
const monthKey = (iso) => iso.slice(0, 7);
const monthName = (key) => new Date(key + '-15T12:00:00').toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
const when = (iso) => new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
const pref = {
  get(k, d) { try { return localStorage.getItem('tobar:' + k) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem('tobar:' + k, v); } catch {} },
};

let toastTimer;
function toast(text, action) {
  const t = $('toast');
  t.replaceChildren(text, action ? el('button', { type: 'button', onclick: () => { t.hidden = true; action.fn(); } }, action.label) : '');
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, action ? 6000 : 2500);
}

/* ---------- Filters ---------- */
const filter = {
  q: '',
  kind: pref.get('kind', 'all'), // all | a kind | build
  status: pref.get('status', 'open'), // open | all | a status
  month: '', // '' or 2026-11
  tag: '',
  sort: pref.get('sort', 'created'),
};

function matches(i, words) {
  if (filter.kind === 'build' ? !i.build : filter.kind !== 'all' && i.kind !== filter.kind) return false;
  if (filter.status === 'open' ? !OPEN.includes(i.status) : filter.status !== 'all' && i.status !== filter.status) return false;
  if (filter.tag && !i.tags.includes(filter.tag)) return false;
  if (filter.month && monthKey(i.createdAt) !== filter.month) return false;
  if (!words.length) return true;
  const hay = `${i.title}\n${i.body}\n${i.tags.map((t) => '#' + t).join(' ')}\n${kindOf(i.kind).label}`.toLowerCase();
  return words.every((w) => hay.includes(w));
}
const searchWords = () => filter.q.toLowerCase().split(/\s+/).filter(Boolean);

function sorted(list) {
  const by = filter.sort === 'updated' ? 'updatedAt' : 'createdAt';
  const dir = filter.sort === 'oldest' ? 1 : -1;
  return list.sort((a, b) => (a[by] < b[by] ? -dir : a[by] > b[by] ? dir : 0));
}

// Wraps the searched words in <mark>
function highlight(text, words) {
  if (!words.length || !text) return [text];
  const re = new RegExp('(' + words.map((w) => w.replace(/^#/, '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).filter(Boolean).join('|') + ')', 'gi');
  return text.split(re).map((part, n) => (n % 2 ? el('mark', {}, part) : part));
}

function snippet(body, words) {
  const flat = body.replace(/\s+/g, ' ').trim();
  if (!words.length) return flat.slice(0, 220);
  const low = flat.toLowerCase();
  const at = Math.min(...words.map((w) => low.indexOf(w.replace(/^#/, ''))).filter((n) => n >= 0), Infinity);
  if (!Number.isFinite(at) || at < 60) return flat.slice(0, 220);
  return '…' + flat.slice(at - 40, at + 180);
}

/* ---------- Rendering the list ---------- */
function renderChips() {
  const ideas = store.all();
  const count = (fn) => ideas.filter(fn).length;
  const chip = (id, label, iconId, n, style) =>
    el('button', { type: 'button', class: 'chip', 'aria-pressed': String(filter.kind === id), 'data-kind': id, style, onclick: () => setKind(id) },
      iconId && icon(iconId), label, n != null && el('span', { class: 'count' }, n));
  const chips = [chip('all', 'All', null, null)];
  for (const k of KINDS) {
    const n = count((i) => i.kind === k.id);
    if (n || filter.kind === k.id || k.id !== 'other') chips.push(chip(k.id, k.plural, 'k-' + k.id, n || null, kc(k.id)));
  }
  const queued = count((i) => i.build);
  if (queued || filter.kind === 'build') chips.push(chip('build', 'Build queue', 'k-build', queued, kc('build')));
  $('kindChips').replaceChildren(...chips);

  // Tags, most used first
  const tally = new Map();
  for (const i of ideas) for (const t of i.tags) tally.set(t, (tally.get(t) || 0) + 1);
  const tags = [...tally].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  $('tagChips').replaceChildren(...tags.map(([t, n]) =>
    el('button', { type: 'button', class: 'chip', 'aria-pressed': String(filter.tag === t), onclick: () => setTag(filter.tag === t ? '' : t) },
      '#' + t, el('span', { class: 'count' }, n))));
  $('tagList').replaceChildren(...tags.map(([t]) => el('option', { value: t })));

  // Months that have ideas
  const months = new Map();
  for (const i of ideas) months.set(monthKey(i.createdAt), (months.get(monthKey(i.createdAt)) || 0) + 1);
  const keys = [...months.keys()].sort().reverse();
  if (filter.month && !months.has(filter.month)) keys.unshift(filter.month);
  $('monthFilter').replaceChildren(
    el('option', { value: '' }, 'Any time'),
    ...keys.map((k) => el('option', { value: k, selected: filter.month === k }, `${monthName(k)} (${months.get(k) || 0})`)));

  $('statusFilter').replaceChildren(
    ...[['open', 'Open'], ['all', 'Any status'], ...STATUSES.map((s) => [s.id, s.label])]
      .map(([v, label]) => el('option', { value: v, selected: filter.status === v }, label)));
  $('sortBy').value = filter.sort;
}

function card(i, words) {
  const k = kindOf(i.kind);
  const tags = i.tags.slice(0, 6).map((t) => el('span', { class: 'tag' }, ...highlight('#' + t, words)));
  return el('button', { type: 'button', class: 'card' + (editing?.id === i.id ? ' current' : ''), 'data-id': i.id, style: kc(i.kind), onclick: () => go('#/idea/' + i.id) },
    el('span', { class: 'kind-dot', title: k.label }, icon('k-' + i.kind)),
    el('span', { class: 'txt' },
      el('h3', { class: i.title ? '' : 'untitled' }, ...highlight(i.title || 'Untitled', words)),
      i.body && el('p', {}, ...highlight(snippet(i.body, words), words)),
      el('span', { class: 'meta' },
        i.status !== 'new' && el('span', { class: 'badge st-' + i.status }, statusOf(i.status).label),
        i.link?.startsWith('/play/') && el('span', { class: 'badge playable' }, icon('i-play'), 'Playable'),
        i.build && el('span', { class: 'badge build' }, icon('k-build'), 'Build'),
        ...tags)),
    i.dirty && el('span', { class: 'unsynced', title: 'Not synced yet' }));
}

function renderList() {
  const words = searchWords();
  const list = sorted(store.all().filter((i) => matches(i, words)));
  const box = $('list');
  const focusedId = document.activeElement?.closest?.('.card')?.dataset.id;
  if (!list.length) {
    const none = !store.all().length;
    box.replaceChildren(el('div', { class: 'empty' },
      el('b', {}, none ? 'Nothing parked yet' : 'No ideas match'),
      none ? 'Tap “Park an idea” to write one down. It saves on this device straight away and syncs when it can.'
        : el('button', { type: 'button', class: 'btn', onclick: clearFilters }, 'Clear search and filters')));
    return;
  }
  const by = filter.sort === 'updated' ? 'updatedAt' : 'createdAt';
  const groups = [];
  for (const i of list) {
    const key = monthKey(i[by]);
    if (groups.at(-1)?.key !== key) groups.push({ key, items: [] });
    groups.at(-1).items.push(i);
  }
  box.replaceChildren(...groups.flatMap((g) => [
    el('h2', { class: 'month' }, monthName(g.key), el('span', {}, String(g.items.length))),
    el('div', { class: 'cards' }, g.items.map((i) => card(i, words))),
  ]));
  if (focusedId) box.querySelector(`[data-id="${CSS.escape(focusedId)}"]`)?.focus({ preventScroll: true });
}

let renderQueued = false;
function render() {
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(() => {
    renderQueued = false;
    renderChips();
    renderList();
    renderSync();
    if (editing) renderEditorMeta();
  });
}

function setKind(id) { filter.kind = id; pref.set('kind', id); render(); }
function setTag(t) { filter.tag = t; render(); }
function clearFilters() {
  Object.assign(filter, { q: '', kind: 'all', status: 'all', tag: '', month: '' });
  $('search').value = '';
  pref.set('kind', 'all'); pref.set('status', 'all');
  render();
}

$('search').addEventListener('input', (e) => {
  filter.q = e.target.value;
  // "#tag" alone filters by that tag
  render();
});
$('statusFilter').addEventListener('change', (e) => { filter.status = e.target.value; pref.set('status', filter.status); render(); });
$('monthFilter').addEventListener('change', (e) => { filter.month = e.target.value; render(); });
$('sortBy').addEventListener('change', (e) => { filter.sort = e.target.value; pref.set('sort', filter.sort); render(); });

/* ---------- Sync status ---------- */
function renderSync() {
  const s = store.syncState();
  const waiting = store.pending();
  const text = {
    idle: 'Saved here',
    syncing: 'Syncing…',
    synced: waiting ? 'Saving…' : 'Synced',
    offline: waiting ? `Offline · ${waiting} waiting` : 'Offline',
    'signed-out': 'Sign in',
    'no-server': 'This device only',
    error: "Couldn't sync",
  }[s];
  const pill = $('syncPill');
  pill.dataset.state = s;
  pill.textContent = text;
  pill.title = store.lastSync() ? 'Last synced ' + when(store.lastSync()) : '';
  const long = {
    idle: 'Not synced yet.',
    syncing: 'Syncing now.',
    synced: `Everything is synced${store.lastSync() ? ' (' + when(store.lastSync()) + ')' : ''}.`,
    offline: `You're offline. ${waiting ? waiting + ' change' + (waiting === 1 ? ' is' : 's are') + ' saved on this device and will sync when you are back online.' : 'Everything you change is saved on this device.'}`,
    'signed-out': 'Your sign-in ran out. Sign in again to sync. Nothing you wrote is lost: it is saved on this device.',
    'no-server': 'No server here (a local copy without the database), so ideas stay on this device.',
    error: "Something went wrong syncing. Your ideas are safe on this device; it'll try again.",
  }[s];
  $('menuSync').textContent = long;
  $('signIn').hidden = s !== 'signed-out';
}
$('syncPill').addEventListener('click', () => {
  if (store.syncState() === 'signed-out') location.href = '/?signin=1';
  else { store.sync(); openMenu(); }
});

/* ---------- The editor ---------- */
let editing = null; // the idea being edited (a copy)
let isNew = false;
let saveTimer = null;
let edited = false; // changed since the last save

function autosize(t) { t.style.height = 'auto'; t.style.height = t.scrollHeight + 'px'; }

function openEditor(idea, fresh = false) {
  editing = { ...idea, tags: [...idea.tags] };
  isNew = fresh;
  edited = false;
  $('edTitle').value = editing.title;
  $('edBody').value = editing.body;
  $('edLink').value = editing.link;
  $('edTagInput').value = '';
  $('edDelete').classList.remove('asking');
  $('edDelete').textContent = 'Delete idea';
  $('edDelete').hidden = fresh;
  $('edSaved').textContent = '';
  renderEditorMeta();
  showSheet('editor');
  autosize($('edTitle'));
  // On a phone, the keyboard comes up for a new idea; with a controller the on-screen one waits for A
  if (fresh && !pad.pad()) $('edTitle').focus();
  else pad.focusFirst($('editor'));
  render();
}

function renderEditorMeta() {
  const i = editing;
  $('edKind').replaceChildren(...KINDS.map((k) =>
    el('button', { type: 'button', class: 'chip', role: 'radio', 'aria-checked': String(i.kind === k.id), style: kc(k.id), onclick: () => change({ kind: k.id }) },
      icon('k-' + k.id), k.label)));
  $('edStatus').replaceChildren(...STATUSES.map((s) =>
    el('button', { type: 'button', class: 'chip', role: 'radio', 'aria-checked': String(i.status === s.id), onclick: () => change({ status: s.id }) }, s.label)));
  const input = $('edTagInput');
  $('edTags').replaceChildren(
    ...i.tags.map((t) => el('button', { type: 'button', class: 'tag-pill', 'aria-label': `Remove tag ${t}`, onclick: () => change({ tags: editing.tags.filter((x) => x !== t) }) }, '#' + t, el('span', {}, '×'))),
    input);
  $('edBuild').setAttribute('aria-checked', String(!!i.build));
  const link = i.link || '';
  $('edPlay').hidden = !link;
  $('edPlay').href = link || '#';
  $('edPlay').querySelector('span').textContent = link.startsWith('/play/') ? 'Play it' : 'Open link';
  const saved = store.get(i.id);
  $('edDates').textContent = saved
    ? `Parked ${when(saved.createdAt)}${saved.updatedAt !== saved.createdAt ? ' · changed ' + when(saved.updatedAt) : ''}${saved.dirty ? ' · not synced yet' : ''}`
    : '';
}

const isEmpty = (i) => !i.title.trim() && !i.body.trim() && !i.tags.length && !i.link;

function change(patch, now = true) {
  Object.assign(editing, patch);
  edited = true;
  renderEditorMeta();
  clearTimeout(saveTimer);
  if (now) commit();
  else saveTimer = setTimeout(commit, 500);
}

async function commit() {
  clearTimeout(saveTimer);
  if (!editing || !edited) return;
  if (isNew && isEmpty(editing)) return;
  edited = false;
  if (isNew && location.hash === '#/new') history.replaceState(history.state, '', '#/idea/' + editing.id);
  isNew = false;
  $('edDelete').hidden = false;
  const saved = await store.put(editing);
  if (editing?.id !== saved.id) return;
  editing.updatedAt = saved.updatedAt;
  $('edSaved').textContent = 'Saved';
  renderEditorMeta();
}

// "#game #cozy fishing village" in the title: the tags move to tags, and a kind's name sets the kind
function pullTags() {
  const found = [];
  const title = editing.title.replace(/(^|\s)#([\p{L}\p{N}_-]+)/gu, (m, sp, tag) => { found.push(tag.toLowerCase()); return sp; }).replace(/\s{2,}/g, ' ').trim();
  if (!found.length) return false;
  const patch = { title, tags: [...editing.tags] };
  for (const t of found) {
    const kind = KINDS.find((k) => k.words.includes(t));
    if (kind && editing.kind === 'other') patch.kind = kind.id;
    else if (!patch.tags.includes(t)) patch.tags.push(t);
  }
  $('edTitle').value = title;
  change(patch, false);
  return true;
}

function addTag(raw) {
  const t = raw.trim().toLowerCase().replace(/^#/, '').replace(/\s+/g, '-').slice(0, 40);
  if (!t || editing.tags.includes(t)) return;
  change({ tags: [...editing.tags, t] });
}

function closeEditor() {
  if (!editing) return;
  pullTags();
  commit();
  const id = editing.id;
  editing = null;
  hideSheet('editor');
  render();
  requestAnimationFrame(() => $('list').querySelector(`[data-id="${CSS.escape(id)}"]`)?.focus({ preventScroll: false }));
}

$('edTitle').addEventListener('input', (e) => { autosize(e.target); change({ title: e.target.value.replace(/\n/g, ' ') }, false); });
$('edTitle').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); pullTags(); $('edBody').focus(); } });
$('edTitle').addEventListener('change', pullTags);
$('edBody').addEventListener('input', (e) => change({ body: e.target.value }, false));
$('edLink').addEventListener('input', (e) => change({ link: e.target.value.trim() }, false));
$('edTagInput').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag(e.target.value); e.target.value = ''; }
  else if (e.key === 'Backspace' && !e.target.value && editing.tags.length) change({ tags: editing.tags.slice(0, -1) });
});
$('edTagInput').addEventListener('input', (e) => {
  // Picking from the suggestions, or typing a comma or space on a phone
  const v = e.target.value;
  if (/[,\s]$/.test(v) || (e.inputType === 'insertReplacementText' || !e.inputType)) {
    if (/[,\s]$/.test(v) || [...$('tagList').options].some((o) => o.value === v)) { addTag(v.replace(/[,\s]+$/, '')); e.target.value = ''; }
  }
});
$('edTagInput').addEventListener('change', (e) => { if (e.target.value.trim()) { addTag(e.target.value); e.target.value = ''; } });
$('edBuild').addEventListener('click', () => {
  change({ build: !editing.build });
  if (editing.build) toast('In the build queue. Ask Claude in your project to build it.');
});
$('edClose').addEventListener('click', () => (history.state?.inApp ? history.back() : go('#/', true)));
$('edDelete').addEventListener('click', async (e) => {
  const b = e.currentTarget;
  if (!b.classList.contains('asking')) {
    b.classList.add('asking');
    b.textContent = 'Tap again to delete';
    setTimeout(() => { b.classList.remove('asking'); b.textContent = 'Delete idea'; }, 3000);
    return;
  }
  const idea = { ...editing };
  clearTimeout(saveTimer);
  editing = null;
  await store.remove(idea.id);
  hideSheet('editor');
  go('#/', true);
  toast('Deleted', { label: 'Undo', fn: () => store.put({ ...idea, deleted: false }) });
});

/* ---------- Sheets ---------- */
function showSheet(id) { $(id).hidden = false; document.body.classList.add('sheet-open'); }
function hideSheet(id) {
  pad.closeKeyboard();
  $(id).hidden = true;
  if ($('editor').hidden && $('menu').hidden) document.body.classList.remove('sheet-open');
}
function openMenu() {
  showSheet('menu');
  renderSync();
  pad.focusFirst($('menu'));
  fetch('/api/me', { redirect: 'manual', cache: 'no-store' })
    .then((r) => (r.ok && (r.headers.get('content-type') || '').includes('json') ? r.json() : null))
    .then((me) => { $('menuWho').textContent = me?.email ? 'Signed in as ' + me.email : ''; })
    .catch(() => {});
}
function closeMenu() { hideSheet('menu'); $('menuBtn').focus(); }
$('menuBtn').addEventListener('click', openMenu);
$('menuClose').addEventListener('click', closeMenu);
$('syncNow').addEventListener('click', () => store.sync());

$('backup').addEventListener('click', async () => {
  const data = JSON.stringify({ app: 'tobar-house', saved: new Date().toISOString(), ideas: [...store.all()].map(({ dirty, ...i }) => i) }, null, 2);
  const name = `tobar-ideas-${new Date().toISOString().slice(0, 10)}.json`;
  const file = new File([data], name, { type: 'application/json' });
  if (navigator.canShare?.({ files: [file] }) && /iPhone|iPad|Android/i.test(navigator.userAgent)) {
    try { await navigator.share({ files: [file], title: name }); return; } catch (e) { if (e.name === 'AbortError') return; }
  }
  const a = el('a', { href: URL.createObjectURL(file), download: name });
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
});
$('restore').addEventListener('change', async (e) => {
  const f = e.target.files[0];
  e.target.value = '';
  if (!f) return;
  try {
    const { ideas } = JSON.parse(await f.text());
    const n = await store.restore(ideas || []);
    toast(n ? `Loaded ${n} idea${n === 1 ? '' : 's'}` : 'Nothing new in that backup');
  } catch { toast("That file isn't a Tobar House backup"); }
});

/* ---------- Prototypes ---------- */
let protos = null;
async function renderPlay() {
  if (!protos) {
    try { protos = (await (await fetch('play/prototypes.json', { cache: 'no-cache' })).json()).prototypes || []; }
    catch { protos = []; }
  }
  const hue = (s) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);
  const byLink = new Map(store.all().filter((i) => i.link).map((i) => [i.link, i]));
  $('protos').replaceChildren(...protos.map((p) => {
    const url = `/play/${p.slug}/`;
    const idea = byLink.get(url);
    const h = hue(p.title);
    return el('article', { class: 'proto' },
      el('div', { class: 'thumb', style: p.image ? { backgroundImage: `url(play/${p.slug}/${p.image})` } : { background: `linear-gradient(135deg, hsl(${h} 55% 38%), hsl(${(h + 50) % 360} 60% 24%))` } }, p.image ? '' : p.title),
      el('div', { class: 'body' },
        el('h3', {}, p.title),
        el('p', {}, p.tagline || ''),
        el('div', { class: 'row' },
          el('a', { class: 'play-link', href: url }, icon('i-play'), 'Play'),
          idea && el('a', { class: 'btn', href: '#/idea/' + idea.id }, 'The idea'))));
  }));
  if (!protos.length) $('protos').replaceChildren(el('p', { class: 'empty' }, el('b', {}, 'No prototypes yet'), 'Mark an idea “Ask Claude to build this” and they show up here.'));
}

/* ---------- Routes: #/ the ideas, #/play, #/new, #/idea/<id> ---------- */
// Pushed with a mark, so Done can go back (and a phone's back gesture works) without leaving the app
function go(hash, replace = false) {
  if (replace) history.replaceState(history.state, '', hash);
  else if (location.hash !== hash) history.pushState({ inApp: true }, '', hash);
  route();
}
addEventListener('popstate', route);

function route() {
  const h = location.hash || '#/';
  const play = h.startsWith('#/play');
  $('ideasView').hidden = play;
  $('playView').hidden = !play;
  $('newBtn').hidden = play;
  for (const [tab, on] of [['tabIdeas', !play], ['tabPlay', play]]) {
    if (on) $(tab).setAttribute('aria-current', 'page'); else $(tab).removeAttribute('aria-current');
  }
  if (play) renderPlay();

  const m = h.match(/^#\/idea\/([\w-]+)/);
  if (h === '#/new') {
    if (!editing) openEditor(store.blank(), true);
  } else if (m) {
    const idea = store.get(m[1]);
    if (idea && editing?.id !== idea.id) openEditor(idea);
    else if (!idea && !editing) go('#/', true);
  } else if (editing) {
    closeEditor();
  }
}
addEventListener('hashchange', route);
// The tabs are links: keep them in the app's history too
for (const tab of ['tabIdeas', 'tabPlay']) $(tab).addEventListener('click', (e) => { e.preventDefault(); go($(tab).getAttribute('href')); });

function newIdea() {
  if (editing) return;
  go('#/new');
}
$('newBtn').addEventListener('click', newIdea);

function back() {
  if (pad.closeKeyboard()) return;
  if (!$('menu').hidden) { closeMenu(); return; }
  if (editing) { $('edClose').click(); return; }
  if (location.hash.startsWith('#/play')) { go('#/'); return; }
  if (filter.q || filter.tag || filter.month) { filter.q = ''; filter.tag = ''; filter.month = ''; $('search').value = ''; render(); }
}

/* ---------- Keyboard shortcuts ---------- */
addEventListener('keydown', (e) => {
  const t = e.target;
  const typing = t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT';
  if (e.key === 'Escape') { if (typing && t.id === 'search' && t.value) return; back(); e.preventDefault(); return; }
  if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.key === '/') { e.preventDefault(); $('search').focus(); }
  else if (e.key === 'n' || e.key === 'N') { e.preventDefault(); newIdea(); }
  else if (e.key === 'p' || e.key === 'P') go(location.hash.startsWith('#/play') ? '#/' : '#/play');
});

const HELP = [
  ['N', 'park a new idea'], ['/', 'search'], ['P', 'switch between Ideas and Play'], ['Esc', 'back, or clear the search'],
  ['Arrows', 'move between buttons'],
];
function renderHelp(p) {
  const rows = p
    ? [[p.a, 'press'], [p.b, 'back'], [p.y, 'new idea'], [p.x, 'search'], ['LB / RB', 'kind'], [p.start, 'menu'], ['Select', 'full screen'], ['Right stick', 'scroll']]
    : HELP;
  $('keysHelp').replaceChildren(...rows.map(([k, v]) => el('li', {}, el('b', {}, k), ' ' + v)));
  $('padHints').replaceChildren(...(p ? [[p.a, 'Open'], [p.b, 'Back'], [p.y, 'New'], [p.x, 'Search'], ['LB RB', 'Kind']] : [])
    .map(([k, v]) => el('span', {}, el('b', {}, k), v)));
}

/* ---------- Start ---------- */
pad.init({
  onBack: back,
  onNew: () => { if (!editing && $('menu').hidden) newIdea(); },
  onSearch: () => {
    if (editing || !$('menu').hidden) return;
    if (location.hash.startsWith('#/play')) go('#/');
    $('search').focus();
    pad.openKeyboard($('search'));
  },
  onMenu: () => ($('menu').hidden ? openMenu() : closeMenu()),
  onTab: (step) => {
    if (editing || !$('menu').hidden || location.hash.startsWith('#/play')) return;
    const ids = ['all', ...KINDS.map((k) => k.id)];
    setKind(ids[(ids.indexOf(filter.kind) + step + ids.length) % ids.length]);
    requestAnimationFrame(() => $('kindChips').querySelector('[aria-pressed="true"]')?.scrollIntoView({ inline: 'center', block: 'nearest' }));
  },
  onPadChange: (on, p) => { renderHelp(on ? p : null); if (on && document.activeElement === document.body) pad.focusFirst(); },
});
renderHelp(null);

store.onChange(render);
await store.load();
render();
route();
store.sync();

if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
  navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).catch((e) => console.warn('No offline support:', e));
}
// Arrived from the Access sign-in page: tidy the address
if (location.search.includes('signin')) history.replaceState(null, '', location.pathname + location.hash);
