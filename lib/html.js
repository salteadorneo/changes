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

function pageHead(title, lang, { fullBleed = false } = {}) {
    // The source page gives the whole viewport width to the captures; the
    // dashboard keeps a readable measure.
    const container = fullBleed
        ? 'w-full px-2 sm:px-3'
        : 'mx-auto w-full max-w-7xl px-4 sm:px-6';

    return `<!DOCTYPE html>
<html lang="${escapeHtml(lang)}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <script>tailwind.config = { darkMode: 'media' }</script>
</head>
<body class="bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-50 antialiased min-h-screen">
<div class="${container} py-4 sm:py-6">`;
}

function pageFooter(repoUrl, language) {
    return `
  <footer class="mt-10 border-t border-zinc-200 dark:border-zinc-800 pt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-500 dark:text-zinc-500">
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

export function generateHTML(title, results, config = {}) {
    const language = config.language || 'en';
    const now = new Date();
    const repoUrl = config.repo || 'https://github.com/salteadorneo/changes';

    const broken = results.filter(r => r.status === 'error');
    const withShots = results.filter(r => r.thumbnail).length;

    const cards = results.map(result => `
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
  <header class="flex flex-wrap items-end justify-between gap-4">
    <div>
      <h1 class="text-2xl sm:text-3xl font-semibold tracking-tight">${escapeHtml(title)}</h1>
      <p class="mt-1 text-sm text-zinc-500 dark:text-zinc-400">${escapeHtml(t(language, 'lastCheck'))}: ${escapeHtml(formatDate(now, language))}</p>
    </div>
    ${broken.length > 0
            ? `<span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-red-200 dark:border-red-900/60 bg-white dark:bg-zinc-900">
                 <span class="h-1.5 w-1.5 rounded-full bg-red-500"></span>
                 <span class="text-red-600 dark:text-red-400 font-medium">${broken.length}</span>
                 <span class="text-zinc-500 dark:text-zinc-400">${escapeHtml(broken.length === 1 ? t(language, 'errorSource') : t(language, 'errorSources'))}</span>
               </span>`
            : ''}
  </header>

  <p class="mt-5 text-xs text-zinc-400 dark:text-zinc-500">
    ${escapeHtml(plural(results.length, t(language, 'source'), t(language, 'sources')))}
    ${withShots ? ` · ${escapeHtml(plural(withShots, t(language, 'capture'), t(language, 'captures')))}` : ''}
  </p>

  <main class="mt-4">
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      ${cards}
    </div>
  </main>
${pageFooter(repoUrl, language)}`;
}

/* ------------------------------------------------------------ source page */

export function generateSourcePage(source, history = [], config = {}) {
    const language = config.language || 'en';
    const now = new Date();
    const repoUrl = config.repo || 'https://github.com/salteadorneo/changes';

    const name = typeof source === 'string' ? source : (source.name || source.id);

    return `${pageHead(`${name} - ${BRAND}`, language, { fullBleed: true })}
  <a href="../index.html" class="text-xs text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 transition-colors px-1">&larr; ${escapeHtml(t(language, 'back'))}</a>

  <header class="mt-2 mb-3 px-1 flex flex-wrap items-end justify-between gap-3">
    <div class="min-w-0">
      <h1 class="text-lg sm:text-xl font-semibold tracking-tight truncate">${escapeHtml(name)}</h1>
      ${source && source.url
            ? `<a href="${escapeHtml(source.url)}" target="_blank" rel="noopener noreferrer"
                 class="mt-0.5 block text-xs text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 transition-colors truncate">${escapeHtml(source.url)}</a>`
            : ''}
    </div>
    ${source && source.lastCheck
            ? `<span class="text-xs text-zinc-400 dark:text-zinc-500 whitespace-nowrap">${escapeHtml(t(language, 'lastCheck'))} ${escapeHtml(formatRelative(source.lastCheck, language, now))}</span>`
            : ''}
  </header>

  ${versionStack(source, language)}
${pageFooter(repoUrl, language)}`;
}

/**
 * Every capture, newest first, stacked vertically.
 *
 * Each capture takes the full viewport width and is capped at one viewport
 * tall, so the stack scrolls one capture per screen. Captures are much taller
 * than they are wide, so a single frame never fits whole - the point is to see
 * enough at a glance to tell whether something moved; click through for the
 * full image.
 *
 * No status words anywhere: each frame is labelled with the period it covers
 * and nothing else. The pictures are the record, the dates are the timeline,
 * and there is no third thing to keep in sync.
 */
function versionStack(source, language) {
    if (typeof source === 'string' || !source.versions || source.versions.length === 0) {
        return `
  <div class="h-[60dvh] flex items-center justify-center rounded-lg border border-dashed border-zinc-200 dark:border-zinc-800 text-sm text-zinc-400 dark:text-zinc-500">
    ${escapeHtml(t(language, 'noCapture'))}
  </div>`;
    }

    const frames = source.versions.map((version, i) => {
        const url = `../${version.path}`;
        const taken = formatDateShort(new Date(version.takenAt), language);

        // The newest version has no end; every older one ended when the next
        // capture replaced it.
        const period = i === 0
            ? `<span class="text-zinc-400 dark:text-zinc-500">${escapeHtml(t(language, 'since'))} ${escapeHtml(taken)}</span>
               <span class="text-zinc-400 dark:text-zinc-600">·</span>
               <span class="text-zinc-400 dark:text-zinc-500">${escapeHtml(t(language, 'lastCheck'))} ${escapeHtml(formatRelative(version.lastCheck, language))}</span>`
            : `<span class="text-zinc-300 dark:text-zinc-600">${escapeHtml(formatDateShort(new Date(version.until), language))}</span>
               <span class="text-zinc-600 dark:text-zinc-700">&rarr;</span>
               <span class="text-zinc-400 dark:text-zinc-500">${escapeHtml(taken)}</span>
               <span class="text-zinc-600 dark:text-zinc-700">·</span>
               <span class="text-zinc-400 dark:text-zinc-500">${escapeHtml(formatSpan(new Date(version.until) - new Date(version.takenAt), language))}</span>`;

        return `
    <figure class="snap-start snap-always shrink-0">
      <a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer"
         class="block rounded-lg overflow-hidden border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:border-zinc-300 dark:hover:border-zinc-700 transition-colors">
        <img src="${escapeHtml(url)}" alt="" loading="${i < 2 ? 'eager' : 'lazy'}"
             class="w-full max-h-[100dvh] object-cover object-top bg-zinc-100 dark:bg-zinc-950">
      </a>
      <figcaption class="py-2 flex flex-wrap items-baseline gap-x-2 text-xs">${period}</figcaption>
    </figure>`;
    }).join('');

    const single = source.versions.length === 1;
    const arrow = (id, label, symbol, side) => `
      <button type="button" id="${id}" aria-label="${escapeHtml(label)}"
        class="absolute ${side} top-1/2 -translate-y-1/2 z-10 h-11 w-11 flex items-center justify-center rounded-full border border-zinc-200 dark:border-zinc-800 bg-white/90 dark:bg-zinc-900/90 backdrop-blur text-zinc-700 dark:text-zinc-200 shadow-sm transition hover:bg-white dark:hover:bg-zinc-800 disabled:opacity-0 disabled:pointer-events-none">
        <span aria-hidden="true">${symbol}</span>
      </button>`;

    return `
  <div class="relative">
    <div id="stack"
         class="flex flex-col gap-3 overflow-y-auto snap-y snap-mandatory overscroll-contain max-h-[100dvh]
                [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar-track]:bg-transparent
                [&::-webkit-scrollbar-thumb]:bg-zinc-300 dark:[&::-webkit-scrollbar-thumb]:bg-zinc-700 rounded">
      ${frames}
    </div>
    ${single ? '' : arrow('prev', t(language, 'prev'), '&#8249;', 'left-2')}
    ${single ? '' : arrow('next', t(language, 'next'), '&#8250;', 'right-2')}
  </div>
${single ? '' : stackScript()}`;
}

/**
 * Arrow navigation on top of the native vertical scroll, so the arrows and
 * the stack stay in step. No dependency, ~20 lines.
 */
function stackScript() {
    return `
<script>
(() => {
  const track = document.getElementById('stack');
  const prev = document.getElementById('prev');
  const next = document.getElementById('next');
  if (!track || !prev || !next) return;

  const frame = track.querySelector('.snap-start');
  const step = () => (frame ? frame.offsetHeight + 12 : track.clientHeight);

  const sync = () => {
    const max = track.scrollHeight - track.clientHeight - 4;
    prev.disabled = track.scrollTop <= 4;
    next.disabled = track.scrollTop >= max;
  };

  prev.addEventListener('click', () => track.scrollBy({ top: -step(), behavior: 'smooth' }));
  next.addEventListener('click', () => track.scrollBy({ top: step(), behavior: 'smooth' }));

  track.addEventListener('scroll', () => requestAnimationFrame(sync), { passive: true });
  window.addEventListener('resize', sync);
  sync();
})();
</script>`;
}