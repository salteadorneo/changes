import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { formatBytes, formatDate, formatDateShort, formatDuration, formatRelative, formatSpan } from './utils.js';

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
 * Cached, because the strings are looked up one by one while rendering.
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

function pageHead(title, lang) {
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
<div class="mx-auto w-full max-w-5xl px-4 sm:px-6 py-10 sm:py-14">`;
}

function pageFooter(repoUrl, language) {
    return `
  <footer class="mt-14 border-t border-zinc-200 dark:border-zinc-800 pt-5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-500 dark:text-zinc-500">
    <span class="font-semibold text-zinc-700 dark:text-zinc-300">${escapeHtml(BRAND)}</span>
    <span aria-hidden="true">&middot;</span>
    <span>v${escapeHtml(version)}</span>
    <span aria-hidden="true">&middot;</span>
    <a href="${escapeHtml(repoUrl)}" target="_blank" rel="noopener noreferrer" class="hover:text-zinc-900 dark:hover:text-zinc-200 transition-colors">${escapeHtml(t(language, 'github'))}</a>
    <span aria-hidden="true">&middot;</span>
    <a href="${escapeHtml(repoUrl)}/issues/new" target="_blank" rel="noopener noreferrer" class="hover:text-zinc-900 dark:hover:text-zinc-200 transition-colors">${escapeHtml(t(language, 'report'))}</a>
  </footer>
</div>
</body>
</html>`;
}

/* ---------------------------------------------------------------- helpers */

/**
 * Health of a source right now.
 *
 * "changed" is deliberately not a state: it describes one run that already
 * happened and was already reported, so a source that changed an hour ago is
 * currently fine. It only colours the dot on the check it belongs to.
 */
const DOT = {
    green: 'bg-emerald-500',
    amber: 'bg-amber-500',
    red: 'bg-red-500',
    muted: 'bg-zinc-300 dark:bg-zinc-600'
};

const TEXT = {
    green: 'text-emerald-600 dark:text-emerald-400',
    amber: 'text-amber-600 dark:text-amber-400',
    red: 'text-red-600 dark:text-red-400',
    muted: 'text-zinc-500'
};

function hostOf(url) {
    if (!url) return '';
    try {
        return new URL(url).host;
    } catch {
        return String(url);
    }
}

function sourceTypeLabel(source, language) {
    const suffix = String(source.type || 'content').replace(/^./, c => c.toUpperCase());
    return t(language, `type${suffix}`);
}

function detailRow(label, value) {
    if (value === undefined || value === null || value === '') return '';
    return `
      <div class="flex items-baseline justify-between gap-4 py-1.5 border-b border-zinc-100 dark:border-zinc-800/60 last:border-0">
        <dt class="text-xs text-zinc-500 dark:text-zinc-400 shrink-0">${escapeHtml(label)}</dt>
        <dd class="text-xs font-mono text-zinc-800 dark:text-zinc-200 truncate text-right">${escapeHtml(value)}</dd>
      </div>`;
}

/**
 * The picture to show for a given check.
 *
 * Walks the log OLDEST first carrying the last capture seen, so a check that
 * did not capture shows the one that was already in effect at that moment.
 * Walking newest-first would be wrong: the capture that applies to the most
 * recent check often sits in the entry just below it.
 *
 * @param {Array} history newest first
 * @returns {Array} a new array, newest first, each entry with `.shown` set
 */
export function resolveShots(history) {
    let carried = null;

    const resolved = history.slice().reverse().map(entry => {
        if (entry.screenshot) carried = entry.screenshot;
        return { ...entry, shown: carried };
    });

    return resolved.reverse();
}

/* -------------------------------------------------------------- dashboard */

export function generateHTML(title, results, config = {}) {
    const language = config.language || 'en';
    const now = new Date();
    const repoUrl = config.repo || 'https://github.com/salteadorneo/changes';

    const healthy = results.filter(r => r.status !== 'error').length;
    const broken = results.length - healthy;
    const changed = results.filter(r => r.status === 'changed').length;
    const withShots = results.filter(r => r.thumbnail).length;

    const cards = results.map(result => {
        const tone = result.status === 'error' ? 'red' : 'green';
        const relative = result.lastCheck ? formatRelative(result.lastCheck, language, now) : '';

        return `
      <a href="./source/${escapeHtml(result.id)}.html" class="group block bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg overflow-hidden transition-all hover:border-zinc-300 dark:hover:border-zinc-700 hover:shadow-sm">
        <div class="relative overflow-hidden border-b border-zinc-200 dark:border-zinc-800 bg-zinc-100 dark:bg-zinc-900">
          ${result.thumbnail
                ? `<img src="${escapeHtml(result.thumbnail)}" alt="${escapeHtml(result.name)}" loading="lazy"
                     class="w-full h-28 object-cover object-top transition-transform duration-300 group-hover:scale-[1.03]">`
                : placeholder(result, language)}
          <span class="absolute top-2 right-2 h-2 w-2 rounded-full ${DOT[tone]} ring-2 ring-white/80 dark:ring-zinc-900/80"></span>
        </div>
        <div class="p-4">
          <div class="flex items-baseline justify-between gap-2">
            <h2 class="text-sm font-semibold truncate">${escapeHtml(result.name)}</h2>
            ${result.status === 'error'
                ? `<span class="shrink-0 text-[11px] ${TEXT.red} truncate max-w-[45%]" title="${escapeHtml(result.error || '')}">${escapeHtml(result.error || '')}</span>`
                : `<span class="shrink-0 text-[11px] text-zinc-400 dark:text-zinc-500">${escapeHtml(relative)}</span>`}
          </div>
          <p class="mt-1 text-xs text-zinc-500 dark:text-zinc-400 truncate">${escapeHtml(hostOf(result.url))}</p>
          ${result.changesCount
                ? `<p class="mt-2 text-xs text-zinc-500 dark:text-zinc-400">${escapeHtml(plural(result.changesCount, t(language, 'change'), t(language, 'changes')))}</p>`
                : ''}
        </div>
      </a>`;
    }).join('');

    return `${pageHead(title, language)}
  <header class="flex flex-wrap items-end justify-between gap-4">
    <div>
      <h1 class="text-2xl sm:text-3xl font-semibold tracking-tight">${escapeHtml(title)}</h1>
      <p class="mt-1 text-sm text-zinc-500 dark:text-zinc-400">${escapeHtml(t(language, 'lastCheck'))}: ${escapeHtml(formatDate(now, language))}</p>
    </div>
    <div class="flex items-center gap-2 text-xs">
      ${statChip(healthy, language === 'es' ? 'correctas' : 'healthy', 'green', results.length > 0 && broken === 0)}
      ${statChip(broken, language === 'es' ? 'con error' : 'failing', 'red', broken > 0)}
    </div>
  </header>

  <p class="mt-5 text-xs text-zinc-400 dark:text-zinc-500">
    ${escapeHtml(plural(results.length, t(language, 'source'), t(language, 'sources')))}
    ${withShots ? `&middot; ${escapeHtml(plural(withShots, t(language, 'capture'), t(language, 'captures')))}` : ''}
    ${changed ? `&middot; ${escapeHtml(plural(changed, t(language, 'change'), t(language, 'changes')))}` : ''}
  </p>

  <main class="mt-4">
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      ${cards}
    </div>
  </main>
${pageFooter(repoUrl, language)}`;
}

function statChip(count, label, tone, show) {
    if (!show || count === 0) return '';

    return `
      <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
        <span class="h-1.5 w-1.5 rounded-full ${DOT[tone]}"></span>
        <span class="${TEXT[tone]} font-medium">${count}</span>
        <span class="text-zinc-500 dark:text-zinc-400">${escapeHtml(label)}</span>
      </span>`;
}

/**
 * Shown in place of the thumbnail when there is no capture.
 * A blocked capture is called out explicitly: it is a different situation
 * from "nothing to show yet", and the difference matters.
 */
function placeholder(result, language) {
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

/* ------------------------------------------------------------ source page */

export function generateSourcePage(source, history = [], config = {}) {
    const language = config.language || 'en';
    const now = new Date();
    const repoUrl = config.repo || 'https://github.com/salteadorneo/changes';

    const name = typeof source === 'string' ? source : (source.name || source.id);
    const tone = typeof source === 'string' ? 'muted' : (source.status === 'error' ? 'red' : 'green');
    const entries = resolveShots(typeof source === 'string' ? history : (history || []));

    return `${pageHead(`${name} - ${BRAND}`, language)}
  <a href="../index.html" class="text-xs text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 transition-colors">&larr; ${escapeHtml(t(language, 'back'))}</a>

  <header class="mt-4 flex flex-wrap items-start justify-between gap-3">
    <div class="min-w-0">
      <div class="flex items-center gap-2">
        <span class="h-2 w-2 rounded-full ${DOT[tone]}"></span>
        <h1 class="text-2xl sm:text-3xl font-semibold tracking-tight truncate">${escapeHtml(name)}</h1>
      </div>
      ${source && source.url
            ? `<a href="${escapeHtml(source.url)}" target="_blank" rel="noopener noreferrer"
                 class="mt-1 block text-sm text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 transition-colors truncate">${escapeHtml(source.url)}</a>`
            : ''}
    </div>
    ${source && source.lastCheck
            ? `<div class="text-right">
                 <div class="text-sm ${TEXT[tone]}">${escapeHtml(formatRelative(source.lastCheck, language, now))}</div>
                 <div class="text-[11px] text-zinc-400 dark:text-zinc-500">${escapeHtml(t(language, 'lastCheck'))}</div>
               </div>`
            : ''}
  </header>

  ${versionCompare(source, language)}

  ${detailsPanel(source, language)}

  ${versionStrip(source, language)}

  <section class="mt-10">
    <h2 class="text-sm font-semibold">${escapeHtml(t(language, 'checksLog'))}</h2>
    <p class="mt-1 text-xs text-zinc-400 dark:text-zinc-500">${escapeHtml(t(language, 'checksLogHint'))}</p>
    <div class="mt-4">${buildCheckLog(entries, language, now)}</div>
  </section>
${pageFooter(repoUrl, language)}`;
}

/**
 * The current capture next to the one it replaced, same size, both labelled
 * with the period they cover.
 *
 * There is deliberately no "changed" label here. Two pictures side by side
 * with their time spans already say what happened; naming it would only add a
 * state to maintain.
 */
function versionCompare(source, language) {
    if (typeof source === 'string' || !source.versions || source.versions.length === 0) {
        return '';
    }

    const [current, previous] = source.versions;

    const panel = (version, options) => {
        const url = `../${version.path}`;
        const lines = options.lines
            .map(line => `<div class="text-[11px] ${line.tone}">${line.text}</div>`)
            .join('');

        return `
      <figure class="min-w-0">
        <a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer"
           class="block border border-zinc-200 dark:border-zinc-800 rounded-lg overflow-hidden bg-white dark:bg-zinc-900 hover:border-zinc-300 dark:hover:border-zinc-700 transition-colors">
          <img src="${escapeHtml(url)}" alt="${escapeHtml(source.name)}" loading="lazy"
               class="w-full aspect-[4/3] object-cover object-top bg-zinc-100 dark:bg-zinc-900">
        </a>
        <figcaption class="mt-2">
          <div class="text-xs font-medium text-zinc-800 dark:text-zinc-200">
            ${escapeHtml(formatDateShort(new Date(version.takenAt), language))}
          </div>
          ${lines}
        </figcaption>
      </figure>`;
    };

    return `
  <section class="mt-6">
    <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
      ${panel(current, {
            lines: [
                { text: `${t(language, 'current')} · ${t(language, 'lastCheck')} ${formatRelative(current.lastCheck, language)}`, tone: 'text-emerald-600 dark:text-emerald-400' }
            ]
        })}
      ${previous
            ? panel(previous, {
                    lines: [
                        {
                            text: `${t(language, 'until')} ${formatDateShort(new Date(previous.until), language)}`,
                            tone: 'text-zinc-500'
                        },
                        {
                            text: `${t(language, 'lastedFor')} ${formatSpan(new Date(previous.until) - new Date(previous.takenAt), language)}`,
                            tone: 'text-zinc-400 dark:text-zinc-500'
                        }
                    ]
                })
            : `<div class="flex items-center justify-center rounded-lg border border-dashed border-zinc-200 dark:border-zinc-700 text-xs text-zinc-400 dark:text-zinc-500 p-8 text-center">
                 ${escapeHtml(t(language, 'onlyOneVersion'))}
               </div>`}
    </div>
  </section>`;
}

/**
 * Older captures as a horizontal strip, the closest thing to a slider
 * without adding a dependency.
 */
function versionStrip(source, language) {
    if (typeof source === 'string' || !source.versions || source.versions.length < 3) {
        return '';
    }

    const older = source.versions.slice(2);

    const items = older.map(version => {
        const url = `../${version.path}`;

        return `
      <a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" class="block shrink-0 w-36 group">
        <img src="${escapeHtml(url)}" alt="" loading="lazy"
             class="w-36 h-24 object-cover object-top rounded border border-zinc-200 dark:border-zinc-800 bg-zinc-100 dark:bg-zinc-900 group-hover:border-zinc-300 dark:group-hover:border-zinc-700 transition-colors">
        <span class="mt-1 block text-[11px] text-zinc-500 dark:text-zinc-400 truncate">
          ${escapeHtml(formatDateShort(new Date(version.takenAt), language))}
        </span>
      </a>`;
    }).join('');

    return `
  <section class="mt-6">
    <h2 class="text-xs font-medium text-zinc-500 dark:text-zinc-400">${escapeHtml(t(language, 'olderVersions'))}</h2>
    <div class="mt-2 flex gap-3 overflow-x-auto pb-2 -mx-4 px-4 sm:mx-0 sm:px-0">${items}</div>
  </section>`;
}

function detailsPanel(source, language) {
    if (typeof source === 'string' || !source) return '';

    const meta = source.meta || {};

    const rows = [
        detailRow(t(language, 'type'), sourceTypeLabel(source, language)),
        source.selector ? detailRow(t(language, 'selector'), source.selector) : '',
        source.jsonPath ? detailRow(t(language, 'jsonPath'), source.jsonPath) : '',
        detailRow(t(language, 'lastRun'), meta.fetchedAt ? formatDate(new Date(meta.fetchedAt), language) : null),
        detailRow(t(language, 'httpStatus'), meta.httpStatus ? String(meta.httpStatus) : null),
        detailRow(t(language, 'duration'), meta.durationMs != null ? formatDuration(meta.durationMs) : null),
        detailRow(t(language, 'responseSize'), meta.responseBytes != null ? formatBytes(meta.responseBytes) : null),
        detailRow(t(language, 'extracted'), meta.contentLines != null
            ? `${meta.contentLines} ${meta.contentLines === 1 ? t(language, 'line') : t(language, 'lines')} · ${formatBytes(meta.contentChars)}`
            : null),
        detailRow(t(language, 'capture'), captureStatusLabel(source, language))
    ].join('');

    return `
  <section class="mt-6 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg px-4 py-2">
    <dl class="text-sm">${rows}</dl>
  </section>`;
}

function captureStatusLabel(source, language) {
    switch (source.captureStatus) {
        case 'blocked':
            return t(language, 'captureBlocked');
        case 'failed':
            return t(language, 'captureFailed');
        case 'ok':
            return t(language, 'captured');
        case 'skipped':
            return '-';
        default:
            return t(language, 'pending');
    }
}

/**
 * One row per check: when it happened, how it went, and the picture that
 * belonged to it. Checks that found no change reuse the latest capture, so
 * the log stays readable instead of repeating the same image N times.
 */
function buildCheckLog(entries, language, now) {
    if (!entries || entries.length === 0) {
        return `<div class="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg p-8 text-center">
      <div class="text-sm text-zinc-500 dark:text-zinc-400">${escapeHtml(t(language, 'noChecksYet'))}</div>
    </div>`;
    }

    const shown = entries.slice(0, 40);

    const rows = shown.map(entry => {
        const tone = entry.status === 'error' ? 'red' : entry.status === 'changed' ? 'amber' : 'green';
        const label = entry.status === 'error'
            ? t(language, 'failed')
            : entry.status === 'changed'
                ? t(language, 'changedNow')
                : t(language, 'ok');

        const shot = entry.shown
            ? `<a href="../${escapeHtml(entry.shown)}" target="_blank" rel="noopener noreferrer" class="block shrink-0">
                 <img src="../${escapeHtml(entry.shown)}" alt="" loading="lazy"
                      class="h-12 w-20 rounded border border-zinc-200 dark:border-zinc-800 object-cover object-top bg-zinc-100 dark:bg-zinc-900">
               </a>`
            : `<div class="h-12 w-20 shrink-0 rounded border border-dashed border-zinc-200 dark:border-zinc-800 flex items-center justify-center text-[10px] text-zinc-400 dark:text-zinc-600">
                 ${escapeHtml(t(language, 'noCapture'))}
               </div>`;

        return `
      <li class="flex items-center gap-3 py-2.5 border-b border-zinc-100 dark:border-zinc-800/60 last:border-0">
        ${shot}
        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-1.5">
            <span class="h-1.5 w-1.5 rounded-full ${DOT[tone]} shrink-0"></span>
            <span class="text-xs font-medium ${TEXT[tone]}">${escapeHtml(label)}</span>
          </div>
          <p class="mt-0.5 text-[11px] text-zinc-400 dark:text-zinc-500" title="${escapeHtml(formatDate(entry.timestamp, language))}">
            ${escapeHtml(formatRelative(entry.timestamp, language, now))}
          </p>
        </div>
      </li>`;
    }).join('');

    return `
    <ul class="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg px-4">${rows}</ul>
    ${entries.length > shown.length
            ? `<p class="mt-2 text-[11px] text-zinc-400 dark:text-zinc-500">… ${entries.length - shown.length} ${escapeHtml(t(language, 'checks').toLowerCase())}</p>`
            : ''}`;
}