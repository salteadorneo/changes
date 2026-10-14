import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ARCHIVE_DIR = path.join(__dirname, '..', 'screenshots');

const VIEWPORT = { width: 1280, height: 900 };
const FULL_PAGE_MAX_HEIGHT = 8000;
const BROWSER_TIMEOUT = 30000;

/**
 * Locate a usable Chrome/Chromium/Edge binary.
 * Honours PUPPETEER_EXECUTABLE_PATH, CHROME_PATH, then falls back to the
 * common install locations. CI images (ubuntu-latest) ship Chrome already.
 * @returns {string|null}
 */
export function findBrowser() {
    const candidates = [
        process.env.PUPPETEER_EXECUTABLE_PATH,
        process.env.CHROME_PATH,
        '/usr/bin/google-chrome',
        '/usr/bin/chromium',
        '/usr/bin/chromium-browser',
        '/usr/bin/google-chrome-stable',
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
        process.env.LOCALAPPDATA && path.join(
            process.env.LOCALAPPDATA,
            'Google\\Chrome\\Application\\chrome.exe'
        ),
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
    ].filter(Boolean);

    return candidates.find(candidate => fs.existsSync(candidate)) || null;
}

async function launchBrowser() {
    const puppeteer = await import('puppeteer-core').catch(() => null);
    if (!puppeteer) {
        throw new Error('puppeteer-core is not installed');
    }

    const executablePath = findBrowser();
    if (!executablePath) {
        throw new Error('no Chrome/Chromium found (set CHROME_PATH)');
    }

    return puppeteer.default.launch({
        executablePath,
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--hide-scrollbars'
        ]
    });
}

function archiveDir(sourceId) {
    const dir = path.join(ARCHIVE_DIR, sourceId);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    return dir;
}

/**
 * Timestamp slug used as the screenshot filename: 2026-10-14T15-30-00
 * @param {Date} date
 * @returns {string}
 */
export function timestampSlug(date = new Date()) {
    return date.toISOString().replace(/[:.]/g, '-').slice(0, -5);
}

/**
 * Capture a full-page screenshot of a URL.
 * Never throws: screenshots are a nice-to-have, a failure must not abort the run.
 * @param {string} url
 * @param {string} sourceId
 * @returns {Promise<{path: string|null, capturedAt: string, error: string|null}>}
 */
export async function captureScreenshot(url, sourceId) {
    const capturedAt = new Date().toISOString();
    const filename = `${timestampSlug()}.png`;

    let browser;
    try {
        if (!/^https?:\/\//i.test(url)) {
            throw new Error('only http(s) URLs can be captured');
        }

        browser = await launchBrowser();
        const page = await browser.newPage();

        await page.setViewport(VIEWPORT);
        await page.setDefaultNavigationTimeout(BROWSER_TIMEOUT);

        await page.goto(url, {
            waitUntil: 'networkidle2',
            timeout: BROWSER_TIMEOUT
        });

        // Let fonts and lazy images settle before measuring the page
        await page.evaluate(() => document.fonts?.ready).catch(() => {});
        await new Promise(resolve => setTimeout(resolve, 750));

        const height = await page.evaluate(limit =>
            Math.min(document.documentElement.scrollHeight, limit), FULL_PAGE_MAX_HEIGHT);

        if (height > VIEWPORT.height) {
            await page.setViewport({ width: VIEWPORT.width, height });
        }

        const buffer = await page.screenshot({
            type: 'png',
            fullPage: false,
            omitBackground: false
        });

        fs.writeFileSync(path.join(archiveDir(sourceId), filename), buffer);

        return {
            path: `screenshots/${sourceId}/${filename}`,
            capturedAt,
            error: null
        };
    } catch (error) {
        return { path: null, capturedAt, error: error.message };
    } finally {
        if (browser) await browser.close().catch(() => {});
    }
}

/**
 * List stored screenshots for a source, newest first.
 * @param {string} sourceId
 * @returns {Array<{file: string, path: string, savedAt: string}>}
 */
export function listScreenshots(sourceId) {
    const dir = path.join(ARCHIVE_DIR, sourceId);
    if (!fs.existsSync(dir)) return [];

    return fs.readdirSync(dir)
        .filter(file => file.endsWith('.png'))
        .sort((a, b) => b.localeCompare(a))
        .map(file => {
            // Filename slug is UTC: 2026-10-14T15-30-00 -> 2026-10-14T15:30:00Z
            const parsed = new Date(`${file.slice(0, 19).replace(/-(\d{2})-(\d{2})$/, ':$1:$2')}Z`);
            return {
                file,
                path: `screenshots/${sourceId}/${file}`,
                savedAt: isNaN(parsed.getTime()) ? new Date(0).toISOString() : parsed.toISOString()
            };
        });
}

/**
 * Retention policy, applied in three tiers:
 *
 *   1. keep the newest `keepRecent` screenshots (recent runs)
 *   2. keep the newest screenshot of each of the last `keepDaily` days
 *   3. hard cap of `maxTotal` screenshots, dropping the oldest first
 *
 * Anything outside those tiers is deleted from disk.
 *
 * Sizing: a full-page 1280px PNG weighs roughly 1-1.5 MB, so the default
 * cap of 40 is roughly 40-60 MB per source. Lower it if you monitor many
 * sources or publish to Pages.
 *
 * @param {Array<{file: string, path: string, savedAt: string}>} shots newest first
 * @param {{keepRecent?: number, keepDaily?: number, maxTotal?: number}} [options]
 * @returns {string[]} paths that were deleted
 */
export function pruneScreenshots(shots, options = {}) {
    const {
        keepRecent = 24,
        keepDaily = 30,
        maxTotal = 40
    } = options;

    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;
    const removed = [];

    const remove = shot => {
        const file = path.join(ARCHIVE_DIR, path.basename(path.dirname(shot.path)), shot.file);
        if (!fs.existsSync(file)) return;
        fs.unlinkSync(file);
        removed.push(shot.path);
    };

    const isKept = new Set();

    // Tier 1: the most recent runs, whatever their age
    shots.slice(0, keepRecent).forEach(shot => isKept.add(shot.file));

    // Tier 2: one screenshot per day, for the last `keepDaily` days
    const daysSeen = new Set();
    for (const shot of shots) {
        const age = now - new Date(shot.savedAt).getTime();
        if (age > keepDaily * dayMs) continue;

        const day = shot.savedAt.slice(0, 10);
        if (daysSeen.has(day)) continue;

        daysSeen.add(day);
        isKept.add(shot.file);
    }

    shots.filter(shot => !isKept.has(shot.file)).forEach(remove);

    // Tier 3: absolute cap - everything past the newest `maxTotal` survivors goes
    const kept = shots.filter(shot => isKept.has(shot.file));
    for (let i = maxTotal; i < kept.length; i++) {
        remove(kept[i]);
    }

    return removed;
}