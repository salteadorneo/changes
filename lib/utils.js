/**
 * Format a date according to locale
 * @param {Date} date
 * @param {string} language - Language code (e.g. 'en', 'es')
 * @returns {string}
 */
export function formatDate(date, language = 'en') {
    const localeMap = {
        'es': 'es-ES',
        'en': 'en-US'
    };

    const locale = localeMap[language] || 'en-US';

    return date.toLocaleString(locale, {
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
