# Changes Monitor

Lightweight change detection and monitoring system for GitHub Pages, designed to be used as a **GitHub template**.

It checks a list of URLs every run, hashes what it finds, and publishes a static dashboard with a word-level diff timeline and a **before/after screenshot** for every change.

Typical uses: tracking offer prices, event ticket availability, release notes, or any page that changes without notice.

- **One optional dependency** - `puppeteer-core`, which drives the Chrome already installed on the machine
- **Nothing generated is committed** - output lives in the Actions cache and in the deployment artifact
- **Opt-in** - the workflow only runs when you trigger it
- **Degrades gracefully** - with no browser available the monitor still works, just without pictures
- **Alerts** - opens GitHub Issues when something changes, which doubles as email

## Quick Start

1. Click **Use this template** on GitHub.
2. Edit `config.yml` with the sources you want to monitor.
3. Go to the **Actions** tab and run **Changes Check**.
4. Enable GitHub Pages with source **GitHub Actions**.

## Configuration

`config.yml`:

```yaml
title: Change Monitor
language: es   # 'en' or 'es'

sources:
  # Whole page as plain text
  - name: Homepage
    url: https://example.com
    type: content

  # A single HTML element (.class, #id, [attr] or tag)
  - name: Version Badge
    url: https://example.com
    type: html
    selector: "[data-version]"

  # A value inside a JSON response (dot notation)
  - name: API Version
    url: https://api.example.com/status.json
    type: json
    jsonPath: data.version
```

| Field | Default | Description |
| --- | --- | --- |
| `name` | required | Shown in the dashboard |
| `url` | required | URL to fetch |
| `type` | `content` | `content`, `html` or `json` |
| `selector` | - | CSS-ish selector, for `type: html` |
| `jsonPath` | - | Dot notation path, for `type: json` |
| `timeout` | `10000` | Milliseconds before aborting the fetch |
| `screenshots` | `true` | Set to `false` to never capture this source |

```yaml
# Optional: screenshot archive retention.
# A full-page 1280px PNG weighs roughly 1-1.5 MB, so maxTotal is your
# storage budget per source: 40 is about 40-60 MB.
archive:
  keepRecent: 24   # newest screenshots, whatever their age
  keepDaily: 30    # one per day for the last N days
  maxTotal: 40     # hard cap per source
```

See `config.example.yml` for a commented version.

## Screenshots

One screenshot is taken on the first run of every source - that becomes its
thumbnail on the dashboard and the initial state. After that a new one is
captured **only when the content changes**, giving the before/after pair for
the timeline. Nothing is captured while things stay the same, so an hourly
schedule over a quiet site still produces exactly one image.

| Situation | Capture? |
| --- | --- |
| First run, no screenshot stored yet | yes - the initial thumbnail |
| The content hash changed | yes - the change gets a before/after pair |
| No change, a screenshot already exists | no |
| `screenshots: false`, or a non-http URL | no |

Shots land in `screenshots/<source-id>/<timestamp>.png`. The dashboard card
shows the newest one, and each source page renders the pair above the diff.

Because captures are tied to changes, a source that never changes keeps a
single image forever rather than accumulating one per run.

### Cookie banners

A consent banner sits exactly where the interesting content is, so every
capture dismisses it first:

1. find a visible button whose text matches a known consent label, preferring
   **reject** over accept - that way the monitor never quietly opts anyone into
   tracking, and the reject button usually gives the smaller banner
2. click it for real (the button is tagged in the page and clicked from Node,
   so banners that listen for pointer events still respond)
3. if the dialog is still up afterwards, hide it: a dozen known containers
   (OneTrust, Cookiebot, Usercentrics, Didomi, Quantcast...) plus generic
   `[id*="cookie"]` style rules

Per source, `consent: false` skips all of it and photographs the banner as-is.

### Capture size

Captures are 1120px wide and capped at 2400px tall, which is about three
viewports: enough to see a price or a counter, and a third of the weight. A
full 1280x8000 capture of a long page ran to 1.9 MB each; the same page at
1120x2400 is 0.56 MB. The 2400px cap does cut very long pages off at the
bottom - raise `FULL_PAGE_MAX_HEIGHT` in `lib/screenshot.js` if you need more.

### Retention

Three tiers, applied after each run in `lib/screenshot.js`:

1. keep the newest `keepRecent` shots, whatever their age
2. keep the newest shot of each of the last `keepDaily` days
3. drop the oldest until at most `maxTotal` remain per source

Screenshots still referenced by `api/<id>/history.json` are never deleted, even
if that pushes past `maxTotal` - otherwise the timeline would show broken
before/after images.

### Bot checks (Cloudflare and friends)

Some sites answer a plain HTTP request fine but show an anti-bot interstitial
to a real browser. In that case:

- change detection still works, because it uses plain `fetch`
- the capture is **not** saved. Archiving the challenge page would be worse
  than having no picture: it looks like the site but is not, and it would
  poison every before/after comparison built on it
