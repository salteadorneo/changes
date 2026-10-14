import { test, describe } from 'node:test';
import assert from 'node:assert';
import { loadLanguage, resolveShots } from './html.js';

describe('resolveShots', () => {
    // Newest first, as stored on disk
    const check = (status, screenshot) => ({ status, screenshot, timestamp: '2026-10-14T12:00:00Z' });

    test('each check shows its own capture when it took one', () => {
        const result = resolveShots([
            check('changed', 'c.png'),
            check('changed', 'b.png'),
            check('unchanged', 'a.png')
        ]);

        assert.deepEqual(result.map(e => e.shown), ['c.png', 'b.png', 'a.png']);
    });

    test('a check with no capture reuses the one that was in effect', () => {
        const result = resolveShots([
            check('unchanged', null),
            check('unchanged', null),
            check('changed', 'b.png')
        ]);

        // The newest checks predate... no: b.png is the last capture before
        // them, so both must show it.
        assert.deepEqual(result.map(e => e.shown), ['b.png', 'b.png', 'b.png']);
    });

    test('picks the capture at or before each check, not a later one', () => {
        const result = resolveShots([
            check('unchanged', null),   // newest, no capture
            check('changed', 'b.png'),  // captured here
            check('unchanged', null),
            check('changed', 'a.png')
        ]);

        assert.deepEqual(result.map(e => e.shown), ['b.png', 'b.png', 'a.png', 'a.png']);
    });

    test('leaves earlier entries empty when no capture exists yet', () => {
        const result = resolveShots([
            check('unchanged', null),
            check('unchanged', null),
            check('changed', 'first.png')
        ].reverse());

        // reversed() makes 'first.png' the newest entry
        assert.equal(result[0].shown, 'first.png');
    });

    test('handles an empty log', () => {
        assert.deepEqual(resolveShots([]), []);
    });

    test('does not mutate the input', () => {
        const input = [check('changed', 'a.png')];
        resolveShots(input);

        assert.equal(input[0].shown, undefined);
    });
});

describe('loadLanguage', () => {
    test('loads a shipped language', () => {
        const es = loadLanguage('es');
        assert.equal(es.changes, 'cambios');
    });

    test('falls back to English for an unknown language', () => {
        assert.equal(loadLanguage('xx').changes, 'changes');
    });

    test('every shipped language defines the same keys', () => {
        const es = Object.keys(loadLanguage('es')).sort();
        const en = Object.keys(loadLanguage('en')).sort();

        assert.deepEqual(es, en);
    });

    test('has no blank strings', () => {
        for (const language of ['es', 'en']) {
            for (const [key, value] of Object.entries(loadLanguage(language))) {
                assert.ok(typeof value === 'string' && value.trim(), `${language}.${key} is empty`);
            }
        }
    });
});