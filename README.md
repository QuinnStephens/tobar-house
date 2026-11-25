# Tobar House

Quinn's place for ideas worth coming back to (games, comics, paintings, plays, novels, whatever else) and for little playable game prototypes. It's a PWA: install it on a phone or the Steam Deck, park an idea in a few seconds, find it again later by searching, by tag, by kind or by month.

It's plain HTML, CSS and JS with no build step and no dependencies, like the game launcher. Cloudflare Pages serves it, a Pages Function is the API, D1 holds the ideas, and Cloudflare Access keeps everyone but Quinn out.

## How it works

- **Ideas** have a title, notes, a kind (game, comic, painting, play, novel, other), tags, a status (New, Someday, Working on it, Done, Let go), an optional link or prototype, and dates. Everything saves as you type.
- **Quick tagging:** type `#tags` in the title, like `#game cozy fishing village #co-op`. On Done they move into the tags, and a kind's name (`#game`, `#comic`, `#novel`…) sets the kind.
- **Finding things:** search matches the title, notes and tags (every word has to match). Filter by kind (chips), status, month or tag, and sort by newest, recently changed or oldest. The list is grouped by month.
- **Build queue:** "Ask Claude to build this" on an idea puts it in the build queue (a chip on the list). Ask Claude in the project to build it; the prototype lands in `play/` and the idea links to it.
- **Play:** the Play tab lists the prototypes in `play/prototypes.json`. Each is fully playable with touch, keyboard or controller.
- **Offline:** every idea is kept on the device (IndexedDB), so the app opens instantly and works with no signal. Changes sync when the connection is back; if the same idea was changed in two places, the edit made last wins. Menu > Save a backup downloads every idea as one JSON file.
- **Controllers (Steam Deck):** the d-pad or stick moves between buttons, A presses, B goes back, Y parks a new idea, X searches, LB/RB change the kind, Start opens the menu, Select toggles full screen, and the right stick scrolls. Text fields get an on-screen keyboard (A types, B rubs out, X space, Y shift, LB/RB move the cursor, Start done). Button names follow the controller.
- **Keyboard:** `N` new idea, `/` search, `P` Ideas/Play, `Esc` back, arrows move between buttons.

## Files

```
index.html            the page
app.css               the look: tokens on :root, dark by default, light with the OS setting
app.js                list, search, filters, editor, Play tab, menu, routes (#/, #/play, #/new, #/idea/<id>)
store.js              ideas on the device (IndexedDB) and syncing with /api/ideas
pad.js                controller navigation and the on-screen keyboard
sw.js                 service worker: network first, cache when offline
functions/api/        the API (Cloudflare Pages Functions)
  _middleware.js      checks the Cloudflare Access token on every /api request
  ideas/[[path]].js   the ideas, in D1 (the table makes itself)
  me.js               who's signed in
play/                 prototypes, one folder each, listed in play/prototypes.json
  back-to-house.js    every prototype loads this: house button, Escape, or hold Select + Start to go back
icons/                app icons, drawn by tools/make-icons.py (needs Pillow)
```

## Setting it up on Cloudflare (once, about 10 minutes)

### 1. The site

1. In the Cloudflare dashboard: **Workers & Pages > Create > Pages > Connect to Git**, pick `QuinnStephens/tobar-house`.
2. Production branch `main`, **no build command**, build output directory `/`. Save and deploy. It's now at `https://tobar-house.pages.dev` (or whatever name Cloudflare gives it).

### 2. The database

1. **Storage & Databases > D1 SQL Database > Create**, call it `tobar-ideas`.
2. In the Pages project: **Settings > Bindings > Add > D1 database**, variable name **`DB`**, pick `tobar-ideas`. Do it for Production (and Preview, to try branch previews).

### 3. Sign-in with Face ID (Cloudflare Access + GitHub passkey)

Access asks GitHub who you are, and GitHub signs you in with a passkey, so it's one Face ID (or Touch ID) tap. Access is free for up to 50 people.

