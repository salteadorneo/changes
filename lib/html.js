import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { formatDate } from './utils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Load language translations
 * @param {string} language - Language code (e.g. 'en', 'es')
 * @returns {Object}
 */
function loadLanguage(language = 'en') {
  const langFile = path.join(__dirname, `../lang/${language}.json`);

  try {
    if (fs.existsSync(langFile)) {
      return JSON.parse(fs.readFileSync(langFile, 'utf-8'));
    }
  } catch (error) {
    console.error(`Error loading language ${language}:`, error);
  }

  // Fallback to English
  const enFile = path.join(__dirname, `../lang/en.json`);
  if (fs.existsSync(enFile)) {
    return JSON.parse(fs.readFileSync(enFile, 'utf-8'));
  }

  return {};
}

/**
 * Generate HTML dashboard
 * @param {string} title - Page title
 * @param {Array} results - Check results
 * @param {Object} config - Configuration
 * @param {Array} screenshots - List of screenshot files
 * @returns {string}
 */
export function generateHTML(title, results, config = {}) {
  const lang = loadLanguage(config.language || 'en');
  const now = new Date();

  const cardsHTML = results.map(result => {
    const statusColor = result.status === 'changed'
      ? '#ff4444'
      : result.status === 'error'
        ? '#ff9900'
        : '#44aa44';

    const statusEmoji = result.status === 'changed'
      ? '🔴'
      : result.status === 'error'
        ? '⚠️'
        : '🟢';

    const statusLabel = result.status === 'changed'
      ? 'CHANGED'
      : result.status === 'error'
        ? 'ERROR'
        : 'unchanged';

    const hashDisplay = result.currentHash
      ? result.currentHash.substring(0, 12)
      : '-';

    const timestampText = result.timestamp
      ? formatDate(new Date(result.timestamp), config.language || 'en')
      : '-';

    const screenshotsGrid = result.screenshots && result.screenshots.length > 0
      ? `
            <div style="margin-top: 12px; padding-top: 12px; border-top: 1px solid #eee;">
              <div style="font-size: 11px; color: #999; margin-bottom: 8px; font-weight: 600;">📸 Captures</div>
              <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(80px, 1fr)); gap: 6px;">
                ${result.screenshots.map(s => `
                  <a href="${s.path}" target="_blank" style="text-decoration: none; color: inherit;">
                    <img src="${s.path}" style="width: 100%; height: 60px; object-fit: cover; border-radius: 3px; border: 1px solid #ddd; display: block;">
                  </a>
                `).join('')}
              </div>
            </div>
            `
      : '';

    const changesHistoryHTML = result.changesHistory && result.changesHistory.length > 0
      ? `
            <div style="margin-top: 12px; padding-top: 12px; border-top: 1px solid #eee;">
              <div style="font-size: 11px; color: #999; margin-bottom: 8px; font-weight: 600;">📋 Cambios detectados</div>
              <div style="display: flex; flex-direction: column; gap: 8px;">
                ${result.changesHistory.slice(0, 5).map((change, idx) => {
        const changeId = `comparison-${result.id}-${idx}`;
        const hasComparison = change.screenshotPath && change.previousScreenshotPath;

        if (!hasComparison) {
          return `
                  <div style="background: #fff9e6; border-left: 3px solid #ffc107; padding: 8px; border-radius: 3px; font-size: 11px;">
                    <div style="color: #856404; font-weight: 600; margin-bottom: 3px;">🔴 Cambio detectado</div>
                    <div style="color: #999; font-size: 10px;">${formatDate(new Date(change.timestamp), config.language || 'en')}</div>
                  </div>`;
        }

        return `
                  <div style="background: #fff9e6; border-left: 3px solid #ffc107; padding: 8px; border-radius: 3px; font-size: 11px;">
                    <div style="color: #856404; font-weight: 600; margin-bottom: 3px;">🔴 Cambio detectado</div>
                    <div style="color: #999; font-size: 10px; margin-bottom: 8px;">${formatDate(new Date(change.timestamp), config.language || 'en')}</div>
                    <div class="comparison-container">
                      <img src="${change.screenshotPath}" style="width: 100%; height: auto; display: block;">
                      <img class="comparison-img-before" src="${change.previousScreenshotPath}" style="width: 100%; height: 100%; object-fit: cover; display: block; position: absolute; top: 0; left: 0;">
                      <input type="range" min="0" max="100" value="50">
                      <div class="comparison-label comparison-label-after">DESPUÉS</div>
                      <div class="comparison-label comparison-label-before">ANTES</div>
                    </div>
                  </div>`;
      }).join('')}
              </div>
            </div>
            `
      : '';

    return `
        <div style="background: white; border: 2px solid ${result.status === 'error' ? '#ffcccc' : result.changesHistory && result.changesHistory.length > 0 ? '#ffe6e6' : '#eee'}; border-radius: 8px; padding: 16px; transition: all 0.2s;">
          <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px;">
            <div>
              <h3 style="font-size: 16px; margin: 0; margin-bottom: 4px; color: #333;">${result.name}</h3>
              <div style="font-size: 12px; color: #999;">
                <code style="background: #f5f5f5; padding: 2px 6px; border-radius: 3px; font-size: 11px;">${hashDisplay}</code>
              </div>
            </div>
            <div style="background: ${statusColor}; color: white; padding: 6px 12px; border-radius: 20px; font-weight: 600; font-size: 12px; white-space: nowrap;">
              ${statusEmoji} ${statusLabel}
            </div>
          </div>

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px; font-size: 12px;">
            <div>
              <div style="color: #999; margin-bottom: 3px;">Last check</div>
              <div style="color: #333; font-weight: 500;">${timestampText}</div>
            </div>
            <div>
              <div style="color: #999; margin-bottom: 3px;">Status</div>
              <div style="color: #333; font-weight: 500; text-transform: uppercase;">${result.status}</div>
            </div>
          </div>

          ${result.error ? `
          <div style="background: #fff3cd; border: 1px solid #ffc107; border-radius: 4px; padding: 8px; margin-bottom: 12px; font-size: 12px; color: #856404;">
            <strong>Error:</strong> ${result.error}
          </div>
          ` : ''}

          ${changesHistoryHTML}
        </div>
        `;
  }).join('');

  return `<!DOCTYPE html>
<html lang="${config.language || 'en'}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    @property --_slider {
      syntax: "<number>";
      inherits: true;
      initial-value: 50;
    }

    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%);
      min-height: 100vh;
      padding: 20px;
    }
    
    .comparison-container {
      position: relative;
      width: 100%;
      max-width: 400px;
      border-radius: 3px;
      overflow: hidden;
      user-select: none;
    }
    
    .comparison-container input[type="range"] {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      margin: 0;
      padding: 0;
      border: none;
      outline: none;
      z-index: 10;
      cursor: col-resize;
      background: transparent;
      -webkit-appearance: none;
      appearance: none;
      timeline-scope: --_slider;
    }
    
    .comparison-container input[type="range"]::-webkit-slider-thumb {
      -webkit-appearance: none;
      width: 3px;
      height: 100%;
      background: white;
      cursor: col-resize;
      box-shadow: 0 0 8px rgba(0,0,0,0.3);
      position: relative;
      z-index: 11;
    }
    
    .comparison-container input[type="range"]::-moz-range-thumb {
      width: 3px;
      height: 100%;
      background: white;
      cursor: col-resize;
      border: none;
      box-shadow: 0 0 8px rgba(0,0,0,0.3);
    }
    
    .comparison-img-before {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      clip-path: inset(0 calc(100% - var(--_slider) * 1%) 0 0);
      pointer-events: none;
      animation: --_timeline linear forwards;
      animation-timeline: view();
    }
    
    @keyframes --_timeline {
      0% { --_slider: 0; }
      100% { --_slider: 100; }
    }
    
    .comparison-label {
      position: absolute;
      top: 2px;
      background: rgba(0,0,0,0.6);
      color: white;
      padding: 2px 4px;
      font-size: 9px;
      border-radius: 2px;
      z-index: 1;
      pointer-events: none;
    }
    
    .comparison-label-after {
      left: 2px;
    }
    
    .comparison-label-before {
      left: calc(var(--_slider) * 1% + 4px);
    }
    
    .container {
      max-width: 1200px;
      margin: 0 auto;
    }
    
    .header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 40px 20px;
      text-align: center;
      border-radius: 8px 8px 0 0;
      box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
    }
    
    .header h1 {
      font-size: 32px;
      margin-bottom: 10px;
    }
    
    .status-bar {
      display: none;
    }
    
    .content {
      padding: 30px 20px 20px;
    }
    
    .cards-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
      gap: 20px;
      margin-top: 20px;
    }
    
    .footer {
      background: #f8f9fa;
      padding: 15px 20px;
      text-align: center;
      font-size: 12px;
      color: #999;
      border-top: 1px solid #eee;
      border-radius: 0 0 8px 8px;
      box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
    }
    
    code {
      background: #f0f0f0;
      padding: 2px 6px;
      border-radius: 3px;
      font-family: 'Monaco', 'Menlo', 'Consolas', monospace;
      font-size: 12px;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>${title}</h1>
    </div>
    
    <div class="content">
      <div class="cards-grid">
        ${cardsHTML}
      </div>
    </div>
    
    <div class="footer">
      <div style="margin-bottom: 8px;">
        ${lang.lastUpdated || 'Last updated'}: ${formatDate(now, config.language || 'en')}
      </div>
      <div style="font-size: 11px;">
        Change Monitor v1.0.0
      </div>
    </div>
  </div>
</body>
</html>`;
}
