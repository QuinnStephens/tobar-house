// Controller support, for the Steam Deck (and any pad): the d-pad or left stick moves between buttons on screen
// by direction, A presses, B goes back, and text fields get an on-screen keyboard. The prototypes in play/ have
// their own controls. Button names on screen follow the pad, read from its id (as in the game launcher).

const PADS = {
  ps:      { name: 'PlayStation', a: '✕', b: '○', x: '□', y: '△', start: 'Options' },
  xbox:    { name: 'Xbox',        a: 'A', b: 'B', x: 'X', y: 'Y', start: 'Menu' },
  switch:  { name: 'Nintendo',    a: 'B', b: 'A', x: 'Y', y: 'X', start: '+' },
  steam:   { name: 'Steam Deck',  a: 'A', b: 'B', x: 'X', y: 'Y', start: '☰' },
  generic: { name: 'Controller',  a: 'A', b: 'B', x: 'X', y: 'Y', start: 'Start' },
};
function identify(id) {
  id = id.toLowerCase();
  if (/054c|playstation|dualshock|dualsense|wireless controller/.test(id)) return 'ps';
  if (/057e|nintendo|switch|pro controller/.test(id)) return 'switch';
  if (/28de|steam|valve/.test(id)) return 'steam';
  if (/045e|xbox|xinput|microsoft/.test(id)) return 'xbox';
  return 'generic';
}

const FOCUSABLE = 'button:not([disabled]), a[href], input:not([type=hidden]):not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex="0"]';
const isText = (el) => el && (el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && !/^(checkbox|radio|button|submit|range|color|file)$/.test(el.type)));
const visible = (el) => {
  if (el.closest('[hidden], [inert]')) return false;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0;
};

let handlers = {};
let padKind = 'generic';
let usingPad = false;

// The layer on top (a sheet, the keyboard) keeps focus inside it
function scope() {
  const layers = [...document.querySelectorAll('[data-layer]:not([hidden])')];
  return layers.length ? layers[layers.length - 1] : document.querySelector('main') || document.body;
}

export function focusables(root = scope()) { return [...root.querySelectorAll(FOCUSABLE)].filter(visible); }

export function focusFirst(root = scope()) {
  const el = root.querySelector('[data-autofocus]') || focusables(root)[0];
  if (el) focusEl(el);
}

function focusEl(el) {
  el.focus({ preventScroll: true });
  el.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
}

// The nearest thing in that direction, preferring ones lined up with this one
export function move(dir) {
  const items = focusables();
  const current = document.activeElement;
  if (!items.includes(current)) { focusFirst(); return; }
  const a = current.getBoundingClientRect();
  const ax = a.left + a.width / 2, ay = a.top + a.height / 2;
  let best = null, bestScore = Infinity;
  for (const el of items) {
    if (el === current) continue;
    const b = el.getBoundingClientRect();
    const bx = b.left + b.width / 2, by = b.top + b.height / 2;
    const dx = bx - ax, dy = by - ay;
    let main, off;
    if (dir === 'left')  { if (b.right > a.left + 1 && dx >= -1) continue; main = -dx; off = Math.abs(dy); }
    if (dir === 'right') { if (b.left < a.right - 1 && dx <= 1) continue; main = dx; off = Math.abs(dy); }
    if (dir === 'up')    { if (b.bottom > a.top + 1 && dy >= -1) continue; main = -dy; off = Math.abs(dx); }
    if (dir === 'down')  { if (b.top < a.bottom - 1 && dy <= 1) continue; main = dy; off = Math.abs(dx); }
    if (main <= 0) continue;
    // Overlapping on the other axis counts as lined up
    const lined = dir === 'left' || dir === 'right' ? b.bottom > a.top && b.top < a.bottom : b.right > a.left && b.left < a.right;
    const score = main + (lined ? 0 : off * 2 + 200);
    if (score < bestScore) { bestScore = score; best = el; }
  }
  if (best) focusEl(best);
  else if (dir === 'down' || dir === 'up') scope().scrollBy({ top: dir === 'down' ? 240 : -240, behavior: 'smooth' });
}

