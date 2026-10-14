import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { formatDate, formatDateShort, formatRelative, formatSpan } from './utils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const { version } = JSON.parse(
    fs.readFileSync(path.join(__dirname, '../package.json'), 'utf-8')
);

/**
 * Project name. It is the logo and never gets translated.
 */
const BRAND = 'Changes';

const LANG_CACHE = new Map();

/**
 * Load lang/<code>.json, falling back to English.
 * @param {string} language
 * @returns {Object}
 */
export function loadLanguage(language = 'en') {
    if (LANG_CACHE.has(language)) return LANG_CACHE.get(language);

    let strings = {};
    try {
        const file = path.join(__dirname, '..', 'lang', `${language}.json`);
        if (fs.existsSync(file)) {
            strings = JSON.parse(fs.readFileSync(file, 'utf-8'));
        }
    } catch (error) {
        console.error(`Could not load lang/${language}.json:`, error.message);
    }

    if (Object.keys(strings).length === 0) {
        const enFile = path.join(__dirname, '..', 'lang', 'en.json');
        if (fs.existsSync(enFile)) {
            strings = JSON.parse(fs.readFileSync(enFile, 'utf-8'));
        }
    }

    LANG_CACHE.set(language, strings);
    return strings;
}

function t(language, key) {
    return loadLanguage(language)[key] ?? loadLanguage('en')[key] ?? key;
}