1. On GitHub, make sure your account has a passkey: **Settings > Password and authentication > Passkeys**.
2. In Cloudflare **Zero Trust** (left sidebar of the dashboard; pick a team name the first time, e.g. `quinn`, which makes `quinn.cloudflareaccess.com`):
   - **Settings > Authentication > Login methods > Add new > GitHub** and follow the steps it shows (it has you make a GitHub OAuth app with the callback URL it gives). Test it there.
   - **Access > Applications > Add an application > Self-hosted.**
     - Name `Tobar House`, session duration **1 month**.
     - Domain: `tobar-house.pages.dev`. Add a second one, `*.tobar-house.pages.dev`, to cover branch previews too.
     - Login methods: only **GitHub**, with **Instant Auth** on (so it goes straight to GitHub).
     - Policy: **Allow**, Include > **Emails** > your email.
   - Open the application again and copy its **Application Audience (AUD) Tag** (Overview / Basic information).
3. In the Pages project: **Settings > Variables and Secrets**, add (Production and Preview):
   - `ACCESS_TEAM_DOMAIN` = `quinn.cloudflareaccess.com` (your team's)
   - `ACCESS_AUD` = the AUD tag
4. Redeploy (**Deployments > latest > Retry deployment**), since bindings and variables only apply to new deployments.

The API checks Access's signed token itself as well (`functions/api/_middleware.js`), so the ideas stay private even if the Access app is ever switched off. Without those two variables the API refuses everything except on `localhost`.

### 4. Put it on your phone

Open the site in Safari, sign in, then **Share > Add to Home Screen**. On an iPhone the home-screen app keeps its own sign-in, so it asks once more the first time you open it; after that it lasts a month. When a sign-in runs out the app still opens with everything on the phone, and the "Sign in" button at the top signs in again. Nothing you wrote while signed out is lost.

On the Steam Deck, open it in the browser in Desktop Mode (or add it to Steam as a non-Steam game pointing at the browser with the URL).

### Optional: let Claude read the build queue

So Claude can see the build queue (and link a finished prototype to its idea) without you pasting it:

1. Zero Trust > **Access > Service Auth > Create Service Token**, name it `claude`. Copy the Client ID and Secret (the secret is shown once).
2. In the Tobar House application, add a policy: Action **Service Auth**, Include > **Service Token** > `claude`.
3. Give Claude the two values as environment variables (`CF_ACCESS_CLIENT_ID`, `CF_ACCESS_CLIENT_SECRET`) in the Claude environment's settings. Then:

```sh
curl -s https://tobar-house.pages.dev/api/ideas?build=1 \
  -H "CF-Access-Client-Id: $CF_ACCESS_CLIENT_ID" -H "CF-Access-Client-Secret: $CF_ACCESS_CLIENT_SECRET"
```

### Optional: share a prototype

Everything is behind the sign-in. To let anyone play the prototypes, add another Access application for the path `tobar-house.pages.dev/play` with a **Bypass > Everyone** policy. The ideas (`/api`) stay private.

## The API

All of it needs the Access sign-in. An idea is `{ id, title, body, kind, status, tags, link, build, createdAt, updatedAt, deleted }`.

| | |
| --- | --- |
| `GET /api/ideas` | every idea, newest first (`?q=words` searches) |
| `GET /api/ideas?build=1` | the build queue, oldest first |
| `GET /api/ideas?since=<iso>` | everything changed since then, deleted ones too (the app's sync) |
| `GET /api/ideas/<id>` | one idea |
| `PUT /api/ideas/<id>` | make or replace an idea (the newer `updatedAt` wins) |
| `PATCH /api/ideas/<id>` | change some fields, e.g. `{ "link": "/play/x/", "build": false, "status": "active" }` |
| `DELETE /api/ideas/<id>` | delete it |
| `GET /api/me` | who's signed in |

## Running it locally

```sh
npx wrangler pages dev . --d1 DB=local
```

Then open http://localhost:8788. On localhost the API works without Access, with a database of its own. A plain static server (`python3 -m http.server`) also works: ideas then stay on the device ("This device only" at the top).

## Adding a prototype

See `AGENTS.md`. In short: a folder in `play/` with an `index.html` that loads `../back-to-house.js`, an entry in `play/prototypes.json`, and the idea's link set to `/play/<folder>/`.
