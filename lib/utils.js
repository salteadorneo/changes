const LOCALES = {
    es: 'es-ES',
    en: 'en-US'
};

function localeFor(language) {
    return LOCALES[language] || 'en-US';
}

/**
 * Format a date according to locale
 * @param {Date} date
 * @param {string} language - Language code (e.g. 'en', 'es')
 * @returns {string}
 */
export function formatDate(date, language = 'en') {
    return date.toLocaleString(localeFor(language), {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });
}

/**
 * Get current month string in YYYY-MM format
 * @returns {string}
 */
export function getCurrentMonth() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
}

/**
 * Parse JSON safely
 * @param {string} json
 * @param {any} defaultValue
 * @returns {any}
 */
export function parseJSON(json, defaultValue = null) {
    try {
        return JSON.parse(json);
    } catch (error) {
        return defaultValue;
    }
}

/**
 * Compact date + time, no seconds. Used on the capture panels, where the
 * full timestamp is noise.
 * @param {Date} date
 * @param {string} language
 * @returns {string}
 */
export function formatDateShort(date, language = 'en') {
    return date.toLocaleString(localeFor(language), { dateStyle: 'short', timeStyle: 'short' });
}

/**
 * How long something lasted, in words rather than units.
 * "23 h", "1 dia 4 h", "3 min"
 *
 * @param {number} ms
 * @param {string} language
 * @returns {string}
 */
export function formatSpan(ms, language = 'en') {
    if (typeof ms !== 'number' || !isFinite(ms) || ms < 0) return '-';

    if (ms < 60000) return language === 'es' ? 'menos de 1 min' : 'under 1 min';

    const minutes = Math.round(ms / 60000);

    const hours = Math.floor(minutes / 60);
    const restMinutes = minutes % 60;
    const days = Math.floor(hours / 24);
    const restHours = hours % 24;

    const h = n => (language === 'es' ? `${n} h` : `${n} h`);
    const d = n => (language === 'es' ? `${n} ${n === 1 ? 'dia' : 'dias'}` : `${n} ${n === 1 ? 'day' : 'days'}`);
    const m = n => (language === 'es' ? `${n} min` : `${n} min`);

    if (days > 0) {
        return restHours > 0 ? `${d(days)} ${h(restHours)}` : d(days);
    }
    if (hours > 0) {
        return restMinutes > 0 ? `${h(hours)} ${m(restMinutes)}` : h(hours);
    }
    return m(minutes);
}

/**
 * Turn a source name into a stable, URL-safe id
 * @param {string} name
 * @returns {string}
 */
export function generateId(name) {
    return String(name)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

const RELATIVE_UNITS = {
    es: [
        [60, 'segundo', 'segundos'],
        [3600, 'minuto', 'minutos'],
        [86400, 'hora', 'horas'],
        [2592000, 'día', 'días'],
        [31536000, 'mes', 'meses']
    ],
    en: [
        [60, 'second', 'seconds'],
        [3600, 'minute', 'minutes'],
        [86400, 'hour', 'hours'],
        [2592000, 'day', 'days'],
        [31536000, 'month', 'months']
    ]
};

/**
 * Human "hace 3 minutos" style label.
 * @param {string|Date} date
 * @param {string} language
 * @param {Date} [now]
 * @returns {string}
 */
export function formatRelative(date, language = 'en', now = new Date()) {
    const when = date instanceof Date ? date : new Date(date);
    if (isNaN(when.getTime())) return '-';

    const seconds = Math.round((now.getTime() - when.getTime()) / 1000);
    if (seconds < 45) return language === 'es' ? 'ahora mismo' : 'just now';

    const units = RELATIVE_UNITS[language] || RELATIVE_UNITS.en;
    const index = units.findIndex(([limit]) => seconds < limit);
    const chosen = index === -1 ? units.length - 1 : index;

    const [, singular, plural] = units[chosen];
    const divisor = chosen === 0 ? 1 : units[chosen - 1][0];
    const amount = Math.max(1, Math.round(seconds / divisor));
    const label = amount === 1 ? singular : plural;

    return language === 'es'
        ? `hace ${amount} ${label}`
        : `${amount} ${label} ago`;
}

/**
 * Format a byte count in a compact, readable way
 * @param {number} bytes
 * @returns {string}
 */
export function formatBytes(bytes) {
    if (typeof bytes !== 'number' || !isFinite(bytes) || bytes < 0) return '-';
    if (bytes < 1024) return `${bytes} B`;

    const units = ['kB', 'MB', 'GB'];
    let value = bytes / 1024;
    let i = 0;

    while (value >= 1024 && i < units.length - 1) {
        value /= 1024;
        i++;
    }

    return `${value.toFixed(value < 10 ? 1 : 0)} ${units[i]}`;
}

/**
 * Format a duration in the most readable unit
 * @param {number} ms
 * @returns {string}
 */
export function formatDuration(ms) {
    if (typeof ms !== 'number' || !isFinite(ms) || ms < 0) return '-';
    if (ms < 1000) return `${Math.round(ms)} ms`;
    return `${(ms / 1000).toFixed(1)} s`;
}
