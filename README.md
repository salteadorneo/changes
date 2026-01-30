# Changes Monitor

Lightweight change detection and monitoring system for GitHub Pages with **automatic screenshot capture** of monitored websites.

## Features

- **Change Detection** - SHA256 hashing to detect any content changes
- **Automatic Screenshots** - Captures PNG screenshots of monitored sources using Puppeteer
- **Multiple Source Types** - HTML (CSS selectors), JSON (dot notation), plain content
- **Static Site Generation** - Runs on GitHub Actions, deploys to GitHub Pages
- **Visual Dashboard** - Real-time monitoring with screenshot thumbnails
- **Multi-language Support** - English and Spanish UI
- **No Databases** - Everything stored as static files and git commits
- **Auto-cleanup** - Keeps only recent screenshots to prevent repo bloat

## Quick Start

### 1. Configure Sources

Edit `config.yml` to add the sources you want to monitor:

```yaml
title: Change Monitor
language: es
sources:
  - name: Website
    url: https://example.com
    type: content
  
  - name: API Version
    url: https://api.example.com/version.json
    type: json
    jsonPath: data.version
  
  - name: Version Badge
    url: https://example.com
    type: html
    selector: .version-badge
```

### 2. Run Locally

```bash
npm install
npm run build    # Single check + capture screenshots
npm run dev      # Watch mode
npm run cleanup  # Remove old screenshots (keep last 3-5)
```

### 3. Deploy to GitHub Pages

GitHub Actions automatically:
1. Checks all sources for changes
2. Captures PNG screenshots of each source
3. Generates a dashboard with status + thumbnails
4. Commits changes to git
5. Deploys to GitHub Pages

## Configuration

### Source Types

- **content** - Plain text/HTML content comparison
- **html** - Extract using CSS selectors (e.g., `.version`, `[data-version]`, `h1`)
- **json** - Extract using dot notation (e.g., `data.version.number`)

### Example Config

```yaml
sources:
  # Monitor entire page content
  - name: Homepage
    url: https://example.com
    type: content
  
  # Extract specific HTML element
  - name: Version Badge
    url: https://example.com
    type: html
    selector: "[data-version]"
    timeout: 10000
  
  # Monitor API endpoint
  - name: API Version
    url: https://api.example.com/status.json
    type: json
    jsonPath: version
    timeout: 15000
```

## Output Structure

### Generated Files

```
index.html                          # Main dashboard
screenshots/
  dashboard-YYYY-MM-DDTHH-MM-SS.png # Dashboard snapshots (last 5)
  sources/
    petanca-YYYY-MM-DDTHH-MM-SS.png # Source screenshots (last 3 each)
    google-YYYY-MM-DDTHH-MM-SS.png
api/
  petanca/
    status.json                      # Current status
    history/
      2026-01.json                   # Monthly history
  google/
    status.json
    history/
      2026-01.json
```

### Status File Format

```json
{
  "lastCheck": "2026-01-30T10:00:00.000Z",
  "status": "changed",
  "currentHash": "abc123def456...",
  "previousHash": "def456abc123...",
  "timestamp": "2026-01-30T10:00:00.000Z",
  "error": null
}
```

## Language Support

Supported languages:
- `en` - English
- `es` - Spanish

Add new languages by creating `lang/{code}.json` with translation strings.

## GitHub Actions Setup

The workflow (`.github/workflows/changes-check.yml`) runs every 15 minutes and:

1. **Installs Chromium** for Puppeteer browser automation
2. **Runs detection** - checks each source and captures screenshots
3. **Cleans up** - keeps only the most recent screenshots
4. **Deploys** - updates GitHub Pages automatically
5. **Commits** - saves all changes to git (images + status files)

### Required Permissions

Add to your GitHub Pages workflow:

```yaml
permissions:
  contents: write      # Commit generated files
  pages: write         # Deploy to Pages
  id-token: write      # ID token for Pages
```

## Scripts

```bash
npm run build      # Check sources + capture screenshots + generate dashboard
npm run dev        # Watch mode for development
npm run cleanup    # Remove old screenshots (keeps last 3-5)
npm test           # Run tests
npm test:watch     # Watch mode for tests
```

## Architecture

### Core Modules

- **index.js** - Main orchestrator (config loading, loop, git commits)
- **lib/detector.js** - Content checking + SHA256 hashing + HTML fetching
- **lib/screenshot.js** - Puppeteer-based screenshot capture with auto-cleanup
- **lib/html.js** - Dashboard HTML generation with screenshot thumbnails
- **lib/yaml-parser.js** - Zero-dependency YAML parsing
- **lib/utils.js** - Date formatting + utilities
- **lang/*.json** - UI translations (EN/ES)

### Dependencies

- **puppeteer** - Browser automation for screenshot capture
- **jsdom** - HTML parsing for content extraction
- **canvas** - Image rendering (Puppeteer dependency)

### How It Works

```
1. Load config.yml (sources to monitor)
2. For each source:
   a. Fetch content from URL
   b. Extract using selector/jsonPath/as-is
   c. Calculate SHA256 hash
   d. Compare with previous hash
   e. Capture PNG screenshot with Puppeteer
3. Generate dashboard HTML with thumbnails
4. Save status JSON files
5. Cleanup old screenshots (keep last 3-5)
6. Commit changes to git
```

## Limitations & Notes

- Puppeteer requires Chromium (auto-installed, ~200MB)
- Screenshots in GitHub Actions use system Chromium from Ubuntu
- Timeout default is 10 seconds, can be overridden per source
- 3 retry attempts with 2-second delays on network errors
- CSS selectors are standard (not XPath)
- JSON paths use simple dot notation (no complex queries)
- Screenshots are stored in git (with auto-cleanup to stay bounded)

## License

MIT