- the dashboard shows **"Captura bloqueada"** with a hint, instead of quietly
  showing the old thumbnail
- `status.json` records `captureStatus: "blocked"` and what was detected, and
  the next run retries on its own

Three things reduce the odds of being challenged at all: a plain desktop
Chrome user agent, `--disable-blink-features=AutomationControlled` (removes
`navigator.webdriver`), and a per-source browser profile under
`screenshots/.profiles/` so cookies survive between runs.

After the page loads, the tool waits up to 15s for an interstitial to clear by
itself, which managed challenges usually do.

If a site stays blocked, the options are to live without its screenshot or to
point the capture at a browser service that solves challenges for you
(Browserless, ScrapingBee...). That is a paid dependency and is deliberately
not wired in.

### Browser

`puppeteer-core` does not download a browser. The tool looks for Chrome in
`PUPPETEER_EXECUTABLE_PATH`, `CHROME_PATH` and the usual install paths; the
GitHub `ubuntu-latest` runner already ships one. If none is found the run logs
a warning and continues without pictures.

Brave is Chromium-based, so it is in the lookup list too and will be used if it
is installed. It is not installed on the runners: Brave Shields is a browser
feature rather than something automation can rely on, and adding ~100 MB per
run to install it is not worth it when the cookie banner can simply be closed.

## Try it locally

There is a small test server in `examples/` so you can exercise the whole
pipeline without depending on anyone else's website:

```bash
npm run example          # http://localhost:8787
```

| Route | What it does |
| --- | --- |
| `/` | Product page whose price and stock change every `?every` seconds (default 20) |
| `/json` | JSON API, value changes on the same tick |
| `/slow?delay=5` | Responds late, for testing timeouts |
| `/boom` | Always 500, for testing error handling |

Then point the monitor at it:

```bash
cp examples/config.example.local.yml config.yml
npm run build
```

That config exercises all three source types plus an error case. Run it twice
about five seconds apart and you get the full cycle: first run captures the
initial thumbnail, the second detects the change and stores the before/after
pair with the diff. Add `?every=2` to make it change faster.

Content is derived from a tick counter, so the same tick always returns the
same bytes - which is exactly what you want for a change monitor.

## Local usage

```bash
npm run build   # Run one check and write the site to ./index.html
npm run dev     # Same, in watch mode
npm test        # Run the test suite
npm run notify  # Open/comment GitHub Issues for unreported changes
```

There is only one optional dependency (`puppeteer-core`); the monitor itself
runs on the Node.js standard library.

## Notifications via GitHub Issues

GitHub emails you when an issue is opened or commented on, so issues work as
a notification channel with no extra service involved.

`npm run notify` reads `api/<id>/status.json` and, for every change that has
not been reported yet, either opens an issue or comments on the open one:

