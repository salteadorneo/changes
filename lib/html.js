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
 * Generate HTML dashboard (simplified - only shows source links)
 * @param {string} title - Page title
 * @param {Array} results - Check results
 * @param {Object} config - Configuration
 * @returns {string}
 */
export function generateHTML(title, results, config = {}) {
  const lang = loadLanguage(config.language || 'en');
  const now = new Date();

  const cardsHTML = results.map(result => {
    return `
        <a href="./source/${result.id}.html" style="text-decoration: none; color: inherit;">
          <div style="background: white; border: 2px solid #eee; border-radius: 8px; padding: 20px; transition: all 0.2s; cursor: pointer; hover: {transform: translateY(-2px); box-shadow: 0 4px 12px rgba(0,0,0,0.1);}">
            <h3 style="font-size: 18px; margin: 0; color: #333;">${result.name}</h3>
            <div style="font-size: 12px; color: #999; margin-top: 8px;">
              ${result.changesHistory && result.changesHistory.length > 0
        ? `📊 ${result.changesHistory.length} cambios registrados`
        : '✓ Sin cambios detectados'}
            </div>
          </div>
        </a>
        `;
  }).join('');

  return `<!DOCTYPE html>
<html lang="${config.language || 'en'}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>

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

/**
 * Generate source detail page with timeline
 * @param {string} sourceName - Source name
 * @param {string} sourceId - Source identifier
 * @param {Array} changesHistory - Array of changes
 * @param {Object} config - Configuration
 * @returns {string}
 */
export function generateSourcePage(sourceName, sourceId, changesHistory = [], config = {}) {
  const lang = loadLanguage(config.language || 'en');
  const now = new Date();

  const timelineHTML = changesHistory.length > 0
    ? `
        <div style="padding: 20px; background: white; border-radius: 8px;">
          <h2 style="font-size: 20px; margin: 0 0 20px 0; color: #333;">📋 Línea temporal</h2>
          <div style="position: relative; padding: 20px 0 20px 40px;">
            ${changesHistory.map((change, idx) => {
      const timestamp = formatDate(new Date(change.timestamp), config.language || 'en');
      const hasComparison = change.screenshotPath && change.previousScreenshotPath;
      const changeNumber = changesHistory.length - idx;

      return `
                <div style="margin-bottom: 40px; position: relative;">
                  <div style="position: absolute; left: -28px; top: 0; width: 16px; height: 16px; background: #667eea; border: 3px solid white; border-radius: 50%; box-shadow: 0 0 0 2px #667eea;"></div>
                  
                  <div style="background: #f8f9fa; border-radius: 8px; padding: 16px; border-left: 3px solid #667eea;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                      <h3 style="margin: 0; font-size: 14px; color: #333;">Cambio #${changeNumber}</h3>
                      <span style="font-size: 12px; color: #999; background: #e9ecef; padding: 4px 8px; border-radius: 4px;">${timestamp}</span>
                    </div>
                    
                    ${change.hash ? `
                      <div style="font-size: 11px; color: #666; margin-bottom: 12px; font-family: monospace;">
                        <div style="color: #999; margin-bottom: 3px;">Hash actual:</div>
                        <code style="background: white; padding: 4px 6px; border-radius: 3px; display: inline-block; color: #28a745;">${change.hash.substring(0, 12)}</code>
                        ${change.previousHash ? `
                          <div style="color: #999; margin-top: 6px; margin-bottom: 3px;">Hash anterior:</div>
                          <code style="background: white; padding: 4px 6px; border-radius: 3px; display: inline-block; color: #dc3545;">${change.previousHash.substring(0, 12)}</code>
                        ` : ''}
                      </div>
                    ` : ''}
                    
                    ${hasComparison ? `
                      <div style="margin-top: 12px;">
                        <div style="font-size: 11px; color: #999; margin-bottom: 8px; font-weight: 600;">📸 Comparación antes/después:</div>
                        <div class="comparison-container">
                          <div>
                            <div style="font-size: 10px; color: #666; margin-bottom: 4px; text-align: center; font-weight: 500;">ANTES</div>
                            <img src="../${change.previousScreenshotPath}" alt="Antes">
                          </div>
                          <div>
                            <div style="font-size: 10px; color: #666; margin-bottom: 4px; text-align: center; font-weight: 500;">DESPUÉS</div>
                            <img src="../${change.screenshotPath}" alt="Después">
                          </div>
                        </div>
                      </div>
                    ` : `
                      <div style="background: #fff3cd; border-left: 3px solid #ffc107; padding: 8px; border-radius: 3px; font-size: 11px; color: #856404;">
                        ℹ No hay capturas de pantalla disponibles para esta comparación
                      </div>
                    `}
                  </div>
                </div>
              `;
    }).join('')}
          </div>
        </div>
      `
    : `
        <div style="background: #e8f5e9; border: 1px solid #4caf50; border-radius: 8px; padding: 24px; text-align: center; color: #2e7d32;">
          <div style="font-size: 32px; margin-bottom: 8px;">✓</div>
          <div style="font-size: 16px; font-weight: 600;">Sin cambios detectados</div>
          <div style="font-size: 12px; margin-top: 8px; opacity: 0.8;">Aún no se han registrado cambios en esta fuente</div>
        </div>
      `;

  return `<!DOCTYPE html>
<html lang="${config.language || 'en'}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${sourceName} - Change Monitor</title>
  <style>
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

    @property --_slider {
      syntax: "<number>";
      inherits: true;
      initial-value: 50;
    }

    .comparison-container {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
      margin-top: 8px;
    }
    
    .comparison-container img {
      width: 100%;
      height: auto;
      display: block;
      border-radius: 4px;
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
    
    .container {
      max-width: 1000px;
      margin: 0 auto;
    }
    
    .header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 30px 20px;
      border-radius: 8px 8px 0 0;
      box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    
    .header h1 {
      font-size: 28px;
      margin: 0;
    }
    
    .back-link {
      background: rgba(255,255,255,0.2);
      color: white;
      padding: 8px 16px;
      border-radius: 4px;
      text-decoration: none;
      font-size: 14px;
      transition: background 0.2s;
    }
    
    .back-link:hover {
      background: rgba(255,255,255,0.3);
    }
    
    .content {
      background: #f8f9fa;
      padding: 30px 20px;
    }
    
    .footer {
      background: white;
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
      <div>
        <h1>${sourceName}</h1>
        <div style="font-size: 12px; opacity: 0.9; margin-top: 4px;">Change history timeline</div>
      </div>
      <a href="../index.html" class="back-link">← Volver</a>
    </div>
    
    <div class="content">
      ${timelineHTML}
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
