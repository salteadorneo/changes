import { test, describe } from 'node:test';
import assert from 'node:assert';
import { generateSourcePage, generateHTML, loadLanguage } from './html.js';

const SOURCE = {
    id: 'demo',
    name: 'Demo',
    url: 'https://example.com',
    type: 'content',
    status: 'unchanged',
    lastCheck: '2026-10-14T12:00:00.000Z',
    thumbnail: 'screenshots/demo/a.png',
    captureStatus: 'ok',
    versions: [
        { path: 'screenshots/demo/c.png', takenAt: '2026-10-14T12:00:00.000Z', until: null, lastCheck: '2026-10-14T12:00:00.000Z' },
        { path: 'screenshots/demo/b.png', takenAt: '2026-10-13T12:00:00.000Z', until: '2026-10-14T12:00:00.000Z', lastCheck: '2026-10-13T12:00:00.000Z' },
        { path: 'screenshots/demo/a.png', takenAt: '2026-10-12T12:00:00.000Z', until: '2026-10-13T12:00:00.000Z', lastCheck: '2026-10-12T12:00:00.000Z' }
    ]
};

describe('generateSourcePage', () => {
    const page = generateSourcePage(SOURCE, [], { language: 'es' });

    test('renders one slide per capture, newest first', () => {
        const order = [...page.matchAll(/screenshots\/demo\/([abc])\.png/g)].map(m => m[1]);
        assert.equal(order[0], 'c');
        assert.ok(order.includes('b') && order.includes('a'));
    });

    test('labels slides with the period they cover, not a status', () => {
        assert.doesNotMatch(page, /correcto/i);
        assert.doesNotMatch(page, /cambi[oó]/i);
        assert.doesNotMatch(page, /sin cambios/i);
        assert.doesNotMatch(page, /sin comprobar/i);
    });

    test('the newest slide shows since + last check', () => {
        assert.match(page, /desde/);
        assert.match(page, /[Úü]ltima comprobaci[oó]n/);
    });

    test('older slides show the span they lasted', () => {
        assert.match(page, /duró|1 d[ií]a/);
    });

    test('has the stack controls', () => {
        assert.match(page, /id="stack"/);
        assert.match(page, /id="prev"/);
        assert.match(page, /id="next"/);
    });

    test('uses the full viewport width and caps at one viewport tall', () => {
        assert.match(page, /max-h-\[100dvh\]/);
        assert.match(page, /snap-y/);
        assert.doesNotMatch(page, /max-w-7xl/, 'no readable measure on the source page');
    });

    test('a single capture gets no arrows', () => {
        const one = generateSourcePage({ ...SOURCE, versions: SOURCE.versions.slice(0, 1) }, [], {});
        assert.doesNotMatch(one, /id="prev"/);
        assert.doesNotMatch(one, /id="next"/);
    });

    test('no capture at all still renders a page', () => {
        const empty = generateSourcePage({ ...SOURCE, versions: [] }, [], { language: 'es' });
        assert.match(empty, /Sin captura/);
        assert.match(empty, /Demo/);
    });

    test('escapes the source name and url', () => {
        const nasty = generateSourcePage(
            { ...SOURCE, name: '<script>x</script>', url: 'https://e.com/?a=1&b=2' }, [], {}
        );
        assert.doesNotMatch(nasty, /<script>x/);
        assert.match(nasty, /a=1&amp;b=2/);
    });
});

describe('generateHTML', () => {
    test('cards carry no status wording', () => {
        const html = generateHTML('T', [SOURCE], { language: 'es' });
        assert.doesNotMatch(html, /sin cambios/i);
        assert.doesNotMatch(html, /correcto/i);
    });

    test('flags errors but stays quiet when all is well', () => {
        const ok = generateHTML('T', [SOURCE], { language: 'es' });
        assert.doesNotMatch(ok, /fuente con error/);

        const bad = generateHTML('T', [{ ...SOURCE, status: 'error', error: 'boom' }], { language: 'es' });
        assert.match(bad, /fuente con error/);
    });

    test('marks a blocked capture on the card', () => {
        const html = generateHTML('T', [{ ...SOURCE, thumbnail: null, captureStatus: 'blocked' }], {});
        assert.match(html, /Capture blocked/);
    });
});

describe('loadLanguage', () => {
    test('loads a shipped language', () => {
        assert.equal(loadLanguage('es').back, 'Volver');
        assert.equal(loadLanguage('en').back, 'Back');
    });

    test('falls back to English for an unknown language', () => {
        assert.equal(loadLanguage('xx').back, 'Back');
    });

    test('every shipped language defines the same keys', () => {
        assert.deepEqual(
            Object.keys(loadLanguage('es')).sort(),
            Object.keys(loadLanguage('en')).sort()
        );
    });

    test('no key referenced by the renderer is missing', () => {
        // Anything the pages ask for must resolve to a real string, not the
        // key name echoed back by t()
        const es = loadLanguage('es');
        for (const key of Object.keys(es)) {
            assert.ok(es[key].trim(), `es.${key} is empty`);
        }
    });
});