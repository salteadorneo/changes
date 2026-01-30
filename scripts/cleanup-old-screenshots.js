#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const KEEP_DASHBOARD = 5;
const KEEP_SOURCES = 3;

function cleanupScreenshots(dir, pattern, keep) {
    if (!fs.existsSync(dir)) {
        return;
    }

    const files = fs.readdirSync(dir)
        .filter(f => f.match(pattern) && f.endsWith('.png'))
        .map(f => ({
            name: f,
            path: path.join(dir, f),
            time: fs.statSync(path.join(dir, f)).mtime.getTime()
        }))
        .sort((a, b) => b.time - a.time);

    for (let i = keep; i < files.length; i++) {
        try {
            fs.unlinkSync(files[i].path);
            console.log(`Deleted: ${files[i].name}`);
        } catch (error) {
            console.error(`Failed to delete ${files[i].name}:`, error.message);
        }
    }
}

// Cleanup dashboard screenshots
const screenshotsDir = path.join(__dirname, '..', 'screenshots');
cleanupScreenshots(screenshotsDir, /^dashboard-/, KEEP_DASHBOARD);

// Cleanup source screenshots
const sourcesDir = path.join(screenshotsDir, 'sources');
if (fs.existsSync(sourcesDir)) {
    const sources = fs.readdirSync(sourcesDir, { withFileTypes: true })
        .filter(d => d.isFile())
        .map(f => f.name.split('-')[0])
        .filter((v, i, a) => a.indexOf(v) === i);

    sources.forEach(sourceId => {
        cleanupScreenshots(sourcesDir, new RegExp(`^${sourceId}-`), KEEP_SOURCES);
    });
}

console.log('Screenshot cleanup completed');
