#!/usr/bin/env node
/**
 * Opens (or comments on) a GitHub Issue whenever a monitored source changes.
 *
 * Issues double as the notification channel: GitHub emails you when an issue
 * is opened or commented, so no extra service is needed.
 *
 * At most one OPEN issue exists per source. If a change arrives while an
 * alert is still open, the script comments on it and closes it, so every
 * change notifies but the issue list never piles up.
 *
 * Idempotent: api/<id>/notified.json records the last hash we reported, so a
 * re-run of the same change does not notify twice.
 *
 * Env:
 *   GITHUB_TOKEN        required, otherwise the script skips
 *   GITHUB_REPOSITORY   owner/repo, injected by Actions
 *   SITE_URL            optional, base URL of the deployed site
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { parseYAML } from '../lib/yaml-parser.js';
import { generateId } from '../lib/utils.js';
import { loadLanguage } from '../lib/html.js';

const LABEL = 'changes';
const MAX_DIFF_LINES = 40;

/**
 * Title carries a machine-readable marker so we can match our own issues
 * without creating one label per source.
 */
export function issueTitle(source, language = 'en') {
    const strings = loadLanguage(language);
    return `[${LABEL}:${source.id}] ${source.name} - ${strings.issueSuffix}`;
}

export function issueBody(source, change, siteUrl, language = 'en') {
    const s = loadLanguage(language);
    const link = path => (siteUrl ? `${siteUrl}/${path}` : path);
    const lines = [];

    lines.push(`## ${source.name}`, '');
    lines.push(`- **${s.issueSource}:** ${source.url}`);

    if (source.selector) lines.push(`- **${s.issueSelector}:** \`${source.selector}\``);
    if (source.jsonPath) lines.push(`- **${s.jsonPath}:** \`${source.jsonPath}\``);

    lines.push(`- **${s.issueDetected}:** ${change.timestamp}`);

    if (change.previousHash || change.hash) {
        lines.push(`- **${s.hash}:** \`${short(change.previousHash)}\` -> \`${short(change.hash)}\``);
    }

    if (siteUrl) {
        lines.push(`- **${s.issueTimeline}:** ${link(`source/${source.id}.html`)}`);
    }

    if (change.screenshot || change.previousScreenshot) {
        lines.push('', `### ${s.issueScreenshots}`, '');
        const cell = (label, shot) =>
            shot ? `**${label}:** [${s.issueView}](${link(shot)})` : `**${label}:** _${s.noCapture}_`;
        lines.push(`- ${cell(s.before, change.previousScreenshot)}`);
        lines.push(`- ${cell(s.after, change.screenshot)}`);
    }

    lines.push('', `### ${s.issueDiff}`, '', renderDiff(change.diff, language));

    return lines.join('\n');
}

function short(hash) {
    return hash ? String(hash).slice(0, 12) : '-';
}

/**
 * Render the stored line diff as a fenced block, trimmed to keep issues short.
 */
export function renderDiff(diff, language = 'en', maxLines = MAX_DIFF_LINES) {
    const s = loadLanguage(language);

    if (!Array.isArray(diff) || diff.length === 0) {
        return `_${s.issueNoDiff}_`;
    }

    const out = [];

    for (const entry of diff) {
        if (out.length >= maxLines) {
            out.push('... diff recortado, consulta el timeline completo');
            break;
        }

        switch (entry.type) {
            case 'skip':
                out.push(`... ${entry.count} ${entry.count === 1 ? s.unchangedLine : s.unchangedLines}`);
                break;
            case 'add':
                out.push(`+ ${entry.line}`);
                break;
            case 'remove':
                out.push(`- ${entry.line}`);
                break;
            case 'truncated':
                out.push(`[${s.diffTooLong}: ${entry.oldCount} -> ${entry.newCount}]`);
                break;
            default:
                out.push(`  ${entry.line}`);
        }
    }

    return ['```diff', ...out, '```'].join('\n');
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.join(__dirname, '..');

function readJSON(file, fallback) {
    if (!fs.existsSync(file)) return fallback;
    try {
        return JSON.parse(fs.readFileSync(file, 'utf-8'));
    } catch {
        return fallback;
    }
}

function writeJSON(file, data) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf-8');
}

/**
 * Resolve the public base URL of the deployed site.
 * A CNAME in the repo wins over the GitHub Pages convention, since it is an
 * explicit statement of the public address.
 *
 * @param {Object} [env]
 * @param {string} [root] repository root, overridable for tests
 * @returns {string} without a trailing slash, possibly ''
 */
export function resolveSiteUrl(env = process.env, root = ROOT) {
    if (env.SITE_URL) return env.SITE_URL.replace(/\/+$/, '');

    const cname = path.join(root, 'CNAME');
    if (fs.existsSync(cname)) {
        const domain = fs.readFileSync(cname, 'utf-8').trim();
        if (domain) return `https://${domain}`;
    }

    if (env.GITHUB_REPOSITORY) {
        const [owner, repo] = env.GITHUB_REPOSITORY.split('/');
        return `https://${owner}.github.io/${repo}`;
    }

    return '';
}

class GitHub {
    constructor(token, repository, apiUrl) {
        this.token = token;
        this.repository = repository;
        this.apiUrl = apiUrl.replace(/\/+$/, '');
    }