/* ---------- On-screen keyboard ---------- */
const ROWS = [
  ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
  ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
  ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', "'"],
  ['z', 'x', 'c', 'v', 'b', 'n', 'm', ',', '.', '?'],
];
let kb = null, kbTarget = null, shift = false;

function buildKeyboard() {
  kb = document.createElement('div');
  kb.className = 'osk';
  kb.dataset.layer = '';
  kb.hidden = true;
  kb.setAttribute('role', 'group');
  kb.setAttribute('aria-label', 'On-screen keyboard');
  const key = (label, fn, cls = '') => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'osk-key ' + cls;
    b.textContent = label;
    b.addEventListener('mousedown', (e) => e.preventDefault());
    b.addEventListener('click', fn);
    return b;
  };
  for (const row of ROWS) {
    const r = document.createElement('div');
    r.className = 'osk-row';
    for (const ch of row) {
      const b = key(ch, () => type(shift ? ch.toUpperCase() : ch));
      b.dataset.ch = ch;
      r.append(b);
    }
    kb.append(r);
  }
  const last = document.createElement('div');
  last.className = 'osk-row';
  last.append(
    key('⇧ Shift', () => setShift(!shift), 'wide shift'),
    key('#', () => type('#')),
    key('-', () => type('-')),
    key('Space', () => type(' '), 'space'),
    key('⌫', rubOut, 'wide'),
    key('↵', () => type('\n'), 'enter'),
    key('Done', closeKeyboard, 'wide done'),
  );
  kb.append(last);
  const hint = document.createElement('p');
  hint.className = 'osk-hint';
  kb.append(hint);
  document.body.append(kb);
}

function setShift(on) {
  shift = on;
  kb.querySelector('.shift').classList.toggle('on', on);
  for (const b of kb.querySelectorAll('[data-ch]')) b.textContent = on ? b.dataset.ch.toUpperCase() : b.dataset.ch;
}

function edit(fn) {
  const el = kbTarget;
  if (!el) return;
  const start = el.selectionStart ?? el.value.length, end = el.selectionEnd ?? start;
  fn(el, start, end);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}
function type(text) {
  if (text === '\n' && kbTarget?.tagName !== 'TEXTAREA') { closeKeyboard(); return; }
  edit((el, start, end) => {
    // A capital to start a field or a sentence
    const before = el.value.slice(0, start);
    if (!shift && /^[a-z]$/.test(text) && (/^\s*$/.test(before) || /[.?!]\s+$|\n\s*$/.test(before))) text = text.toUpperCase();
    el.setRangeText(text, start, end, 'end');
  });
  if (shift) setShift(false);
}
function rubOut() {
  edit((el, start, end) => {
    if (start === end && start > 0) el.setRangeText('', start - 1, end, 'end');
    else el.setRangeText('', start, end, 'end');
  });
}
function caret(step) {
  edit((el, start) => { const p = Math.max(0, Math.min(el.value.length, start + step)); el.setSelectionRange(p, p); });
}

export function openKeyboard(el) {
  if (!kb) buildKeyboard();
  kbTarget = el;
  kb.hidden = false;
  document.body.classList.add('osk-open');
  const p = PADS[padKind];
  kb.querySelector('.osk-hint').textContent = `${p.a} type · ${p.b} rub out · ${p.x} space · ${p.y} shift · LB/RB move · ${p.start} done`;
  try { el.setSelectionRange(el.value.length, el.value.length); } catch {}
  el.classList.add('osk-target');
  el.scrollIntoView({ block: 'center', behavior: 'smooth' });
  focusEl(kb.querySelector('[data-ch="t"]'));
}
export function closeKeyboard() {
  if (!kb || kb.hidden) return false;
  kb.hidden = true;
  document.body.classList.remove('osk-open');
  const el = kbTarget;
  kbTarget = null;
  if (el) { el.classList.remove('osk-target'); el.dispatchEvent(new Event('change', { bubbles: true })); focusEl(el); }
  return true;
}
const keyboardOpen = () => kb && !kb.hidden;

