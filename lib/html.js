import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { formatDate } from './utils.js';
import { computeWordDiff } from './diff.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const { version } = JSON.parse(
  fs.readFileSync(path.join(__dirname, '../package.json'), 'utf-8')
);

function loadLanguage(language = 'en') {
  const langFile = path.join(__dirname, `../lang/${language}.json`);
  try {
    if (fs.existsSync(langFile)) {
      return JSON.parse(fs.readFileSync(langFile, 'utf-8'));
    }
  } catch (error) {
    console.error(`Error loading language ${language}:`, error);
  }
  const enFile = path.join(__dirname, `../lang/en.json`);
  if (fs.existsSync(enFile)) {
    return JSON.parse(fs.readFileSync(enFile, 'utf-8'));
  }
  return {};
}

function htmlHead(title, lang) {
  return `<!DOCTYPE html>
<html lang="${lang}" class="antialiased">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <script>tailwind.config = { darkMode: 'media' }</script>
</head>`;
}

/**
 * Generate HTML dashboard
 * @param {string} title - Page title
 * @param {Array} results - Check results
 * @param {Object} config - Configuration
 * @returns {string}
 */
export function generateHTML(title, results, config = {}) {
  const lang = loadLanguage(config.language || 'en');
  const now = new Date();

  const cardsHTML = results.map(result => {
    const hasChanges = result.changesHistory && result.changesHistory.length > 0;
    const statusClass = hasChanges
      ? 'text-amber-600 dark:text-amber-400'
      : 'text-emerald-600 dark:text-emerald-400';
    const statusText = hasChanges
      ? `${result.changesHistory.length} cambios registrados`
      : 'Sin cambios detectados';

    return `
    <a href="./source/${result.id}.html" class="block group">
      <div class="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-5 transition-all group-hover:border-slate-300 dark:group-hover:border-slate-600 group-hover:shadow-sm">
        <h3 class="text-sm font-medium text-slate-900 dark:text-slate-100">${escapeHtml(result.name)}</h3>
        <div class="mt-2 text-xs ${statusClass}">${statusText}</div>
      </div>
    </a>`;
  }).join('');

  return `${htmlHead(title, config.language || 'en')}
<body class="bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100 min-h-screen">
  <div class="max-w-4xl mx-auto px-6 py-10">
    <header class="mb-8">
      <h1 class="text-xl font-semibold tracking-tight">${escapeHtml(title)}</h1>
    </header>

    <main>
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        ${cardsHTML}
      </div>
    </main>

    <footer class="mt-10 pt-6 border-t border-slate-200 dark:border-slate-800 text-center text-xs text-slate-400 dark:text-slate-500 space-y-1">
      <div>${lang.lastUpdated || 'Last updated'}: ${formatDate(now, config.language || 'en')}</div>
      <div>Change Monitor v${version}</div>
    </footer>
  </div>
</body>
</html>`;
}

/**
 * Generate source detail page with timeline
 * @param {string} sourceName - Source name
 * @param {string} sourceId - Source identifier
 * @param {Array} changesHistory - Array of changes
 * @param {Object} config - Configuration
 * @returns {string}
 */
