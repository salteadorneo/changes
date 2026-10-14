import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
    formatBytes,
    formatDate,
    formatDuration,
    formatRelative
} from './utils.js';
import { computeWordDiff } from './diff.js';

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
  <footer class="mt-12 border-t border-zinc-200 dark:border-zinc-800 pt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-500 dark:text-zinc-500">
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

function plural(count, singular, pluralForm) {
    return `${count} ${count === 1 ? singular : pluralForm}`;
}

function statusDot(status) {
    const tone = status === 'error'
        ? 'bg-red-500'
        : status === 'changed'
            ? 'bg-amber-500'
            : 'bg-emerald-500';

    return `<span class="inline-block h-1.5 w-1.5 rounded-full ${tone}"></span>`;
}

function statusLabel(result, language) {
    if (result.status === 'error') return { tone: 'text-red-600 dark:text-red-400', text: result.error || t(language, 'error') };
    if (result.status === 'changed') {
        return { tone: 'text-amber-600 dark:text-amber-400', text: t(language, 'changes') };
    }
    if (!result.lastCheck) {
        return { tone: 'text-zinc-500', text: t(language, 'neverChecked') };
    }
    return { tone: 'text-emerald-600 dark:text-emerald-400', text: t(language, 'noChanges') };
}

function sourceMetaLine(result, language, now) {
    const parts = [];

    if (result.lastCheck) {
        parts.push(escapeHtml(formatRelative(result.lastCheck, language, now)));
    }
    if (result.checks) parts.push(escapeHtml(plural(result.checks, t(language, 'check'), t(language, 'checks'))));
    if (result.changesCount) parts.push(escapeHtml(plural(result.changesCount, t(language, 'change'), t(language, 'changes'))));

    return parts.join(' &middot; ');
}

function thumbnail(result, language, cls = '') {
    if (result.thumbnail) {
        return `<a href="./source/${escapeHtml(result.id)}.html" class="block ${cls}">
          <img src="${escapeHtml(result.thumbnail)}" alt="${escapeHtml(result.name)}" loading="lazy"
               class="w-full h-32 object-cover object-top bg-zinc-100 dark:bg-zinc-900">
        </a>`;
    }
    return `<div class="w-full h-32 flex items-center justify-center bg-zinc-100 dark:bg-zinc-900 text-xs text-zinc-400 dark:text-zinc-600">${escapeHtml(t(language, 'noCapture'))}</div>`;
}

/**
 * Generate the dashboard
 * @param {string} title
 * @param {Array} results
 * @param {Object} config
 * @returns {string}
 */
export function generateHTML(title, results, config = {}) {
    const language = config.language || 'en';
    const now = new Date();
    const repoUrl = config.repo || 'https://github.com/salteadorneo/changes';

    const cards = results.map(result => {
        const status = statusLabel(result, language);
        const meta = sourceMetaLine(result, language, now);

        return `
      <a href="./source/${escapeHtml(result.id)}.html" class="group block bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg overflow-hidden transition-colors hover:border-zinc-300 dark:hover:border-zinc-700">
        <div class="overflow-hidden border-b border-zinc-200 dark:border-zinc-800">
          ${result.thumbnail
                ? `<img src="${escapeHtml(result.thumbnail)}" alt="${escapeHtml(result.name)}" loading="lazy"
                     class="w-full h-36 object-cover object-top bg-zinc-100 dark:bg-zinc-900">`
                : capturePlaceholder(result, language)}
        </div>
        <div class="p-4">
          <div class="flex items-start justify-between gap-2">
            <h2 class="text-sm font-semibold truncate">${escapeHtml(result.name)}</h2>
            <span class="shrink-0 mt-1">${statusDot(result.status)}</span>
          </div>
          <p class="mt-1 text-xs text-zinc-500 dark:text-zinc-400 truncate">${escapeHtml(hostOf(result.url))}</p>
          <p class="mt-2 text-xs ${status.tone} truncate">${escapeHtml(status.text)}</p>
          ${meta ? `<p class="mt-1 text-xs text-zinc-400 dark:text-zinc-500">${meta}</p>` : ''}
        </div>
      </a>`;
    }).join('');

    const totals = summarise(results, language);

    return `${pageHead(title, language)}
  <header class="flex flex-wrap items-center justify-between gap-3">
    <div>
      <h1 class="text-xl sm:text-2xl font-semibold tracking-tight">${escapeHtml(title)}</h1>
      <p class="mt-1 text-sm text-zinc-500 dark:text-zinc-400">${escapeHtml(t(language, 'lastCheck'))}: ${escapeHtml(formatDate(now, language))}</p>
    </div>
    <a href="${escapeHtml(repoUrl)}" target="_blank" rel="noopener noreferrer"
       class="text-xs text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 transition-colors">${escapeHtml(t(language, 'github'))}</a>
  </header>

  <p class="mt-6 text-xs text-zinc-400 dark:text-zinc-500">${totals}</p>

  <main class="mt-4">
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      ${cards}
    </div>
  </main>
${pageFooter(repoUrl, language)}`;
}

