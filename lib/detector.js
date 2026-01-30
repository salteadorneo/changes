import crypto from 'crypto';

const RETRIES = 3;
const RETRY_DELAY = 2000;

/**
 * Calculate SHA256 hash of content
 * @param {string} content
 * @returns {string}
 */
function hashContent(content) {
    return crypto.createHash('sha256').update(content).digest('hex');
}

/**
 * Fetch content with retries
 * @param {string} url
 * @param {number} timeout
 * @param {number} attempt
 * @returns {Promise<string>}
 */
async function fetchContentWithRetries(url, timeout = 10000, attempt = 1) {
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        const response = await fetch(url, {
            signal: controller.signal,
            headers: { 'User-Agent': 'Changes-Monitor/1.0' }
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        return await response.text();
    } catch (error) {
        if (attempt < RETRIES) {
            await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
            return fetchContentWithRetries(url, timeout, attempt + 1);
        }
        throw error;
    }
}

/**
 * Escape special regex characters
 * @param {string} str
 * @returns {string}
 */
function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Simple regex-based HTML selector extraction
 * Works for basic selectors like: tag, .class, [attr], #id
 * @param {string} html
 * @param {string} selector
 * @returns {string}
 */
function extractWithSelector(html, selector) {
    try {
        let pattern;

        // ID selector: #id-name
        if (selector.startsWith('#')) {
            const id = selector.substring(1);
            pattern = new RegExp(`id\\s*=\\s*["\']?${escapeRegex(id)}["\']?[^>]*>([^<]+)`, 'i');
            const match = html.match(pattern);
            if (match) return match[1];
            throw new Error(`No element found with id: ${id}`);
        }

        // Class selector: .class-name
        if (selector.startsWith('.')) {
            const className = selector.substring(1);
            pattern = new RegExp(`class\\s*=\\s*["\']?[^"']*${escapeRegex(className)}[^"']*["\']?[^>]*>([^<]+)`, 'i');
            const match = html.match(pattern);
            if (match) return match[1];
            throw new Error(`No element found with class: ${className}`);
        }

        // Attribute selector: [attr] or [attr=value]
        if (selector.startsWith('[') && selector.endsWith(']')) {
            const attrPart = selector.substring(1, selector.length - 1);
            if (attrPart.includes('=')) {
                const [attr, value] = attrPart.split('=');
                pattern = new RegExp(`${escapeRegex(attr.trim())}\\s*=\\s*["\']?${escapeRegex(value.trim())}["\']?[^>]*>([^<]+)`, 'i');
            } else {
                pattern = new RegExp(`${escapeRegex(attrPart)}\\s*=\\s*["\']?[^"']*["\']?[^>]*>([^<]+)`, 'i');
            }
            const match = html.match(pattern);
            if (match) return match[1];
            throw new Error(`No element found with attribute: ${attrPart}`);
        }

        // Tag selector: tag
        pattern = new RegExp(`<${escapeRegex(selector)}[^>]*>([^<]+)`, 'i');
        const match = html.match(pattern);
        if (match) return match[1];
        throw new Error(`No element found for selector: ${selector}`);

    } catch (error) {
        throw new Error(`Selector extraction failed: ${error.message}`);
    }
}

/**
 * Extract value from JSON using dot notation path
 * @param {Object} obj
 * @param {string} path - e.g. "data.version.number"
 * @returns {any}
 */
function extractWithJsonPath(obj, path) {
    const keys = path.split('.');
    let value = obj;

    for (const key of keys) {
        if (value === null || value === undefined) {
            throw new Error(`Path "${path}" not found in JSON`);
        }
        value = value[key];
    }

    if (value === undefined) {
        throw new Error(`Path "${path}" not found in JSON`);
    }

    return value;
}

/**
 * Check content and return hash + raw HTML
 * @param {Object} source - Source configuration
 * @returns {Promise<{currentHash: string, html: string, error: null}>}
 */
export async function checkContent(source) {
    try {
        let content = await fetchContentWithRetries(source.url, source.timeout);
        const rawHtml = content; // Keep original HTML for screenshots

        // Extract content based on type
        if (source.type === 'html' && source.selector) {
            content = extractWithSelector(content, source.selector);
        } else if (source.type === 'json') {
            try {
                const jsonData = JSON.parse(content);

                if (source.jsonPath) {
                    const extracted = extractWithJsonPath(jsonData, source.jsonPath);
                    content = JSON.stringify(extracted);
                } else {
                    content = JSON.stringify(jsonData);
                }
            } catch (error) {
                throw new Error(`JSON parsing failed: ${error.message}`);
            }
        }

        const currentHash = hashContent(content);

        return {
            currentHash,
            html: rawHtml,
            error: null
        };
    } catch (error) {
        throw error;
    }
}

/**
 * Compare two hashes and determine if changed
 * @param {string} newHash
 * @param {string} oldHash
 * @returns {boolean}
 */
export function hasChanged(newHash, oldHash) {
    if (!oldHash) return false;
    return newHash !== oldHash;
}
