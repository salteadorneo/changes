import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
    findBrowser,
    listScreenshots,
    pruneScreenshots,
    timestampSlug
} from './screenshot.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEST_ID = '__test__';
const testDir = path.join(__dirname, '..', 'screenshots', TEST_ID);

const DAY_MS = 24 * 60 * 60 * 1000;

function writeShots(dates) {
    for (const date of dates) {
        const file = `${timestampSlug(date)}.png`;
        fs.writeFileSync(path.join(testDir, file), 'not-a-real-png');
    }
}

function daysAgo(days, hour = 12) {
    const date = new Date(Date.now() - days * DAY_MS);
    date.setUTCHours(hour, 0, 0, 0);
    return date;
}

describe('screenshot archive', () => {
    beforeEach(() => {
        fs.mkdirSync(testDir, { recursive: true });
    });

    afterEach(() => {
        fs.rmSync(testDir, { recursive: true, force: true });
    });

    test('timestampSlug produces a filename-safe UTC slug', () => {
        const slug = timestampSlug(new Date('2026-10-14T15:30:00Z'));
        assert.equal(slug, '2026-10-14T15-30-00');
        assert.doesNotMatch(slug, /[:.]/);
    });

    test('listScreenshots parses the timestamp back out of the filename', () => {
        writeShots([new Date('2026-10-14T15:30:00Z')]);

        const shots = listScreenshots(TEST_ID);
        assert.equal(shots.length, 1);
        assert.equal(shots[0].savedAt, '2026-10-14T15:30:00.000Z');
        assert.equal(shots[0].path, `screenshots/${TEST_ID}/${shots[0].file}`);
    });

    test('listScreenshots returns newest first and ignores other files', () => {
        writeShots([
            new Date('2026-10-10T10:00:00Z'),
            new Date('2026-10-12T10:00:00Z'),
            new Date('2026-10-11T10:00:00Z')
        ]);
        fs.writeFileSync(path.join(testDir, 'notes.txt'), 'ignore me');

        const shots = listScreenshots(TEST_ID);
        assert.equal(shots.length, 3);
        assert.deepEqual(
            shots.map(s => s.savedAt.slice(0, 10)),
            ['2026-10-12', '2026-10-11', '2026-10-10']
        );
    });

    test('listScreenshots returns empty for an unknown source', () => {
        assert.deepEqual(listScreenshots('does-not-exist-at-all'), []);
    });

    test('prune keeps the most recent runs', () => {
        const dates = [5, 4, 3, 2, 1].map(d => daysAgo(d));
        writeShots(dates);

        const removed = pruneScreenshots(listScreenshots(TEST_ID), {
            keepRecent: 2,
            keepDaily: 0,
            maxTotal: 100
        });

        assert.equal(removed.length, 3);
        assert.equal(listScreenshots(TEST_ID).length, 2);
    });

    test('prune keeps one screenshot per day inside the daily window', () => {
        // Two shots per day for 4 days back
        writeShots([4, 3, 2, 1].flatMap(d => [daysAgo(d, 9), daysAgo(d, 18)]));

        const removed = pruneScreenshots(listScreenshots(TEST_ID), {
            keepRecent: 0,
            keepDaily: 2,
            maxTotal: 100
        });

        const left = listScreenshots(TEST_ID);
        assert.equal(removed.length, 6);
        // Only the two newest days survive, one screenshot each
        assert.equal(left.length, 2);
        assert.deepEqual(
            left.map(s => s.savedAt.slice(0, 10)),
            [daysAgo(1).toISOString().slice(0, 10), daysAgo(2).toISOString().slice(0, 10)]
        );
    });

    test('prune drops anything older than the daily window', () => {
        writeShots([daysAgo(40), daysAgo(39), daysAgo(1)]);

        pruneScreenshots(listScreenshots(TEST_ID), {
            keepRecent: 0,
            keepDaily: 5,
            maxTotal: 100
        });

        assert.equal(listScreenshots(TEST_ID).length, 1);
    });

    test('prune enforces the absolute cap by dropping the oldest first', () => {
        writeShots([9, 8, 7, 6, 5, 4].map(d => daysAgo(d)));

        pruneScreenshots(listScreenshots(TEST_ID), {
            keepRecent: 0,
            keepDaily: 100,
            maxTotal: 2
        });

        const left = listScreenshots(TEST_ID);
        assert.equal(left.length, 2);
        assert.deepEqual(
            left.map(s => s.savedAt.slice(0, 10)),
            [daysAgo(4).toISOString().slice(0, 10), daysAgo(5).toISOString().slice(0, 10)]
        );
    });

    test('prune is a no-op on an empty archive', () => {
        assert.deepEqual(pruneScreenshots([], {}), []);
    });

    test('prune never deletes shots that history still references', () => {
        const dates = [40, 39, 38, 37, 36].map(d => daysAgo(d));
        writeShots(dates);

        const shots = listScreenshots(TEST_ID);
        const oldest = shots[shots.length - 1];

        // Tiers would drop everything; history pins this one back in
        const removed = pruneScreenshots(shots, {
            keepRecent: 0,
            keepDaily: 0,
            maxTotal: 0,
            protected: new Set([oldest.path])
        });

        const left = listScreenshots(TEST_ID);
        assert.equal(removed.length, 4);
        assert.deepEqual(left.map(s => s.path), [oldest.path]);
    });

    test('prune accepts protected paths as an array too', () => {
        const dates = [5, 4, 3].map(d => daysAgo(d));
        writeShots(dates);

        const shots = listScreenshots(TEST_ID);
        const keep = shots[shots.length - 1].path;

        pruneScreenshots(shots, {
            keepRecent: 0,
            keepDaily: 0,
            maxTotal: 0,
            protected: [keep]
        });

        assert.equal(listScreenshots(TEST_ID).length, 1);
    });

    test('findBrowser returns a path or null without throwing', () => {
        const found = findBrowser();
        assert.ok(found === null || typeof found === 'string');
    });
});