    async request(method, endpoint, body) {
        const response = await fetch(`${this.apiUrl}${endpoint}`, {
            method,
            headers: {
                Authorization: `Bearer ${this.token}`,
                Accept: 'application/vnd.github+json',
                'X-GitHub-Api-Version': '2022-11-28',
                'Content-Type': 'application/json'
            },
            body: body ? JSON.stringify(body) : undefined
        });

        if (!response.ok) {
            const detail = await response.text().catch(() => '');
            throw new Error(`${method} ${endpoint} -> ${response.status} ${detail.slice(0, 200)}`);
        }

        return response.status === 204 ? null : response.json();
    }

    ensureLabel() {
        return this.request('POST', `/repos/${this.repository}/labels`, {
            name: LABEL,
            color: '0e8a16',
            description: 'Opened automatically by Changes Monitor'
        }).catch(() => null); // already exists, or labels disabled
    }

    openIssues() {
        return this.request('GET', `/repos/${this.repository}/issues?state=open&labels=${LABEL}&per_page=100`);
    }

    createIssue(title, body) {
        return this.request('POST', `/repos/${this.repository}/issues`, {
            title,
            body,
            labels: [LABEL]
        });
    }

    comment(issueNumber, body) {
        return this.request('POST', `/repos/${this.repository}/issues/${issueNumber}/comments`, { body });
    }

    close(issueNumber) {
        return this.request('PATCH', `/repos/${this.repository}/issues/${issueNumber}`, {
            state: 'closed'
        });
    }
}

/**
 * Read the configured UI language so the issue matches the site.
 * @returns {string}
 */
export function loadConfigLanguage() {
    const ymlPath = path.join(ROOT, 'config.yml');
    const jsonPath = path.join(ROOT, 'config.json');

    if (fs.existsSync(ymlPath)) {
        try {
            return parseYAML(fs.readFileSync(ymlPath, 'utf-8')).language || 'en';
        } catch {
            return 'en';
        }
    }
    if (fs.existsSync(jsonPath)) {
        return readJSON(jsonPath, {}).language || 'en';
    }
    return 'en';
}

/**
 * Read the monitored sources from config.yml (falling back to the api/
 * directories so the script still works if the config is unreadable).
 * @returns {Array<{id: string, name: string, url: string, selector?: string, jsonPath?: string}>}
 */
export function loadSources() {
    const ymlPath = path.join(ROOT, 'config.yml');
    const jsonPath = path.join(ROOT, 'config.json');

    let config = null;
    if (fs.existsSync(ymlPath)) {
        config = parseYAML(fs.readFileSync(ymlPath, 'utf-8'));
    } else if (fs.existsSync(jsonPath)) {
        config = readJSON(jsonPath, {});
    }

    if (Array.isArray(config?.sources) && config.sources.length > 0) {
        return config.sources.map(source => ({
            id: source.id || generateId(source.name),
            name: source.name,
            url: source.url,
            selector: source.selector,
            jsonPath: source.jsonPath
        }));
    }

    const apiDir = path.join(ROOT, 'api');
    if (!fs.existsSync(apiDir)) return [];

    return fs.readdirSync(apiDir)
        .filter(entry => fs.statSync(path.join(apiDir, entry)).isDirectory())
        .map(id => ({ id, name: id, url: '' }));
}

/**
 * Decide whether a source has an unreported change.
 * @param {{id: string, name: string, url: string}} source
 * @returns {null|{source: object, change: object}} null when there is nothing new
 */
export function pendingChange(source) {
    const dir = path.join(ROOT, 'api', source.id);

    const status = readJSON(path.join(dir, 'status.json'), null);
    if (!status || status.status !== 'changed' || !status.currentHash) return null;

    const notified = readJSON(path.join(dir, 'notified.json'), { hash: null });
    if (notified.hash === status.currentHash) return null;

    const history = readJSON(path.join(dir, 'history.json'), []);
    const change = history.find(entry => entry.hash === status.currentHash) || {
        timestamp: status.timestamp,
        hash: status.currentHash,
        previousHash: status.previousHash,
        diff: null
    };

    return { source, change };
}

export async function main(env = process.env, log = console.log) {
    if (!env.GITHUB_TOKEN) {
        log('GITHUB_TOKEN not set, skipping notifications');
        return;
    }
    if (!env.GITHUB_REPOSITORY) {
        log('GITHUB_REPOSITORY not set, skipping notifications');
        return;
    }

    const github = new GitHub(
        env.GITHUB_TOKEN,
        env.GITHUB_REPOSITORY,
        env.GITHUB_API_URL || 'https://api.github.com'
    );

    const siteUrl = resolveSiteUrl(env);
    const sources = loadSources();
    const language = loadConfigLanguage();
    const pending = sources.map(pendingChange).filter(Boolean);

    if (pending.length === 0) {
        log('No new changes to report');
        return;
    }

    await github.ensureLabel();
    const open = await github.openIssues();

    for (const { source, change } of pending) {
        const title = issueTitle(source, language);
        const body = issueBody(source, change, siteUrl, language);

        try {
            const existing = open.find(issue => issue.title === title);

            if (existing) {
                await github.comment(existing.number, body);
                await github.close(existing.number);
                log(`${source.id}: commented on #${existing.number} and closed it`);
            } else {
                const created = await github.createIssue(title, body);
                log(`${source.id}: opened #${created.number}`);
            }

            writeJSON(path.join(ROOT, 'api', source.id, 'notified.json'), {
                hash: change.hash,
                notifiedAt: new Date().toISOString(),
                title
            });
        } catch (error) {
            log(`${source.id}: notification failed - ${error.message}`);
        }
    }
}

// Only run when executed directly, so the helpers stay testable
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    main().catch(error => {
        console.error('notify failed:', error.message);
        process.exit(1);
    });
}