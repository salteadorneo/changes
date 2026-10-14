import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
    issueBody,
    issueTitle,
    loadSources,
    pendingChange,
    renderDiff,
    resolveSiteUrl
} from './notify.js';
import { generateId } from '../lib/utils.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const TEST_ID = 'notify-test-source';
const apiDir = path.join(ROOT, 'api', TEST_ID);

const SOURCE = { id: TEST_ID, name: 'Test Source', url: 'https://example.com' };

function writeState({ status = 'changed', hash = 'abc123', notifiedHash = null, history = [] } = {}) {
    fs.mkdirSync(apiDir, { recursive: true });

    fs.writeFileSync(path.join(apiDir, 'status.json'), JSON.stringify({
        status,
        currentHash: hash,
        previousHash: 'old999',
        timestamp: '2026-10-14T10:00:00.000Z'
    }));

    fs.writeFileSync(path.join(apiDir, 'history.json'), JSON.stringify(history));

    if (notifiedHash) {
        fs.writeFileSync(path.join(apiDir, 'notified.json'), JSON.stringify({ hash: notifiedHash }));
    }
}

describe('renderDiff', () => {
    test('renders add, remove and context lines', () => {
        const output = renderDiff([
            { type: 'same', line: 'precio: 10' },
            { type: 'remove', line: 'precio: 10' },
            { type: 'add', line: 'precio: 8' }
        ], 'es');

        assert.match(output, /^```diff\n/);
        assert.match(output, /\n  precio: 10\n/);
        assert.match(output, /\n- precio: 10\n/);
        assert.match(output, /\n\+ precio: 8\n/);
        assert.match(output, /\n```$/);
    });

    test('summarises skipped runs and truncation', () => {
        assert.match(renderDiff([{ type: 'skip', count: 46 }], 'es'), /46 l[ií]neas sin cambios/);
        assert.match(
            renderDiff([{ type: 'truncated', oldCount: 5000, newCount: 6000 }], 'es'),
            /5000 -> 6000/
        );
    });

    test('says so when there is no diff data', () => {
        assert.match(renderDiff(null, 'es'), /Sin datos de diff/);
        assert.match(renderDiff([], 'es'), /Sin datos de diff/);
    });

    test('truncates long diffs and says it did', () => {
        const long = Array.from({ length: 200 }, (_, i) => ({ type: 'add', line: `linea ${i}` }));
        const output = renderDiff(long, 'es', 10);

        assert.match(output, /recortado/);
        assert.ok(output.split('\n').length < 20);
    });

    test('follows the configured language', () => {
        const diff = [{ type: 'skip', count: 3 }];

        assert.match(renderDiff(diff, 'es'), /l[ií]neas sin cambios/);
        assert.match(renderDiff(diff, 'en'), /unchanged lines/);
        assert.match(renderDiff([], 'en'), /No diff data/);
    });
});