function escapeHtml(str) {
    return String(str ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function plural(count, singular, pluralForm) {
    return `${count} ${count === 1 ? singular : pluralForm}`;
}

/**
 * Full viewport width everywhere: these pages are made of images, and a
 * readable measure only makes them smaller.
 *
 * `locked` is for the source page, where the captures scroll inside their own
 * frames and the page itself must not scroll.
 */
function pageHead(title, lang, { locked = false } = {}) {
    return `<!DOCTYPE html>
<html lang="${escapeHtml(lang)}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <script>tailwind.config = { darkMode: 'media' }</script>
</head>
<body class="min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-50 antialiased">
<div class="w-full px-2 sm:px-3 py-3">`;
}

function pageFooter(repoUrl, language) {
    return `
  <footer class="mt-8 border-t border-zinc-200 dark:border-zinc-800 pt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-500 dark:text-zinc-500">
    <span class="font-semibold text-zinc-700 dark:text-zinc-300">${escapeHtml(BRAND)}</span>
    <span aria-hidden="true">·</span>
    <span>v${escapeHtml(version)}</span>
    <span aria-hidden="true">·</span>
    <a href="${escapeHtml(repoUrl)}" target="_blank" rel="noopener noreferrer" class="hover:text-zinc-900 dark:hover:text-zinc-200 transition-colors">${escapeHtml(t(language, 'github'))}</a>
    <span aria-hidden="true">·</span>
    <a href="${escapeHtml(repoUrl)}/issues/new" target="_blank" rel="noopener noreferrer" class="hover:text-zinc-900 dark:hover:text-zinc-200 transition-colors">${escapeHtml(t(language, 'report'))}</a>
  </footer>
</div>
</body>
</html>`;
}

function hostOf(url) {
    if (!url) return '';
    try {
        return new URL(url).host;
    } catch {
        return String(url);
    }
}

/**
 * Shown in place of the capture when there is none.
 * A blocked capture is called out: it is a different situation from "nothing
 * to show yet" and the difference matters.
 */
function capturePlaceholder(result, language) {
    const base = 'w-full h-28 flex flex-col items-center justify-center gap-1 bg-zinc-100 dark:bg-zinc-900 text-xs';

    if (result.captureStatus === 'blocked') {
        return `
      <div class="${base} text-amber-600 dark:text-amber-400 px-3 text-center">
        <span class="font-medium">${escapeHtml(t(language, 'captureBlocked'))}</span>
        <span class="text-zinc-500 dark:text-zinc-500 text-[11px] leading-snug">${escapeHtml(t(language, 'captureBlockedHint'))}</span>
      </div>`;
    }

    if (result.captureStatus === 'failed') {
        return `
      <div class="${base} text-red-600 dark:text-red-400">
        <span class="font-medium">${escapeHtml(t(language, 'captureFailed'))}</span>
      </div>`;
    }

    return `<div class="${base} text-zinc-400 dark:text-zinc-600">${escapeHtml(t(language, 'noCapture'))}</div>`;
}

/* -------------------------------------------------------------- dashboard */

/**
 * Most recent change moment of a source, or 0 if it has never changed.
 * A source that moved this run reports its run time; an older source reaches
 * into its history, so a quiet source sinks to the bottom of the home.
 */
function lastModifiedAt(result) {
    if (!result) return 0;
    if (result.status === 'changed' && result.lastCheck) {
        const t = new Date(result.lastCheck).getTime();
        if (Number.isFinite(t)) return t;
    }
    if (Array.isArray(result.history)) {
        let max = 0;
        for (const entry of result.history) {
            if (entry && entry.status === 'changed' && entry.timestamp) {
                const t = new Date(entry.timestamp).getTime();
                if (Number.isFinite(t) && t > max) max = t;
            }
        }
        if (max > 0) return max;
    }
    return 0;
}

export function generateHTML(title, results, config = {}) {
    const language = config.language || 'en';
    const now = new Date();
    const repoUrl = config.repo || 'https://github.com/salteadorneo/changes';

    const ordered = [...results].sort((a, b) => lastModifiedAt(b) - lastModifiedAt(a));

    const broken = ordered.filter(r => r.status === 'error');
    const withShots = ordered.filter(r => r.thumbnail).length;

    const cards = ordered.map(result => `
      <a href="./source/${escapeHtml(result.id)}.html" class="group block bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg overflow-hidden transition-all hover:border-zinc-300 dark:hover:border-zinc-700 hover:shadow-sm">
        <div class="relative overflow-hidden border-b border-zinc-200 dark:border-zinc-800 bg-zinc-100 dark:bg-zinc-900">
          ${result.thumbnail
                ? `<img src="${escapeHtml(result.thumbnail)}" alt="${escapeHtml(result.name)}" loading="lazy"
                     class="w-full h-32 object-cover object-top transition-transform duration-300 group-hover:scale-[1.03]">`
                : capturePlaceholder(result, language)}
          ${result.status === 'error'
                ? `<span class="absolute top-2 right-2 h-2 w-2 rounded-full bg-red-500 ring-2 ring-white/80 dark:ring-zinc-900/80"></span>`
                : ''}
        </div>
        <div class="p-4">
          <div class="flex items-baseline justify-between gap-2">
            <h2 class="text-sm font-semibold truncate">${escapeHtml(result.name)}</h2>
            ${result.lastCheck
                    ? `<span class="shrink-0 text-[11px] text-zinc-400 dark:text-zinc-500">${escapeHtml(formatRelative(result.lastCheck, language, now))}</span>`
                    : ''}
          </div>
          <p class="mt-1 text-xs text-zinc-500 dark:text-zinc-400 truncate">${escapeHtml(hostOf(result.url))}</p>
        </div>
      </a>`).join('');

    return `${pageHead(title, language)}
  <header class="shrink-0 pb-3 space-y-1">
    <div class="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
      <div class="flex items-baseline gap-2 min-w-0">
        <h1 class="text-lg sm:text-xl font-semibold tracking-tight truncate">${escapeHtml(title)}</h1>
        <span class="shrink-0 text-[11px] text-zinc-400 dark:text-zinc-500">v${escapeHtml(version)}</span>
      </div>
      <div class="flex items-center gap-3 text-[11px] text-zinc-500 dark:text-zinc-400 shrink-0">
        <a href="${escapeHtml(repoUrl)}" target="_blank" rel="noopener noreferrer" class="hover:text-zinc-900 dark:hover:text-zinc-200 transition-colors">${escapeHtml(t(language, 'github'))}</a>
        <a href="${escapeHtml(repoUrl)}/issues/new" target="_blank" rel="noopener noreferrer" class="hover:text-zinc-900 dark:hover:text-zinc-200 transition-colors">${escapeHtml(t(language, 'report'))}</a>
        ${broken.length > 0
            ? `<span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-red-200 dark:border-red-900/60 bg-white dark:bg-zinc-900">
                 <span class="h-1.5 w-1.5 rounded-full bg-red-500"></span>
                 <span class="text-red-600 dark:text-red-400 font-medium">${broken.length}</span>
                 <span class="text-zinc-500 dark:text-zinc-400">${escapeHtml(broken.length === 1 ? t(language, 'errorSource') : t(language, 'errorSources'))}</span>
               </span>`
            : ''}
      </div>
    </div>
    <p class="text-xs text-zinc-500 dark:text-zinc-400">${escapeHtml(t(language, 'lastCheck'))}: ${escapeHtml(formatDate(now, language))}</p>
    <p class="text-xs text-zinc-400 dark:text-zinc-500">${escapeHtml(plural(results.length, t(language, 'source'), t(language, 'sources')))}${withShots ? ` · ${escapeHtml(plural(withShots, t(language, 'capture'), t(language, 'captures')))}` : ''}</p>
  </header>

  <main class="mt-4">
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      ${cards}
    </div>
  </main>
</div>
</body>
</html>`;
}

/* ------------------------------------------------------------ source page */

export function generateSourcePage(source, config = {}) {
    const language = config.language || 'en';
    const repoUrl = config.repo || 'https://github.com/salteadorneo/changes';

    const name = typeof source === 'string' ? source : (source.name || source.id);
    const hasVersions = typeof source !== 'string'
        && Array.isArray(source.versions)
        && source.versions.length > 0;

    return `${pageHead(`${name} - ${BRAND}`, language, { locked: hasVersions })}
  ${versionHeader(source, language, repoUrl)}

  ${versionTrack(source, language)}
</div>
</body>
</html>`;
}

/**
 * Header with the version controls.
 *
 * Two captures are visible at a time, side by side, and the arrows walk
 * through the history one capture at a time: left goes towards the present
 * and is disabled there, right steps back, so each press compares a capture
 * with the one before it.
 *
 * The header always describes the pair on screen, because comparing them is
 * the point of the page. It is kept to two tight rows because the captures
 * need the height more than the chrome does.
 */
function versionHeader(source, language, repoUrl) {
    if (typeof source === 'string' || !source.versions || source.versions.length === 0) {
        return `
  <header class="sticky top-0 z-20 -mx-2 sm:-mx-3 px-2 sm:px-3 py-2 bg-zinc-50/90 dark:bg-zinc-950/90 backdrop-blur flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
    <div class="min-w-0 flex items-baseline gap-2">
      <a href="../index.html" class="shrink-0 text-xs text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 transition-colors">&larr;</a>
      <h1 class="text-lg sm:text-xl font-semibold tracking-tight truncate">${escapeHtml(source.name || source.id)}</h1>
      ${source.url
            ? `<a href="${escapeHtml(source.url)}" target="_blank" rel="noopener noreferrer"
                 class="hidden sm:inline text-[11px] text-zinc-400 dark:text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300 transition-colors truncate">${escapeHtml(hostOf(source.url))}</a>`
            : ''}
    </div>

  </header>`;
    }

    const total = source.versions.length;
    const name = source.name || source.id;

    // Nothing to compare against, so no controls at all
    if (total < 2) {
        return `
  <header class="sticky top-0 z-20 -mx-2 sm:-mx-3 px-2 sm:px-3 py-2 bg-zinc-50/90 dark:bg-zinc-950/90 backdrop-blur flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
    <div class="min-w-0 flex items-baseline gap-2">
      <a href="../index.html" class="shrink-0 text-xs text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 transition-colors">&larr;</a>
      <h1 class="text-lg sm:text-xl font-semibold tracking-tight truncate">${escapeHtml(name)}</h1>
      ${source.url
                ? `<a href="${escapeHtml(source.url)}" target="_blank" rel="noopener noreferrer"
                     class="hidden sm:inline text-[11px] text-zinc-400 dark:text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300 transition-colors truncate">${escapeHtml(hostOf(source.url))}</a>`
                : ''}
    </div>

  </header>`;
    }

    const arrow = (id, label, symbol, extra) => `
      <button type="button" id="${id}" aria-label="${escapeHtml(label)}" ${extra}
        class="h-7 w-7 shrink-0 flex items-center justify-center rounded-full border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-300 transition hover:border-zinc-300 dark:hover:border-zinc-700 disabled:opacity-30 disabled:pointer-events-none">
        <span aria-hidden="true">${symbol}</span>
      </button>`;

    return `
  <header class="sticky top-0 z-20 -mx-2 sm:-mx-3 px-2 sm:px-3 py-2 bg-zinc-50/90 dark:bg-zinc-950/90 backdrop-blur pb-2">
    <div class="flex items-center justify-between gap-3">
      <div class="min-w-0 flex items-baseline gap-2">
        <a href="../index.html" class="shrink-0 text-xs text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 transition-colors">&larr;</a>
        <h1 class="text-lg sm:text-xl font-semibold tracking-tight truncate">${escapeHtml(name)}</h1>
        <a href="${escapeHtml(source.url || '')}" target="_blank" rel="noopener noreferrer"
           class="hidden sm:inline text-[11px] text-zinc-400 dark:text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300 transition-colors truncate">${escapeHtml(hostOf(source.url))}</a>
      </div>

      <div class="flex items-center gap-1.5 shrink-0">
        ${arrow('prev', t(language, 'prev'), '&#8249;', 'disabled')}
        <span id="counter" class="text-[11px] tabular-nums text-zinc-500 dark:text-zinc-400 min-w-[3.5rem] text-center">1 / ${total}</span>
        ${arrow('next', t(language, 'next'), '&#8250;', '')}
      </div>
    </div>

    <div class="mt-1 grid grid-cols-2 gap-2 text-[11px]">
      <div id="period-a" class="truncate text-zinc-500 dark:text-zinc-400"></div>
      <div id="period-b" class="truncate text-zinc-500 dark:text-zinc-400"></div>
    </div>
  </header>`;
}

/**
 * Two captures at a time, each 50% of the viewport, side by side.
 *
 * Each capture scrolls inside its own frame: they are much taller than the
 * viewport, so the page itself never scrolls and the wheel over a capture
 * walks down that page.
 */
function versionTrack(source, language) {
    if (typeof source === 'string' || !source.versions || source.versions.length === 0) {
        return `
  <div class="flex-1 min-h-0 flex items-center justify-center rounded-lg border border-dashed border-zinc-200 dark:border-zinc-800 text-sm text-zinc-400 dark:text-zinc-500">
    ${escapeHtml(t(language, 'noCapture'))}
  </div>`;
    }

    const single = source.versions.length === 1;
    // Two frames plus the gap between them fill the width exactly
    const width = single ? 'w-full' : 'w-[calc(50%-0.25rem)]';

    const frames = source.versions.map((version, i) => `
    <figure class="snap-start snap-always shrink-0 ${width}">
      <div class="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden">
        <img src="../${escapeHtml(version.path)}" alt="" loading="${i < 2 ? 'eager' : 'lazy'}"
             class="w-full block bg-zinc-100 dark:bg-zinc-950">
      </div>
    </figure>`).join('');

    if (single) {
        return `
  <div id="track" class="flex gap-2">${frames}</div>`;
    }

    return `
  <div id="track" class="flex gap-2 overflow-x-auto snap-x snap-mandatory overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
    ${frames}
  </div>
  <script type="application/json" id="periods">${JSON.stringify(periodLabels(source.versions, language))}</script>
${versionScript()}`;
}

/**
 * One label per capture: when it started, and when it ended.
 * Pre-formatted here so the browser does not have to do date arithmetic.
 */
function periodLabels(versions, language) {
    return versions.map((version, i) => {
        const taken = formatDateShort(new Date(version.takenAt), language);

        if (i === 0) {
            return `${t(language, 'since')} ${taken} · ${t(language, 'lastCheck')} ${formatRelative(version.lastCheck, language)}`;
        }

        const until = formatDateShort(new Date(version.until), language);
        const span = formatSpan(new Date(version.until) - new Date(version.takenAt), language);
        return `${until} \u2192 ${taken} · ${span}`;
    });
}

/**
 * Version navigation, in the header, over a natively scrolling track.
 * No dependency, ~30 lines.
 *
 * An arrow moves by a single frame, not by a pair: when frames 1-2 are on
 * screen the next press brings 2-3, so every press compares a capture with
 * the one before it.
 */
function versionScript() {
    return `
<script>
(() => {
  const track = document.getElementById('track');
  const prev = document.getElementById('prev');
  const next = document.getElementById('next');
  const counter = document.getElementById('counter');
  const periodA = document.getElementById('period-a');
  const periodB = document.getElementById('period-b');
  if (!track || !prev || !next) return;

  const periods = JSON.parse(document.getElementById('periods').textContent);
  const frame = track.querySelector('.snap-start');
  const step = () => (frame ? frame.offsetWidth : track.clientWidth) + 8;
  // With N captures there are N-1 comparisons, so the last pair starts at
  // N-2: two frames must remain on screen. pressing the arrow with only 2
  // captures therefore does nothing useful and is disabled from the start.
  const last = periods.length - 2;

  let index = 0;

  function render(scroll) {
    if (scroll) {
      track.scrollTo({ left: index * step(), behavior: 'smooth' });
    }
    counter.textContent = (index + 1) + ' / ' + periods.length;
    // The frame on the left, and the one it is being compared against
    periodA.textContent = periods[index];
    periodB.textContent = periods[index + 1] || '';
    prev.disabled = index === 0;
    next.disabled = index >= last;
  }

  prev.addEventListener('click', () => { index = Math.max(0, index - 1); render(true); });
  next.addEventListener('click', () => { index = Math.min(last, index + 1); render(true); });

  track.addEventListener('scroll', () => {
    const nearest = Math.round(track.scrollLeft / step());
    if (nearest !== index) {
      index = Math.min(last, Math.max(0, nearest));
      render(false);
    }
  }, { passive: true });

  window.addEventListener('resize', () => render(true));
  render(false);
})();
</script>`;
}