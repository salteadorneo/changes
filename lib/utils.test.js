import { test, describe } from 'node:test';
import assert from 'node:assert';
import {
    formatBytes,
    formatDuration,
    formatRelative,
    generateId
} from './utils.js';

const NOW = new Date('2026-10-14T12:00:00Z');

function ago(seconds) {
    return new Date(NOW.getTime() - seconds * 1000).toISOString();
}

describe('formatRelative', () => {
    test('very recent reads as "now"', () => {
        assert.equal(formatRelative(ago(5), 'es', NOW), 'ahora mismo');
        assert.equal(formatRelative(ago(5), 'en', NOW), 'just now');
    });

    test('picks the right unit and plural', () => {
        assert.equal(formatRelative(ago(120), 'es', NOW), 'hace 2 minutos');
        assert.equal(formatRelative(ago(3600 * 5), 'es', NOW), 'hace 5 horas');
        assert.equal(formatRelative(ago(86400 * 3), 'es', NOW), 'hace 3 días');
        assert.equal(formatRelative(ago(86400 * 60), 'es', NOW), 'hace 2 meses');
    });

    test('uses the singular for exactly one', () => {
        assert.equal(formatRelative(ago(86400), 'es', NOW), 'hace 1 día');
        assert.equal(formatRelative(ago(86400), 'en', NOW), '1 day ago');
    });

    test('works in English too', () => {
        assert.equal(formatRelative(ago(3600 * 2), 'en', NOW), '2 hours ago');
        assert.equal(formatRelative(ago(120), 'en', NOW), '2 minutes ago');
    });

    test('accepts a Date as well as an ISO string', () => {
        assert.equal(formatRelative(new Date(ago(120)), 'es', NOW), 'hace 2 minutos');
    });

    test('does not blow up on junk', () => {
        assert.equal(formatRelative('not a date', 'es', NOW), '-');
        assert.equal(formatRelative(undefined, 'es', NOW), '-');
    });

    test('falls back to English for an unknown language', () => {
        assert.equal(formatRelative(ago(120), 'fr', NOW), '2 minutes ago');
    });
});

describe('formatBytes', () => {
    test('scales units and keeps bytes readable', () => {
        assert.equal(formatBytes(0), '0 B');
        assert.equal(formatBytes(512), '512 B');
        assert.equal(formatBytes(1024), '1.0 kB');
        assert.equal(formatBytes(162018), '158 kB');
        assert.equal(formatBytes(1536), '1.5 kB');
        assert.equal(formatBytes(5 * 1024 * 1024), '5.0 MB');
        assert.equal(formatBytes(3 * 1024 * 1024 * 1024), '3.0 GB');
    });

    test('rejects nonsense', () => {
        assert.equal(formatBytes(-1), '-');
        assert.equal(formatBytes('x'), '-');
        assert.equal(formatBytes(undefined), '-');
    });
});

describe('formatDuration', () => {
    test('switches from ms to seconds', () => {
        assert.equal(formatDuration(178), '178 ms');
        assert.equal(formatDuration(999), '999 ms');
        assert.equal(formatDuration(1000), '1.0 s');
        assert.equal(formatDuration(2340), '2.3 s');
    });

    test('rejects nonsense', () => {
        assert.equal(formatDuration(-5), '-');
        assert.equal(formatDuration(null), '-');
    });
});

describe('generateId', () => {
    test('slugifies names', () => {
        assert.equal(generateId('Estopa'), 'estopa');
        assert.equal(generateId('Precio Oferta 2026'), 'precio-oferta-2026');
        assert.equal(generateId('  spaces  '), 'spaces');
    });

    test('does not leave dangling separators', () => {
        assert.equal(generateId('Precio Oferta 2026!'), 'precio-oferta-2026');
        assert.equal(generateId('!!!'), '');
        assert.equal(generateId('-already-slug-'), 'already-slug');
    });
});