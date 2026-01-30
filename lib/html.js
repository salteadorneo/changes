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
export function generateHTML(title, results, config = {}, screenshots = []) {
    const lang = loadLanguage(config.language || 'en');
    const now = new Date();

    // Count changes
    const changed = results.filter(r => r.status === 'changed').length;
    const unchanged = results.filter(r => r.status === 'unchanged').length;
    const errors = results.filter(r => r.status === 'error').length;

    // Overall status
    const overallStatus = changed > 0 ? 'alert' : 'ok';
    const statusIcon = changed > 0 ? '🔴' : '🟢';
    const statusText = changed > 0
        ? `${changed} ${lang.changed || 'changed'}`
        : lang.allUnchanged || 'All unchanged';

    const rowsHTML = results.map(result => {
        const statusBadge = result.status === 'changed'
            ? '<span style="background: #ff4444; color: white; padding: 2px 8px; border-radius: 3px; font-size: 12px;">🔴 CHANGED</span>'
            : result.status === 'error'
                ? '<span style="background: #ff9900; color: white; padding: 2px 8px; border-radius: 3px; font-size: 12px;">⚠️ ERROR</span>'
                : '<span style="background: #44aa44; color: white; padding: 2px 8px; border-radius: 3px; font-size: 12px;">🟢 unchanged</span>';

        const hashDisplay = result.currentHash
            ? `<code style="background: #f0f0f0; padding: 2px 6px; border-radius: 3px; font-family: monospace; font-size: 12px;">${result.currentHash.substring(0, 12)}</code>`
            : '-';

        const errorCell = result.error
            ? `<td style="font-size: 12px; color: #666;">${result.error}</td>`
            : '<td style="font-size: 12px; color: #999;">-</td>';

        const timeCell = result.timestamp
            ? `<td style="font-size: 12px; color: #999;">${formatDate(new Date(result.timestamp), config.language || 'en')}</td>`
            : '<td style="font-size: 12px; color: #999;">-</td>';

        return `
      <tr style="border-bottom: 1px solid #eee;">
        <td style="padding: 12px 8px;">${result.name}</td>
        <td style="padding: 12px 8px; text-align: center;">${statusBadge}</td>
        <td style="padding: 12px 8px; text-align: center; font-family: monospace; font-size: 12px;">${hashDisplay}</td>
        ${errorCell}
        ${timeCell}
      </tr>
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
      background: white;
      border-radius: 8px;
      box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
      overflow: hidden;
    }
    
    .header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 40px 20px;
      text-align: center;
    }
    
    .header h1 {
      font-size: 32px;
      margin-bottom: 10px;
    }
    
    .status-bar {
      background: ${overallStatus === 'alert' ? '#fff3cd' : '#d4edda'};
      color: ${overallStatus === 'alert' ? '#856404' : '#155724'};
      padding: 20px;
      text-align: center;
      font-size: 18px;
      font-weight: bold;
      border-bottom: 1px solid ${overallStatus === 'alert' ? '#ffeaa7' : '#c3e6cb'};
    }
    
    .stats {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
      gap: 15px;
      padding: 20px;
      background: #f8f9fa;
      border-bottom: 1px solid #eee;
    }
    
    .stat {
      text-align: center;
      padding: 15px;
      background: white;
      border-radius: 4px;
      border: 1px solid #eee;
    }
    
    .stat-number {
      font-size: 28px;
      font-weight: bold;
      color: #333;
      margin-bottom: 5px;
    }
    
    .stat-label {
      font-size: 12px;
      color: #999;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    
    .content {
      padding: 20px;
    }
    
    table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 10px;
    }
    
    th {
      background: #f8f9fa;
      padding: 12px 8px;
      text-align: left;
      font-weight: 600;
      font-size: 13px;
      color: #666;
      border-bottom: 2px solid #eee;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    
    td {
      padding: 12px 8px;
    }
    
    .footer {
      background: #f8f9fa;
      padding: 15px 20px;
      text-align: center;
      font-size: 12px;
      color: #999;
      border-top: 1px solid #eee;
    }
    
    code {
      background: #f0f0f0;
      padding: 2px 6px;
      border-radius: 3px;
      font-family: 'Monaco', 'Menlo', 'Consolas', monospace;
      font-size: 12px;
    }
    
    .updated {
      font-size: 12px;
      color: #999;
      margin-top: 5px;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>${title}</h1>
      <p>${statusIcon} ${statusText}</p>
    </div>
    
    <div class="status-bar">
      ${statusIcon} ${statusText}
    </div>
    
    <div class="stats">
      <div class="stat">
        <div class="stat-number">${results.length}</div>
        <div class="stat-label">${lang.sources || 'Sources'}</div>
      </div>
      <div class="stat">
        <div class="stat-number" style="color: ${changed > 0 ? '#ff4444' : '#44aa44'};">${changed}</div>
        <div class="stat-label">${lang.changed || 'Changed'}</div>
      </div>
      <div class="stat">
        <div class="stat-number" style="color: #44aa44;">${unchanged}</div>
        <div class="stat-label">${lang.unchanged || 'Unchanged'}</div>
      </div>
      <div class="stat">
        <div class="stat-number" style="color: #ff9900;">${errors}</div>
        <div class="stat-label">${lang.errors || 'Errors'}</div>
      </div>
    </div>
    
    <div class="content">
      <h2 style="margin-bottom: 15px; font-size: 18px;">Sources Status</h2>
      <table>
        <thead>
          <tr>
            <th>${lang.name || 'Name'}</th>
            <th style="text-align: center;">${lang.status || 'Status'}</th>
            <th style="text-align: center;">${lang.hash || 'Hash'}</th>
            <th>${lang.error || 'Error'}</th>
            <th>${lang.lastCheck || 'Last Check'}</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHTML}
        </tbody>
      </table>

      ${screenshots.length > 0 ? `
      <h2 style="margin-bottom: 15px; font-size: 18px; margin-top: 30px;">📸 Recent Snapshots</h2>
      <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 12px;">
        ${screenshots.slice(0, 6).map(s => `
          <a href="${s.path}" target="_blank" style="text-decoration: none; color: inherit;">
            <div style="background: #f8f9fa; border: 1px solid #ddd; border-radius: 4px; padding: 12px; text-align: center; cursor: pointer; transition: all 0.2s; hover-effect:true;">
              <div style="font-size: 24px; margin-bottom: 8px;">📄</div>
              <div style="font-size: 11px; color: #666; word-break: break-all; max-height: 40px; overflow: hidden;">${s.name}</div>
            </div>
          </a>
        `).join('')}
      </div>
      ` : ''}
    </div>
    
    <div class="footer">
      <div class="updated">
        ${lang.lastUpdated || 'Last updated'}: ${formatDate(now, config.language || 'en')}
      </div>
      <div style="margin-top: 8px; font-size: 11px;">
        Change Monitor v1.0.0
      </div>
    </div>
  </div>
</body>
</html>`;
}
