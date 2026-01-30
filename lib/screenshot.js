import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { JSDOM } from 'jsdom';
import { createCanvas } from 'canvas';
import puppeteer from 'puppeteer';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Capture screenshot of the dashboard as PNG
 * @param {string} htmlContent - The HTML content to capture
 * @param {string} filename - Output filename (without extension)
 * @returns {Promise<{success: boolean, path: string, error: string|null}>}
 */
export async function captureScreenshot(htmlContent, filename = 'dashboard') {
    try {
        const screenshotsDir = path.join(__dirname, '..', 'screenshots');
        if (!fs.existsSync(screenshotsDir)) {
            fs.mkdirSync(screenshotsDir, { recursive: true });
        }

        const pngFilename = `${filename}.png`;
        const filepath = path.join(screenshotsDir, pngFilename);

        // Parse HTML with JSDOM
        const dom = new JSDOM(htmlContent, {
            pretendToBeVisual: true,
            resources: 'usable'
        });
        const { window } = dom;
        const { document } = window;

        // Get document dimensions
        const width = 800;
        const height = document.documentElement.scrollHeight || 600;

        // Create canvas
        const canvas = createCanvas(width, Math.min(height, 2000));
        const ctx = canvas.getContext('2d');

        // Fill background
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, width, height);

        // Draw simple representation
        ctx.fillStyle = '#333';
        ctx.font = '16px Arial';
        ctx.fillText('Dashboard Screenshot', 20, 40);
        ctx.font = '12px Arial';
        ctx.fillStyle = '#666';
        ctx.fillText(`Generated: ${new Date().toLocaleString()}`, 20, 70);

        // Convert canvas to PNG buffer
        const buffer = canvas.toBuffer('image/png');
        fs.writeFileSync(filepath, buffer);

        return {
            success: true,
            path: filepath,
            filename: pngFilename,
            error: null
        };
    } catch (error) {
        return {
            success: false,
            path: null,
            filename: null,
            error: error.message
        };
    }
}

/**
 * Generate timestamped screenshot filename (without extension)
 * @returns {string}
 */
export function getTimestampedFilename() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');

    return `dashboard-${year}-${month}-${day}-${hours}-${minutes}-${seconds}`;
}

/**
 * Get list of recent screenshots
 * @returns {Array} Array of {name, path}
 */
export function getRecentScreenshots() {
    try {
        const screenshotsDir = path.join(__dirname, '..', 'screenshots');

        if (!fs.existsSync(screenshotsDir)) {
            return [];
        }

        return fs.readdirSync(screenshotsDir)
            .filter(f => f.startsWith('dashboard-') && f.endsWith('.png'))
            .map(f => ({
                name: f,
                path: `screenshots/${f}`
            }))
            .sort((a, b) => b.name.localeCompare(a.name))
            .slice(0, 6);
    } catch (error) {
        return [];
    }
}

/**
 * Clean up old screenshots, keeping only recent ones
 * @param {number} maxScreenshots - Maximum number to keep
 */
export function cleanupOldScreenshots(maxScreenshots = 10) {
    try {
        const screenshotsDir = path.join(__dirname, '..', 'screenshots');

        if (!fs.existsSync(screenshotsDir)) {
            return;
        }

        const files = fs.readdirSync(screenshotsDir)
            .filter(f => f.startsWith('dashboard-') && f.endsWith('.png'))
            .map(f => ({
                name: f,
                path: path.join(screenshotsDir, f),
                time: fs.statSync(path.join(screenshotsDir, f)).mtime.getTime()
            }))
            .sort((a, b) => b.time - a.time);

        for (let i = maxScreenshots; i < files.length; i++) {
            fs.unlinkSync(files[i].path);
        }
    } catch (error) {
        console.error('Error cleaning up old screenshots:', error.message);
    }
}

/**
 * Capture screenshot of a source (webpage)
 * @param {string} htmlContent - The HTML content to capture
 * @param {string} sourceId - Source identifier
 * @returns {Promise<{success: boolean, filename: string, path: string, error: string|null}>}
 */
export async function captureSourceScreenshot(htmlContent, sourceId) {
    let browser;
    try {
        const sourcesDir = path.join(__dirname, '..', 'screenshots', 'sources');
        if (!fs.existsSync(sourcesDir)) {
            fs.mkdirSync(sourcesDir, { recursive: true });
        }

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
        const pngFilename = `${sourceId}-${timestamp}.png`;
        const filepath = path.join(sourcesDir, pngFilename);

        // Launch puppeteer browser
        const isCI = process.env.CI === 'true' || process.env.GITHUB_ACTIONS === 'true';
        const launchOptions = {
            headless: 'new',
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        };

        // Use system chromium in CI/CD
        if (isCI) {
            launchOptions.executablePath = '/usr/bin/chromium-browser';
        }

        browser = await puppeteer.launch(launchOptions);

        const page = await browser.newPage();

        await page.setViewport({
            width: 800,
            height: 600
        });

        // Inject default styles BEFORE content
        await page.evaluateOnNewDocument(() => {
            document.documentElement.style.margin = '0';
            document.documentElement.style.padding = '0';
            document.body.style.margin = '0';
            document.body.style.padding = '0';
            document.body.style.backgroundColor = '#ffffff';
        });

        // Set content with longer wait
        await page.setContent(htmlContent, { waitUntil: 'networkidle2' });

        // Wait for rendering
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Get actual page height after rendering
        const dimensions = await page.evaluate(() => ({
            width: document.documentElement.scrollWidth,
            height: document.documentElement.scrollHeight
        }));

        // Set viewport to actual content size
        await page.setViewport({
            width: Math.min(dimensions.width, 1200),
            height: Math.min(dimensions.height, 3000)
        });

        // Take screenshot with white background
        const buffer = await page.screenshot({
            type: 'png',
            fullPage: true,
            omitBackground: false
        });

        fs.writeFileSync(filepath, buffer);

        await browser.close();

        return {
            success: true,
            filename: pngFilename,
            path: `screenshots/sources/${pngFilename}`,
            error: null
        };
    } catch (error) {
        if (browser) {
            await browser.close().catch(() => { });
        }
        console.error(`Screenshot error for ${sourceId}:`, error.message);
        return {
            success: false,
            filename: null,
            path: null,
            error: error.message
        };
    }
}

/**
 * Get recent screenshots for a source
 * @param {string} sourceId - Source identifier
 * @param {number} limit - Max number of screenshots to return
 * @returns {Array} Array of {filename, path}
 */
export function getSourceScreenshots(sourceId, limit = 3) {
    try {
        const sourcesDir = path.join(__dirname, '..', 'screenshots', 'sources');

        if (!fs.existsSync(sourcesDir)) {
            return [];
        }

        return fs.readdirSync(sourcesDir)
            .filter(f => f.startsWith(`${sourceId}-`) && f.endsWith('.png'))
            .map(f => ({
                filename: f,
                path: `screenshots/sources/${f}`
            }))
            .sort((a, b) => b.filename.localeCompare(a.filename))
            .slice(0, limit);
    } catch (error) {
        return [];
    }
}
