// Every prototype loads this with <script src="../back-to-house.js"></script> (copied from the game launcher).
// Hold Select + Start (Share + Options on a PS4 pad) for 1 second to go back to Tobar House's Play shelf.
// Escape also goes back, unless the script tag has data-no-escape
// (for games that use Escape themselves, like My Kingdom's pause menu).
// For mouse and touch there's a little house button: tap it, then tap again to
// go. It sits in the top left unless the tag's data-home moves it out of the
// game's way, as CSS: data-home="bottom: 12px; left: 12px". It hides while a
// controller is being used.
// It also registers the site's service worker (/sw.js), so a prototype played once
// plays offline.
(() => {
  // Only over http(s), and browsers refuse it on plain http but for localhost.
  const here = document.currentScript?.src;
  if (here && 'serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    addEventListener('load', () => {
      navigator.serviceWorker
        .register(new URL('../sw.js', here), { updateViaCache: 'none' })
        .catch((error) => console.warn('Offline play unavailable:', error));
    });
  }

  const LAUNCHER_URL = '/#/play';
  const HOLD_MS = 1000;
  const CONFIRM_MS = 3000;
  const useEscape = !document.currentScript?.hasAttribute('data-no-escape');
  const homeAt = document.currentScript?.dataset.home ?? 'top: 12px; left: 12px';
  let since = null;

  // The house button. The first tap asks, so a stray tap doesn't end the game.
  const home = document.createElement('button');
  home.type = 'button';
  home.setAttribute('aria-label', 'Back to Tobar House');
  home.innerHTML = '<svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true"><path d="M3 11.5 12 4l9 7.5M6 10v9.5h4.5v-5h3v5H18V10" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg><span>Tap again to leave</span>';
  home.style.cssText = homeAt;
  const style = document.createElement('style');
  style.textContent = `
    .bth-home { position: fixed; z-index: 1001; display: flex; align-items: center; gap: 8px; height: 48px; min-width: 48px;
      padding: 0 11px; margin: env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left);
      border: 3px solid rgba(20, 17, 43, 0.6); border-radius: 24px; background: rgba(255, 255, 255, 0.75); color: #14112b;
      font: 700 16px system-ui, -apple-system, "Segoe UI", sans-serif; cursor: pointer; touch-action: manipulation;
      -webkit-tap-highlight-color: transparent; -webkit-user-select: none; user-select: none; }
    .bth-home span { display: none; white-space: nowrap; }
    .bth-home.asking { background: #ffc53d; }
    .bth-home.asking span { display: inline; }
    .bth-home.away { display: none; }
  `;
  home.className = 'bth-home';
  let askedAt = -Infinity;
  // pointerdown rather than click, as some games stop the touch's click from happening.
  home.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (performance.now() - askedAt < CONFIRM_MS) { location.href = LAUNCHER_URL; return; }
    askedAt = performance.now();
    home.classList.add('asking');
    setTimeout(() => { if (performance.now() - askedAt >= CONFIRM_MS) home.classList.remove('asking'); }, CONFIRM_MS);
  });
  // Keep the game from seeing the touch as a tap of its own.
  for (const type of ['pointerup', 'mousedown', 'mouseup', 'touchstart', 'touchend', 'click']) {
    home.addEventListener(type, (e) => e.stopPropagation());
  }
  const place = () => { document.head.append(style); document.body.append(home); };
  if (document.body) place(); else addEventListener('DOMContentLoaded', place);
  // Back again once the mouse or a finger is used after a controller.
  addEventListener('pointermove', () => home.classList.remove('away'), true);
  addEventListener('pointerdown', () => home.classList.remove('away'), true);

  function tick(now) {
    const pads = navigator.getGamepads ? [...navigator.getGamepads()].filter(Boolean) : [];
    const combo = pads.some((p) => p.buttons[8]?.pressed && p.buttons[9]?.pressed);
    if (pads.some((p) => p.buttons.some((b) => b.pressed))) home.classList.add('away');
    if (combo) {
      since = since ?? now;
      if (now - since >= HOLD_MS) { location.href = LAUNCHER_URL; return; }
    } else {
      since = null;
    }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);

  // Escape, on a keyboard
  if (useEscape) addEventListener('keydown', (e) => { if (e.key === 'Escape') location.href = LAUNCHER_URL; });
})();