/* ---------- Reading the pad ---------- */
const held = {};
function repeat(key, on, now, fn) {
  if (!on) { delete held[key]; return; }
  if (held[key] === undefined) { fn(); held[key] = now + 350; }
  else if (now >= held[key]) { fn(); held[key] = now + 110; }
}
const once = (key, on, fn) => { if (on && !held[key]) fn(); held[key] = on; };

function setUsingPad(on) {
  if (on === usingPad) return;
  usingPad = on;
  document.body.classList.toggle('pad', on);
  handlers.onPadChange?.(on, PADS[padKind]);
}

function press() {
  const el = document.activeElement;
  if (!el || el === document.body) { focusFirst(); return; }
  if (isText(el)) { openKeyboard(el); return; }
  if (el.tagName === 'SELECT') { cycleSelect(el, 1); return; }
  el.click();
}
function cycleSelect(el, step) {
  const n = el.options.length;
  el.selectedIndex = (el.selectedIndex + step + n) % n;
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

function poll(now) {
  const pads = (navigator.getGamepads ? [...navigator.getGamepads()] : []).filter(Boolean);
  const b = (i) => pads.some((p) => p.buttons[i]?.pressed);
  const axis = (i, sign) => pads.some((p) => sign * (p.axes[i] || 0) > 0.55);
  if (pads.length) {
    const kind = identify(pads[0].id);
    if (kind !== padKind) { padKind = kind; if (usingPad) handlers.onPadChange?.(true, PADS[padKind]); }
    if (pads.some((p) => p.buttons.some((x) => x.pressed) || p.axes.some((v) => Math.abs(v) > 0.55))) setUsingPad(true);
  }
  if (pads.length && !handlers.paused?.()) {
    repeat('up', b(12) || axis(1, -1), now, () => move('up'));
    repeat('down', b(13) || axis(1, 1), now, () => move('down'));
    repeat('left', b(14) || axis(0, -1), now, () => move('left'));
    repeat('right', b(15) || axis(0, 1), now, () => move('right'));
    // Right stick scrolls
    const ry = pads.reduce((m, p) => (Math.abs(p.axes[3] || 0) > Math.abs(m) ? p.axes[3] : m), 0);
    if (Math.abs(ry) > 0.2) scope().scrollBy({ top: ry * 18 });
    if (keyboardOpen()) {
      once('a', b(0), press);
      repeat('b', b(1), now, rubOut);
      repeat('x', b(2), now, () => type(' '));
      once('y', b(3), () => setShift(!shift));
      repeat('lb', b(4), now, () => caret(-1));
      repeat('rb', b(5), now, () => caret(1));
      once('start', b(9), closeKeyboard);
    } else {
      once('a', b(0), press);
      once('b', b(1), () => handlers.onBack?.());
      once('x', b(2), () => handlers.onSearch?.());
      once('y', b(3), () => handlers.onNew?.());
      once('lb', b(4), () => handlers.onTab?.(-1));
      once('rb', b(5), () => handlers.onTab?.(1));
      once('start', b(9), () => handlers.onMenu?.());
      once('select', b(8), () => {
        if (document.fullscreenElement) document.exitFullscreen?.();
        else document.documentElement.requestFullscreen?.().catch(() => {});
      });
    }
  }
  requestAnimationFrame(poll);
}

export function init(h) {
  handlers = h;
  addEventListener('pointerdown', () => setUsingPad(false), true);
  addEventListener('keydown', (e) => {
    // The Deck's d-pad can also arrive as arrow keys (Steam Input's desktop layout)
    const dir = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' }[e.key];
    const el = document.activeElement;
    if (keyboardOpen() && e.key === 'Escape') { closeKeyboard(); e.preventDefault(); return; }
    if (dir && !isText(el) && el?.tagName !== 'SELECT' && !e.altKey && !e.metaKey && !e.ctrlKey) { move(dir); e.preventDefault(); }
  });
  requestAnimationFrame(poll);
}

export const pad = () => (usingPad ? PADS[padKind] : null);
