import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { parseYAML } from './lib/yaml-parser.js';
import { checkContent } from './lib/detector.js';
import { generateHTML } from './lib/html.js';
import { captureScreenshot, getTimestampedFilename, cleanupOldScreenshots, getRecentScreenshots, captureSourceScreenshot, getSourceScreenshots } from './lib/screenshot.js';

/**
 * @typedef {Object} Source
 * @property {string} id - Unique source identifier
 * @property {string} name - Display name
 * @property {string} url - URL to check
 * @property {string} type - Check type: 'content', 'html', 'json'
 * @property {string} [selector] - CSS selector for HTML extraction
 * @property {string} [jsonPath] - JSON path for value extraction
 */

/**
 * @typedef {Object} ChangeResult
 * @property {string} id - Source identifier
 * @property {string} name - Source name
 * @property {'changed'|'unchanged'} status - Change status
 * @property {string} currentHash - Current content hash
 * @property {string} [previousHash] - Previous content hash
 * @property {string} timestamp - ISO timestamp
 * @property {string|null} error - Error message if any
 */

/**
 * @typedef {Object} ChangeData
 * @property {string} lastCheck - ISO timestamp of last check
 * @property {'changed'|'unchanged'} status - Current status
 * @property {string} currentHash - Current content hash
 * @property {string} [previousHash] - Previous content hash
 * @property {string} timestamp - ISO timestamp
 * @property {string|null} error - Error message if any
 */

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const { version } = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf-8'));

/**
 * Load and parse configuration from YAML or JSON
 * @returns {Object}
 */
function loadConfig() {
    const yamlPath = path.join(__dirname, 'config.yml');
    const jsonPath = path.join(__dirname, 'config.json');

    if (fs.existsSync(yamlPath)) {
        const yamlContent = fs.readFileSync(yamlPath, 'utf-8');
        return parseYAML(yamlContent);
    } else if (fs.existsSync(jsonPath)) {
        return JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
    } else {
        throw new Error('No config.yml or config.json found');
    }
}

/**
 * Generate a service ID from name
 * @param {string} name
 * @returns {string}
 */
function generateId(name) {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
}

/**
 * Normalize source configuration with defaults
 * @param {Object} source
 * @returns {Source}
 */
function normalizeSource(source) {
    return {
        id: source.id || generateId(source.name),
        name: source.name,
        url: source.url,
        type: source.type || 'content',
        selector: source.selector,
        jsonPath: source.jsonPath,
        timeout: source.timeout || 10000
    };
}

/**
 * Ensure output directories exist
 */
function ensureDirectories() {
    const dirs = [
        path.join(__dirname, 'api'),
    ];

    dirs.forEach(dir => {
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
    });
}

/**
 * Save change data for a source
 * @param {string} sourceId
 * @param {ChangeData} data
 */
function saveChangeData(sourceId, data) {
    const apiDir = path.join(__dirname, 'api', sourceId);

    if (!fs.existsSync(apiDir)) {
        fs.mkdirSync(apiDir, { recursive: true });
    }

    const statusFile = path.join(apiDir, 'status.json');
    fs.writeFileSync(statusFile, JSON.stringify(data, null, 2), 'utf-8');
}

/**
 * Load change data for a source
 * @param {string} sourceId
 * @returns {ChangeData|null}
 */
function loadChangeData(sourceId) {
    const statusFile = path.join(__dirname, 'api', sourceId, 'status.json');

    if (!fs.existsSync(statusFile)) {
        return null;
    }

    try {
        return JSON.parse(fs.readFileSync(statusFile, 'utf-8'));
    } catch (error) {
        console.error(`Error reading change data for ${sourceId}:`, error);
        return null;
    }
}

/**
 * Load changes history for a source
 * @param {string} sourceId
 * @returns {Array}
 */
function loadChangesHistory(sourceId) {
    const historyFile = path.join(__dirname, 'api', sourceId, 'history.json');

    if (!fs.existsSync(historyFile)) {
        return [];
    }

    try {
        return JSON.parse(fs.readFileSync(historyFile, 'utf-8'));
    } catch (error) {
        console.error(`Error reading changes history for ${sourceId}:`, error);
        return [];
    }
}

/**
 * Save change to history
 * @param {string} sourceId
 * @param {Object} changeEntry
 */
function addToChangesHistory(sourceId, changeEntry) {
    const apiDir = path.join(__dirname, 'api', sourceId);

    if (!fs.existsSync(apiDir)) {
        fs.mkdirSync(apiDir, { recursive: true });
    }

    const historyFile = path.join(apiDir, 'history.json');
    const history = loadChangesHistory(sourceId);

    // Add new entry at the beginning
    history.unshift({
        timestamp: new Date().toISOString(),
        status: changeEntry.status,
        hash: changeEntry.hash,
        previousHash: changeEntry.previousHash,
        screenshotPath: changeEntry.screenshotPath || null
    });

    // Keep last 50 changes
    const trimmedHistory = history.slice(0, 50);

    fs.writeFileSync(historyFile, JSON.stringify(trimmedHistory, null, 2), 'utf-8');
}

