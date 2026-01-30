import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Save screenshot/snapshot of the dashboard (as HTML archive)
 * @param {string} htmlContent - The HTML content to capture
 * @param {string} filename - Output filename
 * @returns {Promise<{success: boolean, path: string, error: string|null}>}
 */
export async function captureScreenshot(htmlContent, filename = 'dashboard.html') {
    try {
        const screenshotsDir = path.join(__dirname, '..', 'screenshots');
        if (!fs.existsSync(screenshotsDir)) {
            fs.mkdirSync(screenshotsDir, { recursive: true });
        }

        const filepath = path.join(screenshotsDir, filename);
        fs.writeFileSync(filepath, htmlContent, 'utf-8');

        return {
            success: true,
            path: filepath,
            error: null
        };
    } catch (error) {
        return {
            success: false,
            path: null,
            error: error.message
        };
    }
}

/**
 * Generate timestamped screenshot filename
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

    return `dashboard-${year}-${month}-${day}-${hours}-${minutes}-${seconds}.html`;
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
            .filter(f => f.startsWith('dashboard-') && f.endsWith('.html'))
            .map(f => ({
                name: f,
                path: `screenshots/${f}`
            }))
            .sort((a, b) => b.name.localeCompare(a.name));
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
            .filter(f => f.startsWith('dashboard-') && f.endsWith('.html'))
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
