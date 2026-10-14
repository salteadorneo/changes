/**
 * Simple YAML parser - Zero dependencies
 * Supports basic YAML features needed for config files
 */

export function parseYAML(yamlString) {
    const lines = yamlString.split('\n').filter(line => {
        const trimmed = line.trim();
        return trimmed && !trimmed.startsWith('#');
    });

    const result = {};
    let currentKey = null;
    let currentArray = null;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();
        const lineIndent = line.search(/\S/);

        if (trimmed.startsWith('- ')) {
            const item = trimmed.substring(2).trim();

            if (item.includes(':')) {
                const obj = {};
                const colonIndex = item.indexOf(':');
                const key = item.substring(0, colonIndex).trim();
                const value = item.substring(colonIndex + 1).trim();
                obj[key] = parseValue(value);

                let j = i + 1;
                while (j < lines.length) {
                    const nextLine = lines[j];
                    const nextTrimmed = nextLine.trim();
                    const nextIndent = nextLine.search(/\S/);

                    if (nextIndent <= lineIndent) break;
                    if (nextTrimmed.startsWith('- ')) break;

                    if (nextTrimmed.includes(':')) {
                        const colonIndex = nextTrimmed.indexOf(':');
                        const k = nextTrimmed.substring(0, colonIndex).trim();
                        const v = nextTrimmed.substring(colonIndex + 1).trim();
                        obj[k] = parseValue(v);
                        i = j;
                    }
                    j++;
                }

                if (currentArray) {
                    currentArray.push(obj);
                }
            } else {
                if (currentArray) {
                    currentArray.push(parseValue(item));
                }
            }
            continue;
        }

        if (trimmed.includes(':')) {
            const colonIndex = trimmed.indexOf(':');
            const key = trimmed.substring(0, colonIndex).trim();
            const value = trimmed.substring(colonIndex + 1).trim();

            if (value === '') {
                // `key:` with nothing after it is either the start of a list
                // of "- " items or a nested block of "sub: value" lines.
                const next = lines[i + 1];
                const isNested = next
                    && !next.trim().startsWith('- ')
                    && next.search(/\S/) > lineIndent;

                if (isNested) {
                    const block = {};
                    let j = i + 1;
                    while (j < lines.length) {
                        const nested = lines[j];
                        const nestedTrimmed = nested.trim();
                        const nestedIndent = nested.search(/\S/);

                        if (nestedIndent <= lineIndent || nestedTrimmed.startsWith('- ')) break;

                        const nestedColon = nestedTrimmed.indexOf(':');
                        if (nestedColon === -1) break;

                        block[nestedTrimmed.substring(0, nestedColon).trim()] = parseValue(
                            nestedTrimmed.substring(nestedColon + 1).trim()
                        );
                        j++;
                    }

                    result[key] = block;
                    i = j - 1;
                    currentKey = null;
                    currentArray = null;
                    continue;
                }

                currentKey = key;
                currentArray = [];
                result[key] = currentArray;
            } else {
                result[key] = parseValue(value);
                currentKey = null;
                currentArray = null;
            }
        }
    }

    return result;
}

function parseValue(value) {
    if (!value) return '';

    const trimmed = value.trim();

    // Quoted values are taken verbatim, a '#' inside them is literal
    if ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
        (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
        return trimmed.slice(1, -1);
    }

    // Strip trailing comments: "24   # how many" -> "24".
    // A '#' with no preceding space is part of the value (URL fragments).
    const commentAt = trimmed.indexOf(' #');
    const clean = commentAt === -1 ? trimmed : trimmed.slice(0, commentAt).trim();

    if (clean === '') return '';
    if (clean === 'true') return true;
    if (clean === 'false') return false;
    if (clean === 'null') return null;
    if (!isNaN(clean)) return Number(clean);

    return clean;
}