export function generateSourcePage(sourceName, sourceId, changesHistory = [], config = {}) {
  const lang = loadLanguage(config.language || 'en');
  const now = new Date();

  const timelineHTML = changesHistory.length > 0
    ? buildTimeline(changesHistory, config)
    : `<div class="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-10 text-center">
        <div class="text-2xl text-emerald-500 mb-2">✓</div>
        <div class="text-sm font-medium text-slate-700 dark:text-slate-300">Sin cambios detectados</div>
        <div class="text-xs text-slate-400 dark:text-slate-500 mt-1">Aún no se han registrado cambios en esta fuente</div>
      </div>`;

  return `${htmlHead(`${sourceName} - Change Monitor`, config.language || 'en')}
<body class="bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100 min-h-screen">
  <div class="max-w-3xl mx-auto px-6 py-10">
    <header class="flex items-start justify-between mb-8">
      <div>
        <h1 class="text-xl font-semibold tracking-tight">${escapeHtml(sourceName)}</h1>
        <p class="text-sm text-slate-500 dark:text-slate-400 mt-0.5">Change history timeline</p>
      </div>
      <a href="../index.html" class="text-sm text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors">← Volver</a>
    </header>

    <main>
      ${timelineHTML}
    </main>

    <footer class="mt-10 pt-6 border-t border-slate-200 dark:border-slate-800 text-center text-xs text-slate-400 dark:text-slate-500 space-y-1">
      <div>${lang.lastUpdated || 'Last updated'}: ${formatDate(now, config.language || 'en')}</div>
      <div>Change Monitor v${version}</div>
    </footer>
  </div>
</body>
</html>`;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderWordDiffLine(line, wordTokens, show) {
  const html = wordTokens.map(t => {
    if (t.type === show) {
      const cls = show === 'remove'
        ? 'bg-red-200 dark:bg-red-900/60 rounded-sm line-through decoration-red-400 dark:decoration-red-600'
        : 'bg-emerald-200 dark:bg-emerald-900/60 rounded-sm';
      return `<mark class="${cls}">${escapeHtml(t.text)}</mark>`;
    }
    if (t.type === 'same') return escapeHtml(t.text);
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

function renderDiff(diff) {
  if (!diff || diff.length === 0) {
    return `<div class="text-xs text-slate-400 dark:text-slate-500 px-3 py-2">Sin datos de diff disponibles</div>`;
  }

  const entries = pairChanges(diff);

  const lines = entries.map(entry => {
    if (entry.type === 'truncated') {
      return `<div class="px-3 py-1.5 text-xs text-slate-400 dark:text-slate-500 italic text-center bg-slate-50 dark:bg-slate-900">
        Contenido demasiado largo para mostrar diff (${entry.oldCount} → ${entry.newCount} líneas)
      </div>`;
    }
    if (entry.type === 'skip') {
      return `<div class="px-3 py-0.5 text-xs text-slate-400 dark:text-slate-500 text-center select-none bg-slate-50 dark:bg-slate-900 border-y border-slate-100 dark:border-slate-800">
        ⋯ ${entry.count} ${entry.count === 1 ? 'línea sin cambios' : 'líneas sin cambios'}
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
      <span class="select-none text-slate-300 dark:text-slate-600 w-3 shrink-0"> </span>
      <span class="text-slate-500 dark:text-slate-400 break-all">${escapeHtml(entry.line)}</span>
    </div>`;
  }).join('');

  return `<div class="font-mono text-xs rounded border border-slate-200 dark:border-slate-700 overflow-hidden divide-y divide-slate-100 dark:divide-slate-800">${lines}</div>`;
}

function renderPanel(label, src, missingText) {
  if (!src) {
    return `<div class="flex items-center justify-center rounded border border-dashed border-slate-200 dark:border-slate-700 p-6 text-center text-xs text-slate-400 dark:text-slate-500">${missingText}</div>`;
  }
  const url = `../${src}`;
  return `
    <figure>
      <figcaption class="mb-1.5 text-[11px] uppercase tracking-wide text-slate-400 dark:text-slate-500">${label}</figcaption>
      <a href="${escapeHtml(url)}" target="_blank" rel="noopener">
        <img src="${escapeHtml(url)}" alt="${label}" loading="lazy"
             class="w-full rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900">
      </a>
    </figure>`;
}

/**
 * Before/after screenshot pair for a change.
 * Paths are stored repo-relative (screenshots/<id>/<file>) and this page
 * lives in source/, hence the ../ prefix.
 */
function renderComparison(change) {
  const before = change.previousScreenshot;
  const after = change.screenshot;

  if (!before && !after) return '';

  return `
    <div class="mb-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
      ${renderPanel('Antes', before, 'Sin captura anterior')}
      ${renderPanel('Despu&eacute;s', after, 'Captura no disponible')}
    </div>`;
}

function buildTimeline(changesHistory, config) {
  const items = changesHistory.map((change, idx) => {
    const timestamp = formatDate(new Date(change.timestamp), config.language || 'en');
    const changeNumber = changesHistory.length - idx;

    const hashBlock = change.hash ? `
      <div class="mb-3 text-xs font-mono flex flex-wrap gap-3">
        <div>
          <span class="text-slate-400 dark:text-slate-500">antes </span>
          <code class="text-red-500 dark:text-red-400 bg-slate-50 dark:bg-slate-900 px-1.5 py-0.5 rounded">${change.previousHash ? escapeHtml(change.previousHash.substring(0, 12)) : '—'}</code>
        </div>
        <div class="text-slate-300 dark:text-slate-600">→</div>
        <div>
          <span class="text-slate-400 dark:text-slate-500">ahora </span>
          <code class="text-emerald-600 dark:text-emerald-400 bg-slate-50 dark:bg-slate-900 px-1.5 py-0.5 rounded">${escapeHtml(change.hash.substring(0, 12))}</code>
        </div>
      </div>` : '';

    return `
    <div class="relative mb-5 pl-5">
      <div class="absolute left-0 top-2 w-2 h-2 rounded-full bg-slate-300 dark:bg-slate-600 ring-2 ring-slate-50 dark:ring-slate-900"></div>
      <div class="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-4">
        <div class="flex items-center justify-between mb-3">
          <span class="text-sm font-medium text-slate-700 dark:text-slate-300">Cambio #${changeNumber}</span>
          <span class="text-xs text-slate-400 dark:text-slate-500 bg-slate-100 dark:bg-slate-700 px-2 py-0.5 rounded">${timestamp}</span>
        </div>
        ${hashBlock}
        ${renderComparison(change)}
        ${renderDiff(change.diff)}
      </div>
    </div>`;
  }).join('');

  return `<div class="relative pl-2 border-l border-slate-200 dark:border-slate-700">${items}</div>`;
}
