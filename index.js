import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { parseYAML } from './lib/yaml-parser.js';
import { checkContent } from './lib/detector.js';
import { computeDiff } from './lib/diff.js';
import { captureScreenshot, listScreenshots, pruneScreenshots } from './lib/screenshot.js';
import { generateHTML, generateSourcePage } from './lib/html.js';
import { generateId } from './lib/utils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function loadConfig() {
    const yamlPath = path.join(__dirname, 'config.yml');
    const jsonPath = path.join(__dirname, 'config.json');

    if (fs.existsSync(yamlPath)) {
        return parseYAML(fs.readFileSync(yamlPath, 'utf-8'));
    } else if (fs.existsSync(jsonPath)) {
        return JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
    } else {
        throw new Error('No config.yml or config.json found');
    }
}

function normalizeSource(source) {
    return {
        id: source.id || generateId(source.name),
        name: source.name,
        url: source.url,
        type: source.type || 'content',
        selector: source.selector,
        jsonPath: source.jsonPath,
        timeout: source.timeout || 10000,
        screenshots: source.screenshots !== false,
        // Dismiss the cookie banner before capturing; set `consent: false`
        // on a source to shoot the banner as-is
        consent: source.consent !== false
    };
}

/**
 * Each stored capture is a version with a lifespan.
 *
 * The newest one is still current, so it has no end; every older one ended
 * when the next capture replaced it. Rendering it this way means the page
 * never has to talk about a "changed" state: the pictures and their time
 * spans say it on their own.
 *
 * @param {string} sourceId
 * @param {string} lastCheck - ISO timestamp of the last check
 * @returns {Array<{path: string, takenAt: string, until: string|null, lastCheck: string}>}
 */
export function buildVersions(sourceId, lastCheck) {
    const shots = listScreenshots(sourceId); // newest first

    return shots.map((shot, i) => ({
        path: shot.path,
        takenAt: shot.savedAt,
        until: i === 0 ? null : shots[i - 1].savedAt,
        lastCheck: i === 0 ? lastCheck : shot.savedAt
    }));
}

/**
 * Decide whether this run should capture a screenshot.
 *
 * The rule the project is built around:
 *   - the very first run captures one, so every source always has at least
 *     one screenshot (the thumbnail on the dashboard)
 *   - a content change captures a new one, giving the before/after pair
 *   - otherwise nothing is captured until something actually changes
 *
 * A previous attempt that was blocked or failed is retried: the stored image
 * is missing, stale or is a bot-check page, so there is nothing worth keeping.
 *
 * @param {Object} source - Normalised source
 * @param {string} status - 'changed' | 'unchanged'
 * @param {string} [lastCaptureStatus] - captureStatus from the previous run
 * @returns {{capture: boolean, reason: string}}
 */
