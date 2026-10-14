# Changes Monitor

Lightweight change detection and monitoring system for GitHub Pages, designed to be used as a **GitHub template**.

It checks a list of URLs every run, hashes what it finds, and publishes a static dashboard with a word-level diff timeline and a **before/after screenshot** for every change.

Typical uses: tracking offer prices, event ticket availability, release notes, or any page that changes without notice.

- **One optional dependency** - `puppeteer-core`, which drives the Chrome already installed on the machine
- **Nothing generated is committed** - output lives in the Actions cache and in the deployment artifact
- **Opt-in** - the workflow only runs when you trigger it
- **Degrades gracefully** - with no browser available the monitor still works, just without pictures

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

Every run decides whether to capture, so a 15-minute schedule does not mean
15 minutes of screenshots:

| Situation | Capture? |
| --- | --- |
| The content hash changed | yes - the change gets a before/after pair |
| No change, but nothing captured today | yes - daily heartbeat |
| No change, already captured today | no |
| `screenshots: false`, or a non-http URL | no |

Shots land in `screenshots/<source-id>/<timestamp>.png` and the source page
renders them side by side above the diff.

### Retention

Three tiers, applied after each run in `lib/screenshot.js`:

1. keep the newest `keepRecent` shots, whatever their age
2. keep the newest shot of each of the last `keepDaily` days
3. drop the oldest until at most `maxTotal` remain per source

### Browser

`puppeteer-core` does not download a browser. The tool looks for Chrome in
`PUPPETEER_EXECUTABLE_PATH`, `CHROME_PATH` and the usual install paths; the
GitHub `ubuntu-latest` runner already ships one. If none is found the run logs
a warning and continues without pictures.

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
source/<id>.html              # Per-source change timeline
api/<id>/status.json          # Current hash and status
api/<id>/history.json         # Last 50 changes with diffs and screenshots
api/<id>/content.txt          # Last seen content, used to build the next diff
screenshots/<id>/*.png        # Screenshot archive
```

## How state is stored

The repository keeps **no generated data**. Between runs the workflow caches
the `api/` and `screenshots/` folders with
[`actions/cache`](https://github.com/actions/cache), so hashes, history and
pictures survive without polluting the repo.

If the cache is ever lost, the next run simply reports "no changes yet" and
starts rebuilding from there.

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
lib/diff.js            # LCS line diff + word-level diff
lib/screenshot.js      # Capture, archive listing, retention
lib/html.js            # Dashboard and timeline generation
lib/yaml-parser.js     # Minimal YAML parser
lib/utils.js           # Ids, dates and JSON helpers
lang/{en,es}.json      # UI strings
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