/**
 * Shown in place of the thumbnail when there is no capture.
 * A blocked capture is called out explicitly: it is a different situation
 * from "nothing to show yet", and the difference matters.
 */
function capturePlaceholder(result, language) {
    const base = 'w-full h-36 flex flex-col items-center justify-center gap-1 bg-zinc-100 dark:bg-zinc-900 text-xs';

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

function hostOf(url) {
    if (!url) return '';
    try {
        return new URL(url).host;
    } catch {
        return String(url);
    }
}

function summarise(results, language) {
    const total = results.length;
    const changed = results.filter(r => r.status === 'changed').length;
    const errors = results.filter(r => r.status === 'error').length;
    const captures = results.filter(r => r.thumbnail).length;

    const bits = [escapeHtml(plural(total, t(language, 'source'), t(language, 'sources')))];
    if (changed) bits.push(escapeHtml(plural(changed, t(language, 'change'), t(language, 'changes'))));
    if (errors) bits.push(escapeHtml(plural(errors, t(language, 'error'), t(language, 'errorSources'))));
    if (captures) bits.push(escapeHtml(plural(captures, t(language, 'capture'), t(language, 'captures'))));

    return bits.join(' &middot; ');
}

/**
 * Generate the per-source detail page
 * @param {Object} source - the result object for this source
 * @param {Array} changesHistory
 * @param {Object} config
 * @returns {string}
 */
export function generateSourcePage(source, changesHistory = [], config = {}) {
    const language = config.language || 'en';
    const now = new Date();
    const repoUrl = config.repo || 'https://github.com/salteadorneo/changes';

    const name = typeof source === 'string' ? source : (source.name || source.id);
    const id = typeof source === 'string' ? '' : source.id;
    const meta = typeof source === 'string' ? {} : (source.meta || {});

    const status = typeof source === 'string'
        ? { tone: '', text: '' }
        : statusLabel(source, language);

    return `${pageHead(`${name} - ${BRAND}`, language)}
  <a href="../index.html" class="text-xs text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 transition-colors">&larr; ${escapeHtml(t(language, 'back'))}</a>

  <header class="mt-4 flex flex-wrap items-start justify-between gap-3">
    <div class="min-w-0">
      <div class="flex items-center gap-2">
        <span>${statusDot(typeof source === 'string' ? 'unchanged' : source.status)}</span>
        <h1 class="text-xl sm:text-2xl font-semibold tracking-tight truncate">${escapeHtml(name)}</h1>
      </div>
      ${source && source.url
            ? `<a href="${escapeHtml(source.url)}" target="_blank" rel="noopener noreferrer"
                 class="mt-1 block text-sm text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 transition-colors truncate">${escapeHtml(source.url)}</a>`
            : ''}
    </div>
    ${status.text ? `<span class="text-xs ${status.tone} whitespace-nowrap pt-1">${escapeHtml(status.text)}</span>` : ''}
  </header>

  ${detailsPanel(source, meta, language, now)}

  ${typeof source === 'string' ? '' : capturePanel(source, language)}

  <h2 class="mt-10 text-sm font-semibold">${escapeHtml(t(language, 'timeline'))}</h2>
  <main class="mt-3">
    ${buildTimeline(changesHistory, language)}
  </main>
${pageFooter(repoUrl, language)}`;
}

function sourceTypeLabel(source, language) {
    const suffix = String(source.type || 'content').replace(/^./, c => c.toUpperCase());
    return t(language, `type${suffix}`);
}

function detailRow(label, value) {
    if (value === undefined || value === null || value === '') return '';
    return `
      <div class="flex items-baseline justify-between gap-3 py-1.5 border-b border-zinc-100 dark:border-zinc-800/60 last:border-0">
        <dt class="text-xs text-zinc-500 dark:text-zinc-400 shrink-0">${escapeHtml(label)}</dt>
        <dd class="text-xs font-mono text-zinc-800 dark:text-zinc-200 truncate text-right" title="${escapeHtml(value)}">${escapeHtml(value)}</dd>
      </div>`;
}

function captureStatusLabel(source, language) {
    switch (source.captureStatus) {
        case 'blocked':
            return t(language, 'captureBlocked');
        case 'failed':
            return t(language, 'captureFailed');
        case 'ok':
            return t(language, 'captured');
        default:
            return t(language, 'pending');
    }
}

function detailsPanel(source, meta, language, now) {
    if (typeof source === 'string' || !source) return '';

    const typeLabel = sourceTypeLabel(source, language);

    const rows = [
        detailRow(t(language, 'type'), typeLabel),
        source.selector ? detailRow(t(language, 'selector'), source.selector) : '',
        source.jsonPath ? detailRow(t(language, 'jsonPath'), source.jsonPath) : '',
        source.timeout ? detailRow(t(language, 'timeout'), `${source.timeout} ms`) : '',
        detailRow(t(language, 'lastRun'), meta.fetchedAt
            ? formatDate(new Date(meta.fetchedAt), language)
            : null),
        detailRow(t(language, 'httpStatus'), meta.httpStatus ? String(meta.httpStatus) : null),
        detailRow(t(language, 'duration'), meta.durationMs != null ? formatDuration(meta.durationMs) : null),
        detailRow(t(language, 'responseSize'), meta.responseBytes != null ? formatBytes(meta.responseBytes) : null),
        detailRow(t(language, 'extracted'), meta.contentLines != null
            ? `${meta.contentLines} ${meta.contentLines === 1 ? t(language, 'line') : t(language, 'lines')} · ${formatBytes(meta.contentChars)}`
            : null),
        detailRow(t(language, 'hash'), source.currentHash ? source.currentHash.slice(0, 16) : null),
        detailRow(t(language, 'previousHash'), source.previousHash ? source.previousHash.slice(0, 16) : null),
        detailRow(t(language, 'capture'), captureStatusLabel(source, language)),
        detailRow(t(language, 'changesFound'), String((source.changesHistory || []).length))
    ].join('');

    return `
  <section class="mt-6 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg px-4 py-2">
    <dl class="text-sm">${rows}</dl>
  </section>

  ${contentPanel(source, language)}`;
}

function contentPanel(source, language) {
    if (!source.content) return '';

    const body = escapeHtml(source.content);
    const preview = source.content.split('\n').slice(0, 400).join('\n');
    const truncated = source.content.split('\n').length > 400;

    return `
  <details class="group mt-4 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg">
    <summary class="cursor-pointer select-none px-4 py-3 text-xs font-medium text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 transition-colors flex items-center justify-between">
      <span>${escapeHtml(t(language, 'extractedContent'))}</span>
      <span class="text-zinc-400 dark:text-zinc-600 group-open:hidden">${escapeHtml(t(language, 'show'))}</span>
      <span class="hidden group-open:inline text-zinc-400 dark:text-zinc-600">${escapeHtml(t(language, 'hide'))}</span>
    </summary>
    <pre class="px-4 pb-4 max-h-96 overflow-auto text-xs leading-relaxed font-mono text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap break-words">${escapeHtml(truncated ? `${preview}\n…` : body)}</pre>
  </details>`;
}

function capturePanel(source, language) {
    if (!source.thumbnail) return '';

    return `
  <section class="mt-4">
    <h2 class="text-xs font-medium text-zinc-500 dark:text-zinc-400">${escapeHtml(t(language, 'latestCapture'))}</h2>
    <a href="../${escapeHtml(source.thumbnail)}" target="_blank" rel="noopener noreferrer" class="mt-2 block border border-zinc-200 dark:border-zinc-800 rounded-lg overflow-hidden bg-white dark:bg-zinc-900">
      <img src="../${escapeHtml(source.thumbnail)}" alt="${escapeHtml(source.name)}" loading="lazy"
           class="w-full bg-zinc-100 dark:bg-zinc-900">
    </a>
  </section>`;
}

function renderPanel(label, src, missingText) {
    if (!src) {
        return `<div class="flex items-center justify-center rounded border border-dashed border-zinc-200 dark:border-zinc-800 p-6 text-center text-xs text-zinc-400 dark:text-zinc-500">${escapeHtml(missingText)}</div>`;
    }
    const url = `../${src}`;
    return `
    <figure>
      <figcaption class="mb-1.5 text-[11px] uppercase tracking-wide text-zinc-400 dark:text-zinc-500">${escapeHtml(label)}</figcaption>
      <a href="${escapeHtml(url)}" target="_blank" rel="noopener">
        <img src="${escapeHtml(url)}" alt="${escapeHtml(label)}" loading="lazy"
             class="w-full rounded border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950">
      </a>
    </figure>`;
}

function renderComparison(change, language) {
    const before = change.previousScreenshot;
    const after = change.screenshot;

    if (!before && !after) return '';

    return `
    <div class="mb-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
      ${renderPanel(t(language, 'before'), before, t(language, 'noPreviousCapture'))}
      ${renderPanel(t(language, 'after'), after, t(language, 'noCaptureAvailable'))}
    </div>`;
}

function renderDiff(diff, language) {
    if (!diff || diff.length === 0) {
        return `<div class="text-xs text-zinc-400 dark:text-zinc-500 px-3 py-2">${escapeHtml(t(language, 'noDiffData'))}</div>`;
    }

    const entries = pairChanges(diff);

    const lines = entries.map(entry => {
        if (entry.type === 'truncated') {
            return `<div class="px-3 py-1.5 text-xs text-zinc-400 dark:text-zinc-500 italic text-center bg-zinc-50 dark:bg-zinc-950">
        ${escapeHtml(t(language, 'diffTooLong'))} (${entry.oldCount} &rarr; ${entry.newCount})
      </div>`;
        }
        if (entry.type === 'skip') {
            const label = entry.count === 1
                ? t(language, 'unchangedLine')
                : t(language, 'unchangedLines');
            return `<div class="px-3 py-0.5 text-xs text-zinc-400 dark:text-zinc-500 text-center select-none bg-zinc-50 dark:bg-zinc-950 border-y border-zinc-100 dark:border-zinc-800">
        &hellip; ${entry.count} ${escapeHtml(label)}
      </div>`;
        }
        if (entry.type === 'change') {
            const tokens = computeWordDiff(entry.oldLine, entry.newLine);
            return renderWordDiffLine(entry.oldLine, tokens, 'remove')
                + renderWordDiffLine(entry.newLine, tokens, 'add');
        }
        if (entry.type === 'add') {
            return `<div class="flex gap-2 px-3 py-0.5 bg-emerald-50 dark:bg-emerald-950/40 border-l-2 border-emerald-400 dark:border-emerald-600">
        <span class="select-none text-emerald-400 dark:text-emerald-600 w-3 shrink-0">+</span>
        <span class="text-emerald-800 dark:text-emerald-200 break-all">${escapeHtml(entry.line)}</span>
      </div>`;
        }
        if (entry.type === 'remove') {
            return `<div class="flex gap-2 px-3 py-0.5 bg-red-50 dark:bg-red-950/40 border-l-2 border-red-400 dark:border-red-600">
        <span class="select-none text-red-400 dark:text-red-600 w-3 shrink-0">-</span>
        <span class="text-red-800 dark:text-red-200 break-all">${escapeHtml(entry.line)}</span>
      </div>`;
        }
        return `<div class="flex gap-2 px-3 py-0.5">
      <span class="select-none text-zinc-300 dark:text-zinc-600 w-3 shrink-0"> </span>
      <span class="text-zinc-500 dark:text-zinc-400 break-all">${escapeHtml(entry.line)}</span>
    </div>`;
    }).join('');

    return `<div class="font-mono text-xs rounded border border-zinc-200 dark:border-zinc-800 overflow-hidden divide-y divide-zinc-100 dark:divide-zinc-800">${lines}</div>`;
}

function renderWordDiffLine(line, wordTokens, show) {
    const html = wordTokens.map(token => {
        if (token.type === show) {
            const cls = show === 'remove'
                ? 'bg-red-200 dark:bg-red-900/60 rounded-sm line-through decoration-red-400 dark:decoration-red-600'
                : 'bg-emerald-200 dark:bg-emerald-900/60 rounded-sm';
            return `<mark class="${cls}">${escapeHtml(token.text)}</mark>`;
        }
        if (token.type === 'same') return escapeHtml(token.text);
        return '';
    }).join('');

    if (show === 'remove') {
        return `<div class="flex gap-2 px-3 py-0.5 bg-red-50 dark:bg-red-950/40 border-l-2 border-red-400 dark:border-red-600">
      <span class="select-none text-red-400 dark:text-red-600 w-3 shrink-0">-</span>
      <span class="text-red-800 dark:text-red-200 break-all">${html}</span>
    </div>`;
    }
    return `<div class="flex gap-2 px-3 py-0.5 bg-emerald-50 dark:bg-emerald-950/40 border-l-2 border-emerald-400 dark:border-emerald-600">
    <span class="select-none text-emerald-400 dark:text-emerald-600 w-3 shrink-0">+</span>
    <span class="text-emerald-800 dark:text-emerald-200 break-all">${html}</span>
  </div>`;
}

function pairChanges(diff) {
    const result = [];
    let i = 0;
    while (i < diff.length) {
        if (diff[i].type === 'remove') {
            const removes = [], adds = [];
            while (i < diff.length && diff[i].type === 'remove') removes.push(diff[i++]);
            while (i < diff.length && diff[i].type === 'add') adds.push(diff[i++]);
            const paired = Math.min(removes.length, adds.length);
            for (let j = 0; j < paired; j++) {
                result.push({ type: 'change', oldLine: removes[j].line, newLine: adds[j].line });
            }
            for (let j = paired; j < removes.length; j++) result.push(removes[j]);
            for (let j = paired; j < adds.length; j++) result.push(adds[j]);
        } else {
            result.push(diff[i++]);
        }
    }
    return result;
}

function buildTimeline(changesHistory, language) {
    if (!changesHistory || changesHistory.length === 0) {
        return `<div class="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg p-10 text-center">
        <div class="text-2xl text-emerald-500 mb-2">&#10003;</div>
        <div class="text-sm font-medium">${escapeHtml(t(language, 'noChanges'))}</div>
        <div class="text-xs text-zinc-400 dark:text-zinc-500 mt-1">${escapeHtml(t(language, 'noChangesYet'))}</div>
      </div>`;
    }

    const items = changesHistory.map((change, idx) => {
        const timestamp = formatDate(change.timestamp, language);
        const relative = formatRelative(change.timestamp, language);
        const changeNumber = changesHistory.length - idx;

        const hashBlock = change.hash ? `
      <div class="mb-3 text-xs font-mono flex flex-wrap gap-3">
        <div>
          <span class="text-zinc-400 dark:text-zinc-500">${escapeHtml(t(language, 'previousHash'))} </span>
          <code class="text-red-500 dark:text-red-400 bg-zinc-50 dark:bg-zinc-950 px-1.5 py-0.5 rounded">${change.previousHash ? escapeHtml(change.previousHash.substring(0, 12)) : '&mdash;'}</code>
        </div>
        <div class="text-zinc-300 dark:text-zinc-600">&rarr;</div>
        <div>
          <span class="text-zinc-400 dark:text-zinc-500">${escapeHtml(t(language, 'hash'))} </span>
          <code class="text-emerald-600 dark:text-emerald-400 bg-zinc-50 dark:bg-zinc-950 px-1.5 py-0.5 rounded">${escapeHtml(change.hash.substring(0, 12))}</code>
        </div>
      </div>` : '';

        return `
    <div class="relative mb-4 pl-5">
      <div class="absolute left-0 top-4 w-2 h-2 rounded-full bg-zinc-300 dark:bg-zinc-700 ring-2 ring-zinc-50 dark:ring-zinc-950"></div>
      <div class="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg p-4">
        <div class="flex items-center justify-between gap-2 mb-3">
          <span class="text-sm font-medium">${escapeHtml(t(language, 'change'))} #${changeNumber}</span>
          <span class="text-xs text-zinc-400 dark:text-zinc-500 bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 rounded" title="${escapeHtml(timestamp)}">${escapeHtml(relative)}</span>
        </div>
        ${hashBlock}
        ${renderComparison(change, language)}
        ${renderDiff(change.diff, language)}
      </div>
    </div>`;
    }).join('');

    return `<div class="relative pl-2 border-l border-zinc-200 dark:border-zinc-800">${items}</div>`;
}