> **estopa**
>
> - **Fuente:** https://www.estopa.com
> - **Detectado:** 2026-10-14T18:42:00.000Z
> - **Hash:** `1b4d0e8a2f7c` -> `9ae9e98bfd82`
> - **Timeline:** https://example.dev/source/estopa.html
>
> **Capturas**
>
> - **Antes:** [ver](https://example.dev/screenshots/estopa/2026-10-14T09-15-00.png)
> - **Después:** [ver](https://example.dev/screenshots/estopa/2026-10-14T18-42-00.png)
>
> **Diff**
>
> ```diff
>   Productos
> - Cafeteraexpress-22 - 199,00 EUR
> + Cafeteraexpress-22 - 149,00 EUR
> ... 212 lineas sin cambios
> ```

Behaviour worth knowing:

- **At most one open issue per source.** A change arriving while an alert is
  still open comments on it and closes it, so every change notifies but the
  issue list never piles up.
- **Idempotent.** `api/<id>/notified.json` records the last reported hash, so
  a re-run of the same change stays quiet.
- **Runs after the deploy**, so the links inside the issue are already live.
- **Never fails the build** - the workflow step is `continue-on-error`.
- Skip it entirely by removing the `issues: write` permission and the step.

Enable email by watching the repository (**Watch > Custom > Issues only**).
You will not get notifications by default.

The base URL used in those links comes from the `SITE_URL` repository
variable, else from `CNAME`, else `https://<owner>.github.io/<repo>`.

## How it works

```
1. Load config.yml
2. For each source:
   a. Fetch the URL (3 retries, 2s apart)
   b. Extract the content (as-is / selector / jsonPath)
   c. Hash it with SHA-256 and compare with the stored hash
   d. If it changed, store a line-level + word-level diff
   e. Capture a screenshot if it changed or if none exists for today
3. Write index.html, source/<id>.html and api/<id>/*.json
4. Prune the screenshot archive
```

## Generated files

These are **git-ignored** and rebuilt on every run:

```
index.html                    # Dashboard
source/<id>.html              # Per-source capture carousel
api/<id>/status.json          # State of the last check
api/<id>/history.json         # One entry per CHECK (last 200)
api/<id>/content.txt          # Last seen content, used to detect changes
screenshots/<id>/*.png        # Screenshot archive
```

### The history is a log of checks, not of changes

An hourly source that never changes would otherwise have an empty history and
nothing to show. So `history.json` gets one entry per check:

```json
{ "timestamp": "...", "status": "unchanged", "hash": "a8bf...", "screenshot": null }
```

The dashboard only needs `status.json` for this; the log is what feeds the
notification step and the diff it attaches to an Issue.

### Changed is an event, not a state

A source that changed an hour ago is currently fine. The dashboard shows a red
dot only when something is actually failing, and stays quiet otherwise.

Earlier captures sit in the version browser on the source page, newest first.

Hashes and the text diff are not rendered either: the diff of stripped page
text is mostly unreadable, and it is still computed and still goes into the
Issue body, where it earns its place.

### The page is a version browser, not a report

Two captures fill the viewport width, side by side, each 50% and capped at one
viewport tall. The header carries the version controls: the left arrow steps
towards the present (disabled there, since the newest capture is the present)
and the right arrow walks back through the history one version at a time, so
every step compares a capture with the one before it.

```
‹   3 / 12   ›
desde 14/10 17:28        14/10 17:28 → 14/10 16:34
última comprobación ahora          · 54 min
```

The counter and the two periods always describe the pair on screen, because
comparing them is the point of the page.

Captures are far taller than they are wide, so one frame never fits whole.
That is deliberate: enough at a glance to tell whether something moved. Each
capture scrolls on its own, so the rest of the page stays still while you
read down a screenshot.:<|end|><|start|>edit to=assistant<|channel|>analysis <|constrain|>xml<|message|><rfl:parameter name="path">
C:\Users\mox\Documents\changes\README.md

There are no status words on the page. Not "ok", not "changed", not a metrics
panel. The pictures are the record and the dates are the timeline, so there is
no third thing to keep in sync - and no way for a badge to disagree with what
the captures actually show. A change is announced once, as a GitHub Issue.

The source page carries no metrics block (type, HTTP, duration, response
size) for the same reason. Those are still recorded in `api/<id>/status.json`
if you ever want them programmatically.

## How state is stored

The repository keeps **no generated data**. Between runs the workflow caches
the `api/` and `screenshots/` folders with
[`actions/cache`](https://github.com/actions/cache), so hashes, history and
pictures survive without polluting the repo.

If the cache is ever lost, the next run simply reports "no changes yet" and
starts rebuilding from there.

## Status file format

Everything the fetcher learned about a source lands in `api/<id>/status.json`,
and the source page renders it:

```json
{
  "lastCheck": "2026-10-14T16:44:07.120Z",
  "status": "unchanged",
  "currentHash": "9ae9e98b...",
  "previousHash": "1b4d0e8a...",
  "checks": 16,
  "fetchedAt": "2026-10-14T16:44:07.098Z",
  "httpStatus": 200,
  "durationMs": 178,
  "responseBytes": 162018,
  "contentChars": 1439,
  "contentLines": 46,
  "error": null
}
```

So each source page answers, without you having to guess: how long the request
took, whether the server answered OK, how big the page was versus how much was
actually extracted, when it was last checked, and what the content hash is now
versus what it was before.

## GitHub Actions

`.github/workflows/changes-check.yml` runs on demand (**Actions > Run workflow**).
To run it on a schedule, uncomment the `schedule` block at the top of the file.

The workflow:

1. Restores the cached `api/` state
2. Runs `npm run build`
3. Saves the new state
4. Copies the generated site into `_site/` and deploys **only that** to GitHub Pages

Nothing is ever pushed back to the repository.

### Repository permissions

The workflow declares the least privileges it needs:

```yaml
permissions:
  contents: read
  pages: write
  id-token: write
```

### Custom domain

If you publish to a custom domain, set it in `CNAME`. The workflow copies it into
the deployment automatically.

## Project layout

```
index.js               # Orchestrator: config, loop, files
lib/detector.js        # Fetching, extraction, hashing
lib/diff.js            # LCS line diff (Issue bodies only, not the site)
lib/screenshot.js      # Capture, bot-check detection, retention
lib/html.js            # Dashboard and carousel generation
lib/yaml-parser.js     # Minimal YAML parser
lib/utils.js           # Ids, dates, relative times, formatting
lang/{en,es}.json      # Every string in the interface
scripts/notify.js      # GitHub Issue notifications
```

## Notes and limits

- Selectors are simple (`.class`, `#id`, `[attr]`, `tag`) - not full CSS.
- JSON paths use plain dot notation.
- `content` sources hash the visible text, so scripts and styles are ignored.
- History keeps the 50 most recent changes per source.
- Screenshots are full-page PNGs capped at 8000px tall. Very tall pages get
  truncated, which is plenty for spotting a price or a ticket counter.
- `actions/cache` entries are dropped after 7 days without a run. As long as
  the workflow keeps running, the archive stays warm.

## License

MIT