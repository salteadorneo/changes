import { test, describe } from 'node:test';
import assert from 'node:assert';
import { parseYAML } from './yaml-parser.js';

describe('parseYAML', () => {
    test('parses scalars and coerces types', () => {
        const result = parseYAML([
            'title: Change Monitor',
            'enabled: true',
            'disabled: false',
            'missing: null',
            'count: 42',
            'quoted: "12"'
        ].join('\n'));

        assert.equal(result.title, 'Change Monitor');
        assert.equal(result.enabled, true);
        assert.equal(result.disabled, false);
        assert.equal(result.missing, null);
        assert.equal(result.count, 42);
        assert.equal(result.quoted, '12');
    });

    test('ignores comments and blank lines', () => {
        const result = parseYAML([
            '# a comment',
            '',
            'title: Hello   # trailing comment',
            '   ',
            'language: es'
        ].join('\n'));

        assert.equal(result.title, 'Hello');
        assert.equal(result.language, 'es');
    });

    test('keeps a "#" that is part of the value', () => {
        const result = parseYAML([
            'url: https://example.com/page#section',
            'anchor: https://example.com#top'
        ].join('\n'));

        assert.equal(result.url, 'https://example.com/page#section');
        assert.equal(result.anchor, 'https://example.com#top');
    });

    test('numeric values with a trailing comment stay numbers', () => {
        const result = parseYAML([
            'archive:',
            '  maxTotal: 40     # hard cap',
            '  keepDaily: 30'
        ].join('\n'));

        assert.deepEqual(result.archive, { maxTotal: 40, keepDaily: 30 });
    });

    test('parses a list of objects with continuation keys', () => {
        const result = parseYAML([
            'sources:',
            '  - name: First',
            '    url: https://example.com',
            '    type: html',
            '    timeout: 5000',
            '  - name: Second',
            '    url: https://other.com'
        ].join('\n'));

        assert.equal(result.sources.length, 2);
        assert.deepEqual(result.sources[0], {
            name: 'First',
            url: 'https://example.com',
            type: 'html',
            timeout: 5000
        });
        assert.deepEqual(result.sources[1], {
            name: 'Second',
            url: 'https://other.com'
        });
    });

    test('parses nested mappings instead of flattening them', () => {
        const result = parseYAML([
            'archive:',
            '  keepRecent: 24',
            '  keepDaily: 30',
            '  maxTotal: 40',
            'title: Monitor'
        ].join('\n'));

        assert.deepEqual(result.archive, {
            keepRecent: 24,
            keepDaily: 30,
            maxTotal: 40
        });
        // The block must not leak its keys to the root
        assert.equal(result.keepRecent, undefined);
        assert.equal(result.title, 'Monitor');
    });

    test('a nested block followed by a list is not confused', () => {
        const result = parseYAML([
            'archive:',
            '  maxTotal: 40',
            'sources:',
            '  - name: First',
            '    url: https://example.com'
        ].join('\n'));

        assert.deepEqual(result.archive, { maxTotal: 40 });
        assert.equal(result.sources.length, 1);
        assert.equal(result.sources[0].url, 'https://example.com');
    });

    test('the shipped example config parses into the expected shape', () => {
        const result = parseYAML([
            'title: Change Monitor Example',
            'language: en',
            'archive:',
            '  keepRecent: 24',
            '  keepDaily: 30',
            '  maxTotal: 40',
            'sources:',
            '  - name: Example API Version',
            '    url: https://api.github.com/repos/octocat/Hello-World',
            '    type: json',
            '    jsonPath: id',
            '    timeout: 10000'
        ].join('\n'));

        assert.equal(result.title, 'Change Monitor Example');
        assert.equal(result.language, 'en');
        assert.deepEqual(result.archive, { keepRecent: 24, keepDaily: 30, maxTotal: 40 });
        assert.equal(result.sources.length, 1);
        assert.equal(result.sources[0].jsonPath, 'id');
    });
});