/**
 * Check all sources and generate reports
 */
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

                const changeData = {
                    lastCheck: new Date().toISOString(),
                    status: previousHash && previousHash !== result.currentHash ? 'changed' : 'unchanged',
                    currentHash: result.currentHash,
                    previousHash: previousHash || null,
                    timestamp: new Date().toISOString(),
                    error: result.error || null
                };

                saveChangeData(source.id, changeData);

                // Record change in history if status changed
                if (changeData.status === 'changed') {
                    addToChangesHistory(source.id, {
                        status: 'changed',
                        hash: result.currentHash,
                        previousHash: previousHash
                    });
                }

                if (result.html) {
                    const hasExistingScreenshots = getSourceScreenshots(source.id, 1).length > 0;
                    const shouldCaptureScreenshot = changeData.status === 'changed' || !hasExistingScreenshots;

                    if (shouldCaptureScreenshot) {
                        console.log(`    Capturing source screenshot...`);
                        const screenshotResult = await captureSourceScreenshot(result.html, source.id);
                        if (screenshotResult.success) {
                            console.log(`    ✓ Screenshot saved: ${screenshotResult.filename}`);
                            // Update history with screenshot paths
                            if (changeData.status === 'changed') {
                                const allScreenshots = getSourceScreenshots(source.id, 100); // Get all
                                const previousScreenshot = allScreenshots.length > 1 ? allScreenshots[1] : null; // Second is previous

                                const history = loadChangesHistory(source.id);
                                if (history.length > 0) {
                                    history[0].screenshotPath = screenshotResult.path;
                                    history[0].previousScreenshotPath = previousScreenshot?.path || null;
                                    const historyFile = path.join(__dirname, 'api', source.id, 'history.json');
                                    fs.writeFileSync(historyFile, JSON.stringify(history, null, 2), 'utf-8');
                                }
                            }
                        } else {
                            console.log(`    ✗ Screenshot failed: ${screenshotResult.error}`);
                        }
                    } else {
                        console.log(`    ℹ No changes detected, skipping screenshot`);
                    }
                }

                results.push({
                    id: source.id,
                    name: source.name,
                    status: changeData.status,
                    currentHash: result.currentHash,
                    previousHash: previousHash,
                    timestamp: changeData.timestamp,
                    error: changeData.error,
                    changesHistory: loadChangesHistory(source.id)
                });

                if (changeData.status === 'changed') {
                    console.log(`    ✓ CHANGED - Hash: ${result.currentHash.substring(0, 8)}`);
                } else {
                    console.log(`    ✓ unchanged - Hash: ${result.currentHash.substring(0, 8)}`);
                }
            } catch (error) {
                console.error(`    ✗ Error: ${error.message}`);

                const changeData = {
                    lastCheck: new Date().toISOString(),
                    status: 'unchanged',
                    currentHash: null,
                    previousHash: null,
                    timestamp: new Date().toISOString(),
                    error: error.message
                };

                saveChangeData(source.id, changeData);

                results.push({
                    id: source.id,
                    name: source.name,
                    status: 'error',
                    error: error.message
                });
            }
        }

        // Generate HTML dashboard
        console.log('\nGenerating dashboard...');
        const htmlContent = generateHTML(
            config.title || 'Change Monitor',
            results,
            config
        );

        fs.writeFileSync(path.join(__dirname, 'index.html'), htmlContent, 'utf-8');
        console.log('✓ Dashboard generated: index.html');

        // Capture screenshot of dashboard only if there are changes or it's first time
        const changed = results.filter(r => r.status === 'changed').length;
        const hasExistingDashboardScreenshots = getRecentScreenshots().length > 0;
        const shouldCaptureDashboard = changed > 0 || !hasExistingDashboardScreenshots;

        if (shouldCaptureDashboard) {
            console.log('Capturing dashboard screenshot...');
            const screenshotFilename = getTimestampedFilename();
            const screenshotResult = await captureScreenshot(htmlContent, screenshotFilename);

            if (screenshotResult.success) {
                console.log(`✓ Screenshot saved: screenshots/${screenshotResult.filename}`);
                cleanupOldScreenshots(10); // Keep only last 10 screenshots
            } else {
                console.warn(`⚠ Screenshot capture failed: ${screenshotResult.error}`);
            }
        } else {
            console.log('ℹ No changes detected, skipping dashboard screenshot');
        }

        // Summary
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
