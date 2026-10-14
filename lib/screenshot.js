import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ARCHIVE_DIR = path.join(__dirname, '..', 'screenshots');

/**
 * Capture size. Kept modest on purpose: the archive is a visual record, not a
 * rendering target, and a full 1280px page of a long site costs well over a
 * megabyte per capture. 2400px is roughly three viewports, which is enough to
 * see a price or a counter on a typical page.
 */
const VIEWPORT = { width: 1120, height: 720 };
const FULL_PAGE_MAX_HEIGHT = 2400;
const BROWSER_TIMEOUT = 30000;
const CHALLENGE_TIMEOUT = 15000;
const CHALLENGE_POLL = 500;

/**
 * A plain desktop Chrome UA. The default Puppeteer UA advertises automation
 * and some CDNs challenge it immediately.
 */
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
    + '(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

/**
 * Markers of an interstitial bot check (Cloudflare and friends).
 * Checked in the DOM, so they also catch challenges served as plain HTML.
 */
const CHALLENGE_SELECTORS = [
    'iframe[src*="challenges.cloudflare.com"]',
    'iframe[src*="turnstile"]',
    'iframe[title*="Cloudflare"]',
    '#challenge-form',
    '#cf-challenge-running',
    '#challenge-running'
];

const CHALLENGE_TEXTS = [
    'just a moment',
    'checking your browser',
    'attention required',
    'enable javascript and cookies',
    'verificando que no eres un bot',
    'comprobando su navegador'
];

/**
 * Cookie consent banners cover exactly the part of the page worth looking
 * at, so they are dismissed before the shot. Ordered: rejecting first, since
 * that is both the privacy-respecting choice and usually the shortest banner.
 *
 * Deliberately not anchored at the end: real banners say "Rechazarlas todas",
 * "Aceptar todas las cookies", "Solo las necesarias"... Anchoring to an exact
 * phrase misses most of them.
 *
 * These are source strings, rebuilt as RegExp inside the page.
 */
const CONSENT_BUTTON_PATTERNS = [
    '^(rechazar|rechazarlas|rechazarlos|rechazar todas|rechazarlas todas|rechazar todo|rechazar y continuar|no aceptar|no,?\\s*gracias)',
    '^(reject all|reject|only necessary|necessary only|only essential|decline all|no,?\\s*thanks)',
    '^(cerrar|entendido|continuar|aceptar|aceptar todas|aceptar todo|acepto|ok|continue|accept all|accept|got it)'
];

/**
 * Last resort: if no button can be clicked, hide the containers outright.
 * Passed to querySelectorAll inside the page.
 */
const CONSENT_CONTAINERS = [
    '#onetrust-banner-sdk',
    '#onetrust-consent-sdk',
    '#CybotCookiebotDialog',
    '#CybotCookiebotDialogBodyUnderlay',
    '#usercentrics-root',
    '#didomi-popup',
    '#qc-cmp2-ui',
    '#sp_message_container',
    '.cc-window',
    '.cookie-banner',
    '.cookie-consent',
    '[class*="cookie-banner"]',
    '[class*="cookieBanner"]',
    '[id*="cookie-notice"]',
    '[id*="cookiebanner"]',
    '[aria-label*="cookie" i][role="dialog"]',
    '[data-testid*="cookie" i][role="dialog"]'
];

/**
 * Per-source browser profile directory. Reusing it keeps cookies and
 * localStorage between runs, so a site that challenges once usually lets the
 * next visit through on its own.
 * @param {string} sourceId
 * @returns {string}
 */
function profileDir(sourceId) {
    const dir = path.join(ARCHIVE_DIR, '.profiles', sourceId);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    return dir;
}

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
        '/usr/bin/brave-browser',
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
        // Brave is Chromium-based, so puppeteer-core drives it fine
        'C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe',
        'C:\\Program Files (x86)\\BraveSoftware\\Brave-Browser\\Application\\brave.exe',
        process.env.LOCALAPPDATA && path.join(
            process.env.LOCALAPPDATA,
            'BraveSoftware\\Brave-Browser\\Application\\brave.exe'
        ),
        process.env.LOCALAPPDATA && path.join(
            process.env.LOCALAPPDATA,
            'Google\\Chrome\\Application\\chrome.exe'
        ),
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser'
    ].filter(Boolean);

    return candidates.find(candidate => fs.existsSync(candidate)) || null;
}

async function launchBrowser(sourceId) {
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
        userDataDir: profileDir(sourceId),
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--hide-scrollbars',
            // Removes navigator.webdriver, the most trivial bot tell there is
            '--disable-blink-features=AutomationControlled',
            // Keep the persisted profile small; only cookies matter to us
            '--disk-cache-size=1'
        ]
    });
}

/**
 * Is the page sitting on a bot-check interstitial?
 * @param {Object} page
 * @returns {Promise<{blocked: boolean, reason: string|null}>}
 */