describe('issue formatting', () => {
    const change = {
        timestamp: '2026-10-14T10:00:00.000Z',
        hash: 'abcdef0123456789',
        previousHash: '9999999999999999',
        diff: [{ type: 'add', line: 'nuevo' }],
        screenshot: 'screenshots/x/new.png',
        previousScreenshot: 'screenshots/x/old.png'
    };

    test('the title carries a machine-readable source marker', () => {
        assert.equal(
            issueTitle(SOURCE, 'es'),
            '[changes:notify-test-source] Test Source - cambio detectado'
        );
        assert.equal(
            issueTitle(SOURCE, 'en'),
            '[changes:notify-test-source] Test Source - change detected'
        );
    });

    test('the body links before/after shots and the timeline', () => {
        const body = issueBody(SOURCE, change, 'https://example.com', 'es');

        assert.match(body, /https:\/\/example\.com\/screenshots\/x\/old\.png/);
        assert.match(body, /https:\/\/example\.com\/screenshots\/x\/new\.png/);
        assert.match(body, /https:\/\/example\.com\/source\/notify-test-source\.html/);
        assert.match(body, /abcdef012345/);
        assert.match(body, /\+ nuevo/);
    });

    test('the body is translated', () => {
        const es = issueBody(SOURCE, change, 'https://example.com', 'es');
        const en = issueBody(SOURCE, change, 'https://example.com', 'en');

        assert.match(es, /\*\*Fuente:\*\*/);
        assert.match(en, /\*\*Source:\*\*/);
        assert.match(es, /\*\*Antes:\*\*/);
        assert.match(en, /\*\*Before:\*\*/);
    });

    test('marks only the missing half of the pair', () => {
        const body = issueBody(SOURCE, { ...change, previousScreenshot: null }, 'https://example.com', 'es');

        assert.match(body, /Antes:\*\* _Sin captura_/);
        assert.match(body, /Despu.*s:\*\* \[ver\]/);
    });

    test('omits the screenshot section entirely when there are none', () => {
        const body = issueBody(SOURCE, { ...change, screenshot: null, previousScreenshot: null }, 'https://example.com', 'es');

        assert.doesNotMatch(body, /Capturas/);
        assert.match(body, /### Diff/);
    });

    test('works without a site url, falling back to relative paths', () => {
        const body = issueBody(SOURCE, change, '', 'es');

        assert.match(body, /\[ver\]\(screenshots\/x\/new\.png\)/);
        assert.doesNotMatch(body, /\[ver\]\(https/);
    });
});

describe('resolveSiteUrl', () => {
    const emptyRoot = path.join(__dirname, 'no-such-root');

    test('prefers SITE_URL and strips trailing slashes', () => {
        assert.equal(resolveSiteUrl({ SITE_URL: 'https://x.dev/' }, emptyRoot), 'https://x.dev');
    });

    test('prefers a CNAME over the Pages convention', () => {
        assert.equal(
            resolveSiteUrl({ GITHUB_REPOSITORY: 'octocat/monitor' }, ROOT),
            'https://changes.salteadorneo.dev'
        );
    });

    test('falls back to the GitHub Pages convention', () => {
        assert.equal(
            resolveSiteUrl({ GITHUB_REPOSITORY: 'octocat/monitor' }, emptyRoot),
            'https://octocat.github.io/monitor'
        );
    });

    test('gives up quietly with nothing to go on', () => {
        assert.equal(resolveSiteUrl({}, emptyRoot), '');
    });
});

describe('pendingChange', () => {
    beforeEach(() => fs.mkdirSync(apiDir, { recursive: true }));
    afterEach(() => fs.rmSync(apiDir, { recursive: true, force: true }));

    test('reports a change that was never notified', () => {
        writeState({ hash: 'abc123' });

        const result = pendingChange(SOURCE);
        assert.ok(result);
        assert.equal(result.change.hash, 'abc123');
        assert.equal(result.source.id, TEST_ID);
    });

    test('stays silent when the same hash was already reported', () => {
        writeState({ hash: 'abc123', notifiedHash: 'abc123' });

        assert.equal(pendingChange(SOURCE), null);
    });

    test('stays silent when nothing changed', () => {
        writeState({ status: 'unchanged', hash: 'abc123' });

        assert.equal(pendingChange(SOURCE), null);
    });

    test('stays silent for a source with no state at all', () => {
        assert.equal(pendingChange({ id: 'never-configured', name: 'x', url: '' }), null);
    });

    test('picks the matching entry out of the history', () => {
        writeState({
            hash: 'newest',
            history: [
                { hash: 'oldest', timestamp: '2026-01-01T00:00:00.000Z', diff: null },
                { hash: 'newest', timestamp: '2026-10-14T00:00:00.000Z', diff: [{ type: 'add', line: 'x' }] }
            ]
        });

        const result = pendingChange(SOURCE);
        assert.equal(result.change.timestamp, '2026-10-14T00:00:00.000Z');
        assert.equal(result.change.diff.length, 1);
    });

    test('falls back to status.json when history has no match', () => {
        writeState({ hash: 'orphan', history: [{ hash: 'other' }] });

        const result = pendingChange(SOURCE);
        assert.equal(result.change.timestamp, '2026-10-14T10:00:00.000Z');
        assert.equal(result.change.previousHash, 'old999');
    });
});

describe('loadSources', () => {
    test('derives every id exactly the way index.js does', () => {
        const sources = loadSources();

        assert.ok(sources.length > 0, 'config.yml should expose at least one source');
        for (const source of sources) {
            assert.equal(source.id, generateId(source.name), `"${source.name}" id mismatch`);
            assert.ok(source.url, `"${source.name}" has no url`);
        }
    });

    test('ids are usable as filenames', () => {
        for (const source of loadSources()) {
            assert.doesNotMatch(source.id, /[^a-z0-9-]/);
            assert.ok(!source.id.startsWith('-') && !source.id.endsWith('-'));
        }
    });
});