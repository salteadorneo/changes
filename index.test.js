import { test, describe } from 'node:test';
import assert from 'node:assert';
import { formatDate, getCurrentMonth } from './lib/utils.js';

describe('Utils', () => {
    test('formatDate should format date correctly', () => {
        const date = new Date('2026-01-30T10:00:00Z');
        const formatted = formatDate(date, 'en');
        assert.ok(formatted.includes('01'));
        assert.ok(formatted.includes('30'));
    });

    test('getCurrentMonth should return YYYY-MM format', () => {
        const month = getCurrentMonth();
        assert.match(month, /^\d{4}-\d{2}$/);
    });

    test('formatDate should support Spanish locale', () => {
        const date = new Date('2026-01-30T10:00:00Z');
        const formatted = formatDate(date, 'es');
        assert.ok(formatted.includes('30'));
    });
});