export async function detectChallenge(page) {
    for (const selector of CHALLENGE_SELECTORS) {
        const found = await page.$(selector).catch(() => null);
        if (found) {
            await found.dispose().catch(() => {});
            return { blocked: true, reason: selector };
        }
    }

    const text = await page.evaluate(() => document.body?.innerText || '')
        .catch(() => '');
    const lowered = text.toLowerCase();

    const hit = CHALLENGE_TEXTS.find(phrase => lowered.includes(phrase));

    return hit
        ? { blocked: true, reason: `text:"${hit}"` }
        : { blocked: false, reason: null };
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

const CONSENT_MARK = 'data-changes-consent-target';

/**
 * Get rid of the cookie banner before shooting.
 *
 * Two passes, because banners differ: first a real click on a button whose
 * text matches (preferring reject, so we do not silently opt anyone into
 * tracking), then hiding well-known containers if no button could be clicked.
 *
 * The button is tagged inside the page and then clicked from Node, so it goes
 * through the real input pipeline - a synthetic el.click() is ignored by
 * banners that listen for pointer events.
 *
 * @param {Object} page
 * @returns {Promise<{dismissed: boolean, via: string, label: string|null}>}
 */
async function dismissConsent(page) {
    try {
        const label = await page.evaluate(({ patterns, mark }) => {
            const candidates = Array.from(
                document.querySelectorAll('button, a[href], [role="button"], input[type="button"], input[type="submit"]')
            );

            const isVisible = el => {
                const box = el.getBoundingClientRect();
                if (box.width < 8 || box.height < 8) return false;
                const style = window.getComputedStyle(el);
                return style.visibility !== 'hidden' && style.display !== 'none';
            };

            const visible = candidates.filter(isVisible);

            for (const source of patterns) {
                const regex = new RegExp(source, 'i');
                const hit = visible.find(el => regex.test((el.innerText || el.value || '').trim()));
                if (hit) {
                    hit.setAttribute(mark, '1');
                    return (hit.innerText || hit.value || '').trim();
                }
            }
            return null;
        }, { patterns: CONSENT_BUTTON_PATTERNS, mark: CONSENT_MARK });

        let via = 'hidden';
        let count = 0;

        if (label) {
            try {
                await page.click(`[${CONSENT_MARK}]`, { timeout: 5000 });
                await sleep(700);
                via = 'click';
                count = 1;
            } catch {
                // Banner did not react to the click; fall through to hiding
            }
        }

        // Clicking is not enough on every banner: some keep the dialog up
        // until the choice is saved. Hide whatever is still on screen.
        const hidden = await page.evaluate(selectors => {
            let n = 0;
            for (const selector of selectors) {
                for (const el of document.querySelectorAll(selector)) {
                    if (el.offsetParent === null && getComputedStyle(el).position !== 'fixed') continue;
                    el.style.setProperty('display', 'none', 'important');
                    n++;
                }
            }
            return n;
        }, CONSENT_CONTAINERS);

        if (hidden > 0) {
            via = via === 'click' ? 'click+hidden' : 'hidden';
            count += hidden;
        }

        return { dismissed: count > 0, via, label, count };
    } catch {
        // A banner we cannot dismiss is not a reason to lose the capture
        return { dismissed: false, via: 'error', label: null, count: 0 };
    }
}

/**
 * Managed challenges usually clear themselves in a few seconds. Poll until the
 * interstitial goes away, so we do not photograph the challenge page.
 * @param {Object} page
 * @returns {Promise<{blocked: boolean, reason: string|null, waited: boolean}>}
 */
async function waitOutChallenge(page) {
    let waited = false;

    for (let elapsed = 0; elapsed <= CHALLENGE_TIMEOUT; elapsed += CHALLENGE_POLL) {
        const { blocked, reason } = await detectChallenge(page);
        if (!blocked) return { blocked: false, reason: null, waited };

        if (elapsed === 0) {
            console.log('    Bot check detected, waiting for it to clear...');
            waited = true;
        }
        await sleep(CHALLENGE_POLL);
    }

    return { ...await detectChallenge(page), waited };
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
export async function captureScreenshot(url, sourceId, options = {}) {
    const capturedAt = new Date().toISOString();
    const filename = `${timestampSlug()}.png`;

    let browser;
    try {
        if (!/^https?:\/\//i.test(url)) {
            throw new Error('only http(s) URLs can be captured');
        }

        browser = await launchBrowser(sourceId);
        const page = await browser.newPage();

        await page.setUserAgent(USER_AGENT);
        await page.setViewport(VIEWPORT);
        await page.setDefaultNavigationTimeout(BROWSER_TIMEOUT);

        await page.goto(url, {
            waitUntil: 'networkidle2',
            timeout: BROWSER_TIMEOUT
        });

        // Let fonts and lazy images settle before measuring the page
        await page.evaluate(() => document.fonts?.ready).catch(() => {});
        await sleep(750);

        const challenge = await waitOutChallenge(page);
        if (challenge.blocked) {
            // Do not archive the challenge page: it looks like the site but is
            // not, and it would poison the before/after comparison.
            return {
                path: null,
                capturedAt,
                blocked: true,
                reason: challenge.reason,
                error: `bot check not cleared (${challenge.reason})`
            };
        }

        // The banner sits exactly where the interesting content is
        if (options.consent !== false) {
            const consent = await dismissConsent(page);
            if (consent.dismissed) {
                console.log(`    Cookie banner ${consent.via === 'click'
                    ? `dismissed ("${consent.label}")`
                    : consent.via}`);
                await sleep(400);
            }
        }

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
            blocked: false,
            reason: null,
            error: null
        };
    } catch (error) {
        return { path: null, capturedAt, blocked: false, reason: null, error: error.message };
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
 * Retention policy, applied in tiers:
 *
 *   0. never delete anything api/<id>/history.json still points at, that
 *      would leave broken before/after images on the timeline
 *   1. keep the newest `keepRecent` screenshots
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
 * @param {{keepRecent?: number, keepDaily?: number, maxTotal?: number, protected?: Set<string>|Array<string>}} [options]
 *        `protected` holds repo-relative paths, as stored in history.json
 * @returns {string[]} paths that were deleted
 */
export function pruneScreenshots(shots, options = {}) {
    const {
        keepRecent = 24,
        keepDaily = 30,
        maxTotal = 40,
        protected: pinned = new Set()
    } = options;

    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;
    const pinnedPaths = pinned instanceof Set ? pinned : new Set(pinned);
    const removed = [];

    const remove = shot => {
        if (pinnedPaths.has(shot.path)) return;
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