import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { shouldCapture } from '../index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const TEST_ID = 'capture-test-source';
const shotDir = path.join(ROOT, 'screenshots', TEST_ID);

const SOURCE = {
    id: TEST_ID,
    name: 'Capture Test',
    url: 'https://example.com',
    screenshots: true
};

describe('shouldCapture', () => {
    beforeEach(() => fs.mkdirSync(shotDir, { recursive: true }));
    afterEach(() => fs.rmSync(shotDir, { recursive: true, force: true }));

    function existingShots(count) {
        for (let i = 0; i < count; i++) {
            const d = new Date(Date.now() - i * 3600000);
            fs.writeFileSync(path.join(shotDir, `${d.toISOString().replace(/[:.]/g, '-').slice(0, -5)}.png`), 'x');
        }
    }

    test('first run captures the initial thumbnail', () => {
        const decision = shouldCapture(SOURCE, 'unchanged');

        assert.equal(decision.capture, true);
        assert.equal(decision.reason, 'initial');
    });

    test('does not capture again while nothing changes', () => {
        existingShots(1);

        const decision = shouldCapture(SOURCE, 'unchanged');
        assert.equal(decision.capture, false);
        assert.equal(decision.reason, 'no-change');
    });

    test('a change always captures, even with screenshots already stored', () => {
        existingShots(5);

        const decision = shouldCapture(SOURCE, 'changed');
        assert.equal(decision.capture, true);
        assert.equal(decision.reason, 'change');
    });

    test('one screenshot is enough to stop the initial capture', () => {
        existingShots(1);

        assert.equal(shouldCapture(SOURCE, 'unchanged').capture, false);
    });

    test('honours screenshots: false', () => {
        const decision = shouldCapture({ ...SOURCE, screenshots: false }, 'changed');

        assert.equal(decision.capture, false);
        assert.equal(decision.reason, 'disabled');
    });

    test('skips sources that are not http', () => {
        const decision = shouldCapture({ ...SOURCE, url: 'ftp://example.com' }, 'changed');

        assert.equal(decision.capture, false);
        assert.equal(decision.reason, 'not-http');
    });

    test('a missing url never captures', () => {
        assert.equal(shouldCapture({ ...SOURCE, url: undefined }, 'unchanged').reason, 'not-http');
    });

    test('retries after a capture that was blocked by a bot check', () => {
        existingShots(1);

        const decision = shouldCapture(SOURCE, 'unchanged', 'blocked');
        assert.equal(decision.capture, true);
        assert.equal(decision.reason, 'retry-blocked');
    });

    test('retries after a capture that failed outright', () => {
        existingShots(1);

        assert.equal(shouldCapture(SOURCE, 'unchanged', 'failed').reason, 'retry-failed');
    });

    test('does not retry when the last capture was fine', () => {
        existingShots(1);

        assert.equal(shouldCapture(SOURCE, 'unchanged', 'ok').capture, false);
        assert.equal(shouldCapture(SOURCE, 'unchanged', 'skipped').capture, false);
    });
});