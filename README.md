# Changes Monitor

Lightweight static change detection and monitoring system for GitHub Pages.

## Features

- **Zero dependencies** - Only Node.js built-ins
- **Static site generation** - Runs on GitHub Actions, deploys to GitHub Pages
- **Content hashing** - Detect any changes using SHA256 hashes
- **Multiple source types** - HTML (with CSS selectors), JSON, plain content
- **Multi-language support** - Spanish and English UI
- **No databases** - Everything is static files

## Quick Start

### 1. Configure Sources

Edit `config.yml` to add the sources you want to monitor:

```yaml
title: Change Monitor
language: es
sources:
  - name: Example API
    url: https://api.example.com/version.json
    type: json
    jsonPath: data.version
  
  - name: Website Version
    url: https://example.com
    type: html
    selector: .version-badge
```

### 2. Run Locally

```bash
npm install
npm run build    # Single check
npm run dev      # Watch mode
```

### 3. Deploy to GitHub Pages

The system auto-generates:
- `index.html` - Dashboard with all sources
- `api/{source-id}/status.json` - Current status for each source
- Badge SVGs for embedding in README

## Configuration

### Source Types

- **content** - Plain text content comparison
- **html** - Extract content using CSS selector
- **json** - Extract values using dot notation paths

### Example Sources

```yaml
sources:
  # Plain text content
  - name: README
    url: https://raw.githubusercontent.com/user/repo/main/README.md
    type: content
  
  # HTML with selector
  - name: Version Badge
    url: https://example.com
    type: html
    selector: "[data-version]"
  
  # JSON with path
  - name: API Version
    url: https://api.example.com/status.json
    type: json
    jsonPath: version.number
    timeout: 15000
```

## Data Structure

Each source generates a status file at `api/{source-id}/status.json`:

```json
{
  "lastCheck": "2026-01-30T10:00:00.000Z",
  "status": "changed",
  "currentHash": "abc123...",
  "previousHash": "def456...",
  "timestamp": "2026-01-30T10:00:00.000Z",
  "error": null
}
```

## Language Support

Supported languages:
- `en` - English
- `es` - Spanish

Add new languages by creating `lang/{code}.json` with translation strings.

## GitHub Actions Integration

Add to `.github/workflows/changes-check.yml`:

```yaml
name: Changes Check

on:
  schedule:
    - cron: '*/10 * * * *'  # Every 10 minutes
  workflow_dispatch:

permissions:
  contents: write
  pages: write
  id-token: write

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      
      - run: npm run build
      
      - uses: actions/upload-pages-artifact@v2
        with:
          path: '.'
      
      - uses: actions/deploy-pages@v2
      
      - name: Commit changes
        run: |
          git config user.name "Change Monitor"
          git config user.email "monitor@github.com"
          git add -A
          git commit -m "[skip ci] Changes detected" || true
          git push
```

## Scripts

```bash
npm run build      # Single check and generate HTML
npm run dev        # Watch mode for development
npm test           # Run tests
npm test:watch     # Watch mode for tests
```

## Architecture

- **index.js** - Main orchestrator
- **lib/detector.js** - Content checking with SHA256 hashing
- **lib/html.js** - HTML generation for dashboard
- **lib/yaml-parser.js** - Zero-dependency YAML parsing
- **lib/utils.js** - Date formatting and utilities
- **lang/*.json** - Translation files

## Limitations

- HTML selectors must be CSS selectors (no XPath)
- JSON paths use dot notation only
- Timeout is 10 seconds by default
- 3 retry attempts with 2-second delays

## License

MIT
