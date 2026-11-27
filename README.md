# Tobar House

Quinn's place for ideas worth coming back to (games, comics, paintings, plays, novels, whatever else) and for little playable game prototypes. It's a PWA: install it on a phone or the Steam Deck, park an idea in a few seconds, find it again later by searching, by tag, by kind or by month.

It's plain HTML, CSS and JS with no build step and no dependencies, like the game launcher. A Cloudflare Worker serves it (the files in `public/` as static assets, and a small API in `src/`), D1 holds the ideas, and Cloudflare Access keeps everyone but Quinn out.

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
wrangler.jsonc        the Worker: static files from public/, src/worker.js for /api/*, the D1 database
public/               everything the browser gets, served as it is
  index.html          the page
  app.css             the look: tokens on :root, dark by default, light with the OS setting
  app.js              list, search, filters, editor, Play tab, menu, routes (#/, #/play, #/new, #/idea/<id>)
  store.js            ideas on the device (IndexedDB) and syncing with /api/ideas
  pad.js              controller navigation and the on-screen keyboard
  sw.js               service worker: network first, cache when offline
  play/               prototypes, one folder each, listed in play/prototypes.json
    back-to-house.js  every prototype loads this: house button, Escape, or hold Select + Start to go back
  icons/              app icons, drawn by tools/make-icons.py (needs Pillow)
src/                  the API (only /api/* runs code)
  worker.js           routes /api/ideas and /api/me
  access.js           checks the Cloudflare Access token on every /api request
  ideas.js            the ideas, in D1 (the table makes itself)
```

## Setting it up on Cloudflare (once, about 10 minutes)

### 1. The site and the database

1. In the Cloudflare dashboard: **Workers & Pages > Create > Import a repository**, pick `QuinnStephens/tobar-house`, and keep the Worker's name as **`tobar-house`** (it has to match `name` in `wrangler.jsonc`). The defaults are right: deploy command `npx wrangler deploy`, no build command.
2. Deploy. The first deploy finds the D1 database called `tobar-ideas`, or makes it, and binds it as `DB`; the table inside makes itself. The site is then at `https://tobar-house.<your-subdomain>.workers.dev`, and every push to `main` deploys again.

Until step 2 is done the app still opens, but the API answers "not set up" and ideas stay on the device.

### 2. Sign-in with Face ID (Cloudflare Access + GitHub passkey)

Access asks GitHub who you are, and GitHub signs you in with a passkey, so it's one Face ID (or Touch ID) tap. Access is free for up to 50 people.

1. On GitHub, make sure your account has a passkey: **Settings > Password and authentication > Passkeys**.
2. In Cloudflare **Zero Trust** (left sidebar of the dashboard; pick a team name the first time, e.g. `quinn`, which makes `quinn.cloudflareaccess.com`): **Settings > Authentication > Login methods > Add new > GitHub**, and follow the steps it shows (it has you make a GitHub OAuth app with the callback URL it gives). Test it there.
3. Put Access in front of the Worker. In the Worker: **Settings > Domains & Routes**, and on the `workers.dev` row turn on **Cloudflare Access** (do the same for Preview URLs, or turn preview URLs off). That makes an Access application for it. If you'd rather use a domain of your own, add it under Domains & Routes first, then in Zero Trust **Access > Applications > Add an application > Self-hosted** with that domain.
4. In Zero Trust **Access > Applications**, edit that application:
   - session duration **1 month**
   - login methods: only **GitHub**, with **Instant Auth** on (so it goes straight to GitHub)
   - policy: **Allow**, Include > **Emails** > your email (replace any other policy)
   - copy its **Application Audience (AUD) Tag**.
5. In the Worker: **Settings > Variables and Secrets**, add two text variables:
   - `ACCESS_TEAM_DOMAIN` = `quinn.cloudflareaccess.com` (your team's)
   - `ACCESS_AUD` = the AUD tag

   They take effect straight away (`keep_vars` in `wrangler.jsonc` keeps them on later deploys).

The API checks Access's signed token itself too (`src/access.js`), so the ideas stay private even if the Access application is ever switched off. Without those two variables the API refuses everything except on `localhost`.

### 3. Put it on your phone

Open the site in Safari, sign in, then **Share > Add to Home Screen**. On an iPhone the home-screen app keeps its own sign-in, so it asks once more the first time you open it; after that it lasts a month. When a sign-in runs out the app still opens with everything on the phone, and the "Sign in" button at the top signs in again. Nothing you wrote while signed out is lost.

On the Steam Deck, open it in the browser in Desktop Mode (or add it to Steam as a non-Steam game pointing at the browser with the URL).

### Optional: let Claude read the build queue

So Claude can see the build queue (and link a finished prototype to its idea) without you pasting it:

1. Zero Trust > **Access > Service Auth > Create Service Token**, name it `claude`. Copy the Client ID and Secret (the secret is shown once).
2. In the Tobar House application, add a policy: Action **Service Auth**, Include > **Service Token** > `claude`.
3. Give Claude the two values as environment variables (`CF_ACCESS_CLIENT_ID`, `CF_ACCESS_CLIENT_SECRET`) in the Claude environment's settings. Then:

```sh
curl -s https://tobar-house.<your-subdomain>.workers.dev/api/ideas?build=1 \
  -H "CF-Access-Client-Id: $CF_ACCESS_CLIENT_ID" -H "CF-Access-Client-Secret: $CF_ACCESS_CLIENT_SECRET"
```

### Optional: share a prototype

Everything is behind the sign-in. To let anyone play the prototypes, add another Access application for the same domain with the path `/play` and a **Bypass > Everyone** policy. The ideas (`/api`) stay private.

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
npx wrangler dev
```

Then open http://localhost:8787. On localhost the API works without Access, with a database of its own. A plain static server in `public/` (`python3 -m http.server`) also works: ideas then stay on the device ("This device only" at the top).

## Adding a prototype

See `AGENTS.md`. In short: a folder in `public/play/` with an `index.html` that loads `../back-to-house.js`, an entry in `play/prototypes.json`, and the idea's link set to `/play/<folder>/`.
