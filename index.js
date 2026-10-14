import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { parseYAML } from './lib/yaml-parser.js';
import { checkContent } from './lib/detector.js';
import { computeDiff } from './lib/diff.js';
import { captureScreenshot, listScreenshots, pruneScreenshots } from './lib/screenshot.js';
import { generateHTML, generateSourcePage } from './lib/html.js';

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

function generateId(name) {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
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
        screenshots: source.screenshots !== false
    };
}

/**
 * Decide whether this run should capture a screenshot.
 *
 * We do not shoot on every run (that is a lot of browser time and storage);
 * we shoot when the content changed, and once a day as a heartbeat so the
 * archive keeps growing even for sources that never change.
 *
 * @param {Object} source - Normalised source
 * @param {string} status - 'changed' | 'unchanged'
 * @returns {{capture: boolean, reason: string}}
 */
function shouldCapture(source, status) {
    if (!source.screenshots) return { capture: false, reason: 'disabled' };
    if (!/^https?:\/\//i.test(source.url || '')) return { capture: false, reason: 'not-http' };
    if (status === 'changed') return { capture: true, reason: 'change' };

    const shots = listScreenshots(source.id);
    const today = new Date().toISOString().slice(0, 10);
    const shotToday = shots.some(shot => shot.savedAt.slice(0, 10) === today);

    return shotToday
        ? { capture: false, reason: 'already-captured-today' }
        : { capture: true, reason: 'daily' };
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

function loadChangesHistory(sourceId) {
    const file = path.join(__dirname, 'api', sourceId, 'history.json');
    if (!fs.existsSync(file)) return [];
    try { return JSON.parse(fs.readFileSync(file, 'utf-8')); } catch { return []; }
}

function addToChangesHistory(sourceId, entry) {
    const history = loadChangesHistory(sourceId);
    history.unshift({
        timestamp: new Date().toISOString(),
        status: entry.status,
        hash: entry.hash,
        previousHash: entry.previousHash,
        diff: entry.diff || null,
        screenshot: entry.screenshot || null,
        previousScreenshot: entry.previousScreenshot || null
    });
    const file = path.join(apiDir(sourceId), 'history.json');
    fs.writeFileSync(file, JSON.stringify(history.slice(0, 50), null, 2), 'utf-8');
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

                saveChangeData(source.id, {
                    lastCheck: timestamp,
                    status,
                    currentHash: result.currentHash,
                    previousHash: previousHash || null,
                    timestamp,
                    error: null
                });

                saveContent(source.id, result.content);

                const shotsBefore = listScreenshots(source.id);
                const previousShot = shotsBefore[0] || null;

                const { capture, reason } = shouldCapture(source, status);
                let shot = null;

                if (capture) {
                    console.log(`    Capturing screenshot (${reason})...`);
                    shot = await captureScreenshot(source.url, source.id);
                    if (shot.error) {
                        console.error(`    ✗ Screenshot failed: ${shot.error}`);
                    } else {
                        console.log(`    ✓ Screenshot: ${shot.path}`);
                    }
                }

                if (status === 'changed') {
                    const diff = previousContent ? computeDiff(previousContent, result.content) : null;
                    addToChangesHistory(source.id, {
                        status: 'changed',
                        hash: result.currentHash,
                        previousHash,
                        diff,
                        screenshot: shot && !shot.error ? shot.path : null,
                        previousScreenshot: previousShot ? previousShot.path : null
                    });
                    console.log(`    ✓ CHANGED - Hash: ${result.currentHash.substring(0, 8)}`);
                } else {
                    console.log(`    ✓ unchanged - Hash: ${result.currentHash.substring(0, 8)}`);
                }

                results.push({
                    id: source.id,
                    name: source.name,
                    status,
                    currentHash: result.currentHash,
                    previousHash,
                    timestamp: new Date().toISOString(),
                    error: null,
                    changesHistory: loadChangesHistory(source.id)
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

                results.push({
                    id: source.id,
                    name: source.name,
                    status: 'error',
                    error: error.message,
                    changesHistory: loadChangesHistory(source.id)
                });
            }
        }

        console.log('\nPruning screenshot archive...');
        for (const source of sources) {
            const removed = pruneScreenshots(listScreenshots(source.id), config.archive);
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
            const html = generateSourcePage(result.name, result.id, result.changesHistory || [], config);
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

main();
