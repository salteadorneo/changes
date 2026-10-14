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

        return { body: await response.text(), status: response.status };
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
 * Strip HTML tags and dynamic parts, preserving readable text for diffing
 * @param {string} content
 * @returns {string}
 */
function normalizeForDisplay(content) {
    let text = content;
    // Remove script/style blocks entirely
    text = text.replace(/<script[\s\S]*?<\/script>/gi, '');
    text = text.replace(/<style[\s\S]*?<\/style>/gi, '');
    // Remove HTML comments
    text = text.replace(/<!--[\s\S]*?-->/g, '');
    // Strip remaining HTML tags
    text = text.replace(/<[^>]+>/g, ' ');
    // Decode common HTML entities
    text = text.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/&#\d+;/g, '');
    // Remove dynamic parts
    text = text.replace(/\d{10,}/g, '');
    text = text.replace(/\?[a-zA-Z0-9_-]+=[^\s&]*/g, '');
    return text.split('\n')
        .map(l => l.replace(/\s+/g, ' ').trim())
        .filter(l => l.length > 1)
        .join('\n');
}

/**
 * Check content and return hash + display content for diffing
 * @param {Object} source - Source configuration
 * @returns {Promise<{currentHash: string, content: string, error: null}>}
 */
export async function checkContent(source) {
    const startedAt = Date.now();
    const { body: raw, status } = await fetchContentWithRetries(source.url, source.timeout);
    const fetchedAt = new Date().toISOString();
    let hashableContent;
    let displayContent;

    if (source.type === 'html' && source.selector) {
        const extracted = extractWithSelector(raw, source.selector);
        hashableContent = extracted.trim();
        displayContent = extracted.trim();
    } else if (source.type === 'json') {
        let jsonData;
        try {
            jsonData = JSON.parse(raw);
        } catch (error) {
            throw new Error(`JSON parsing failed: ${error.message}`);
        }
        const value = source.jsonPath ? extractWithJsonPath(jsonData, source.jsonPath) : jsonData;
        hashableContent = JSON.stringify(value);
        displayContent = JSON.stringify(value, null, 2);
    } else {
        displayContent = normalizeForDisplay(raw);
        hashableContent = displayContent;
    }

    return {
        currentHash: hashContent(hashableContent),
        content: displayContent,
        meta: {
            fetchedAt,
            httpStatus: status,
            durationMs: Date.now() - startedAt,
            responseBytes: Buffer.byteLength(raw, 'utf-8'),
            contentChars: displayContent.length,
            contentLines: displayContent ? displayContent.split('\n').length : 0
        },
        error: null
    };
}