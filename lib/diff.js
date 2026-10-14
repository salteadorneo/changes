const CONTEXT_LINES = 3;
const MAX_LINES = 1000;

function splitLines(text) {
  return text.split('\n').map(l => l.trimEnd()).filter(l => l.length > 0);
}

function lcsMatrix(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, () => new Uint16Array(n + 1));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1] + 1
        : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }
  return dp;
}

function buildDiff(a, b) {
  const dp = lcsMatrix(a, b);
  const result = [];
  let i = a.length, j = b.length;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) {
      result.push({ type: 'same', line: a[i - 1] });
      i--; j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      result.push({ type: 'add', line: b[j - 1] });
      j--;
    } else {
      result.push({ type: 'remove', line: a[i - 1] });
      i--;
    }
  }
  return result.reverse();
}

function addContext(diff) {
  const shown = new Set();
  diff.forEach((entry, i) => {
    if (entry.type !== 'same') {
      for (let c = Math.max(0, i - CONTEXT_LINES); c <= Math.min(diff.length - 1, i + CONTEXT_LINES); c++) {
        shown.add(c);
      }
    }
  });

  const result = [];
  let skipped = 0;
  diff.forEach((entry, i) => {
    if (shown.has(i)) {
      if (skipped > 0) {
        result.push({ type: 'skip', count: skipped });
        skipped = 0;
      }
      result.push(entry);
    } else {
      skipped++;
    }
  });
  if (skipped > 0) result.push({ type: 'skip', count: skipped });

  return result;
}

/**
 * Compute a line-based diff between two text strings.
 * Returns an array of { type: 'add'|'remove'|'same'|'skip'|'truncated', line?, count? }
 * @param {string} oldText
 * @param {string} newText
 * @returns {Array}
 */
export function computeDiff(oldText, newText) {
  const oldLines = splitLines(oldText);
  const newLines = splitLines(newText);

  if (oldLines.length > MAX_LINES || newLines.length > MAX_LINES) {
    return [{ type: 'truncated', oldCount: oldLines.length, newCount: newLines.length }];
  }

  const raw = buildDiff(oldLines, newLines);
  return addContext(raw);
}

/**
 * Compute a word/token-level diff between two strings.
 * Returns an array of { type: 'add'|'remove'|'same', text: string }
 * @param {string} oldLine
 * @param {string} newLine
 * @returns {Array}
 */
export function computeWordDiff(oldLine, newLine) {
  const tokenize = s => s.match(/\S+|\s+/g) || [];
  return buildDiff(tokenize(oldLine), tokenize(newLine));
}