export function shouldCapture(source, status, lastCaptureStatus) {
    if (!source.screenshots) return { capture: false, reason: 'disabled' };
    if (!/^https?:\/\//i.test(source.url || '')) return { capture: false, reason: 'not-http' };
    if (status === 'changed') return { capture: true, reason: 'change' };

    if (lastCaptureStatus === 'blocked' || lastCaptureStatus === 'failed') {
        return { capture: true, reason: `retry-${lastCaptureStatus}` };
    }

    return listScreenshots(source.id).length === 0
        ? { capture: true, reason: 'initial' }
        : { capture: false, reason: 'no-change' };
}

/**
 * Screenshot paths that api/<id>/history.json still points at. Those are
 * rendered on the timeline, so deleting them would leave broken images.
 * @param {string} sourceId
 * @returns {Set<string>}
 */
export function referencedScreenshots(sourceId) {
    const refs = new Set();

    for (const entry of loadHistory(sourceId)) {
        if (entry.screenshot) refs.add(entry.screenshot);
        if (entry.previousScreenshot) refs.add(entry.previousScreenshot);
    }

    return refs;
}

function ensureDirectories() {
    ['api', 'source'].forEach(dir => {
        const full = path.join(__dirname, dir);
        if (!fs.existsSync(full)) fs.mkdirSync(full, { recursive: true });
    });
}

function apiDir(sourceId) {
    const dir = path.join(__dirname, 'api', sourceId);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    return dir;
}

function saveChangeData(sourceId, data) {
    fs.writeFileSync(path.join(apiDir(sourceId), 'status.json'), JSON.stringify(data, null, 2), 'utf-8');
}

function loadChangeData(sourceId) {
    const file = path.join(__dirname, 'api', sourceId, 'status.json');
    if (!fs.existsSync(file)) return null;
    try { return JSON.parse(fs.readFileSync(file, 'utf-8')); } catch { return null; }
}

/**
 * The log is one entry per CHECK, not per change.
 *
 * A source checked hourly and never changing would otherwise have an empty
 * history, and the page would have nothing to show. Entries carry the
 * screenshot that was in effect at that moment; when a check did not capture,
 * the renderer walks back to the nearest earlier one.
 */
const MAX_HISTORY = 200;

function loadHistory(sourceId) {
    const file = path.join(__dirname, 'api', sourceId, 'history.json');
    if (!fs.existsSync(file)) return [];
    try { return JSON.parse(fs.readFileSync(file, 'utf-8')); } catch { return []; }
}

function addCheck(sourceId, entry) {
    const history = loadHistory(sourceId);
    history.unshift({
        timestamp: entry.timestamp,
        status: entry.status,
        hash: entry.hash,
        screenshot: entry.screenshot || null,
        // Only meaningful on a change, and only for the issue body
        diff: entry.diff || null,
        previousScreenshot: entry.previousScreenshot || null
    });
    const file = path.join(apiDir(sourceId), 'history.json');
    fs.writeFileSync(file, JSON.stringify(history.slice(0, MAX_HISTORY), null, 2), 'utf-8');
}

function loadContent(sourceId) {
    const file = path.join(__dirname, 'api', sourceId, 'content.txt');
    return fs.existsSync(file) ? fs.readFileSync(file, 'utf-8') : null;
}

function saveContent(sourceId, content) {
    fs.writeFileSync(path.join(apiDir(sourceId), 'content.txt'), content, 'utf-8');
}

async function main() {
    try {
        console.log('Loading configuration...');
        const config = loadConfig();

        if (!config.sources || !Array.isArray(config.sources)) {
            throw new Error('No sources defined in configuration');
        }

        ensureDirectories();

        const sources = config.sources.map(normalizeSource);
        const results = [];

        console.log(`Checking ${sources.length} source(s)...`);

        for (const source of sources) {
            console.log(`  Checking: ${source.name}`);

            try {
                const result = await checkContent(source);
                const previousData = loadChangeData(source.id);
                const previousHash = previousData?.currentHash;
                const previousContent = loadContent(source.id);

                const status = previousHash && previousHash !== result.currentHash ? 'changed' : 'unchanged';
                const timestamp = new Date().toISOString();

                saveContent(source.id, result.content);

                const shotsBefore = listScreenshots(source.id);
                const previousShot = shotsBefore[0] || null;

                const { capture, reason } = shouldCapture(source, status, previousData?.captureStatus);
                let shot = null;
                let captureStatus = 'pending';
                let captureReason = null;

                if (capture) {
                    console.log(`    Capturing screenshot (${reason})...`);
                    shot = await captureScreenshot(source.url, source.id, {
                        consent: source.consent
                    });

                    if (shot.error) {
                        captureStatus = shot.blocked ? 'blocked' : 'failed';
                        captureReason = shot.reason || shot.error;
                        console.error(`    ✗ Screenshot ${captureStatus}: ${shot.error}`);
                    } else {
                        captureStatus = 'ok';
                        console.log(`    ✓ Screenshot: ${shot.path}`);
                    }
                } else {
                    captureStatus = 'skipped';
                }

                saveChangeData(source.id, {
                    lastCheck: timestamp,
                    status,
                    currentHash: result.currentHash,
                    previousHash: previousHash || null,
                    timestamp,
                    checks: (previousData?.checks || 0) + 1,
                    captureStatus,
                    captureReason,
                    ...result.meta,
                    error: null
                });

                if (status === 'changed') {
                    const diff = previousContent ? computeDiff(previousContent, result.content) : null;
                    console.log(`    ✓ CHANGED - Hash: ${result.currentHash.substring(0, 8)}`);
                    addCheck(source.id, {
                        timestamp,
                        status: 'changed',
                        hash: result.currentHash,
                        diff,
                        screenshot: shot && !shot.error ? shot.path : null,
                        previousScreenshot: previousShot ? previousShot.path : null
                    });
                } else {
                    console.log(`    ✓ unchanged - Hash: ${result.currentHash.substring(0, 8)}`);
                    addCheck(source.id, {
                        timestamp,
                        status: 'unchanged',
                        hash: result.currentHash,
                        screenshot: shot && !shot.error ? shot.path : null
                    });
                }

                const history = loadHistory(source.id);

                results.push({
                    id: source.id,
                    name: source.name,
                    url: source.url,
                    type: source.type,
                    selector: source.selector,
                    jsonPath: source.jsonPath,
                    timeout: source.timeout,
                    status,
                    lastCheck: timestamp,
                    meta: result.meta,
                    error: null,
                    captureStatus,
                    captureReason,
                    thumbnail: listScreenshots(source.id)[0]?.path || null,
                    versions: buildVersions(source.id, timestamp),
                    checks: (previousData?.checks || 0) + 1,
                    changesCount: history.filter(entry => entry.status === 'changed').length,
                    history
                });

            } catch (error) {
                console.error(`    ✗ Error: ${error.message}`);

                const errorTimestamp = new Date().toISOString();

                saveChangeData(source.id, {
                    lastCheck: errorTimestamp,
                    status: 'error',
                    currentHash: null,
                    previousHash: null,
                    timestamp: errorTimestamp,
                    error: error.message
                });

                addCheck(source.id, {
                    timestamp: errorTimestamp,
                    status: 'error',
                    hash: null
                });

                results.push({
                    id: source.id,
                    name: source.name,
                    url: source.url,
                    type: source.type,
                    selector: source.selector,
                    jsonPath: source.jsonPath,
                    timeout: source.timeout,
                    status: 'error',
                    lastCheck: errorTimestamp,
                    error: error.message,
                    captureStatus: 'skipped',
                    thumbnail: listScreenshots(source.id)[0]?.path || null,
                    versions: buildVersions(source.id, errorTimestamp),
                    checks: (previousData?.checks || 0) + 1,
                    changesCount: 0,
                    history: loadHistory(source.id)
                });
            }
        }

        console.log('\nPruning screenshot archive...');
        for (const source of sources) {
            const removed = pruneScreenshots(listScreenshots(source.id), {
                ...config.archive,
                protected: referencedScreenshots(source.id)
            });
            if (removed.length > 0) {
                console.log(`  ${source.id}: removed ${removed.length} old screenshot(s)`);
            }
        }

        console.log('Generating dashboard...');
        fs.writeFileSync(
            path.join(__dirname, 'index.html'),
            generateHTML(config.title || 'Change Monitor', results, config),
            'utf-8'
        );
        console.log('✓ Dashboard generated: index.html');

        console.log('Generating source pages...');
        results.forEach(result => {
            const html = generateSourcePage(result, config);
            fs.writeFileSync(path.join(__dirname, 'source', `${result.id}.html`), html, 'utf-8');
            console.log(`✓ Source page generated: source/${result.id}.html`);
        });

        const changed = results.filter(r => r.status === 'changed').length;
        const errors = results.filter(r => r.status === 'error').length;
        console.log('\n=== Summary ===');
        console.log(`Total sources: ${results.length}`);
        console.log(`Changed: ${changed}`);
        console.log(`Unchanged: ${results.length - changed - errors}`);
        console.log(`Errors: ${errors}`);

    } catch (error) {
        console.error('Fatal error:', error);
        process.exit(1);
    }
}

// Only run when executed directly, so the helpers stay importable by tests
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    main();
}
