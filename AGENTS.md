# Notes for agents working on Tobar House

Tobar House is Quinn's ideas tracker and prototype shelf (see the README). Keep it in the same spirit:

- **No build step, no dependencies.** Plain HTML, CSS and ES modules served as they are by Cloudflare Pages. The API is Pages Functions in `functions/` on a D1 database bound as `DB`. Don't add a framework or bundler.
- **Mobile first, but it has to work on desktop and on a Steam Deck with a controller.** Anything new on screen must be reachable with the d-pad (it's a focusable element, and `pad.js` finds it by position), with touch targets at least 44px, and readable in both the dark and light themes (colors are tokens in `app.css`).
- **Offline first.** The app reads and writes IndexedDB through `store.js` and syncs; never make the UI wait on the network. If you add files the app shell needs, add them to `SHELL` in `sw.js` and bump `CACHE`.
- **Ideas are private.** Every `/api` route sits behind `functions/api/_middleware.js`, which checks the Cloudflare Access token. Don't add routes outside `functions/api/` that read the database.

## Building a prototype from the build queue

When Quinn asks for an idea to be built (or marks it "Ask Claude to build this"):

1. Read the idea (Quinn may paste it, or with the service token from the README: `GET /api/ideas?build=1`).
2. Make `play/<short-name>/index.html` (plus any files it needs, with relative paths). Look at `play/lantern-drift/` for the pattern:
   - load `<script src="../back-to-house.js"></script>` (house button, Escape, or hold Select + Start to go back; it also registers the service worker so the game works offline once played). Use `data-home="top: 12px; right: 12px"` if the button covers something, and `data-no-escape` if the game uses Escape.
   - **Playable everywhere:** touch (tap or drag; on-screen buttons if needed), keyboard, and the Gamepad API (stick and d-pad to move, A to act, Start to pause, Select for full screen). Show button names that match the controller.
   - Simple canvas games are best. A library from a CDN (cdnjs or jsdelivr, pinned version) is fine if it really helps.
   - Save anything (high scores, progress) in `localStorage` under `tobar:<short-name>:...`.
3. Add it to `play/prototypes.json` with `slug`, `title`, `tagline`, `added` and `updated` dates, and optionally an `image` (16:9, in the game's folder).
4. Link the idea to it: set its link to `/play/<short-name>/` and turn `build` off (`PATCH /api/ideas/<id>` with the service token), or tell Quinn to paste the link into the idea.
5. Open a PR; Cloudflare gives every branch a preview link.
