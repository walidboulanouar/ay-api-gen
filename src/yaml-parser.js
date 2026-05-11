/**
 * Minimal YAML parser for OpenAPI specs.
 * Handles the subset of YAML used in OpenAPI: objects, arrays, strings, numbers, booleans, nulls.
 * Does NOT handle: anchors/aliases, multi-line strings (|, >), complex keys, merge keys.
 * For full YAML support, use js-yaml.
 *
 * Zero external dependencies.
 */

/**
 * Parse a YAML string into a JavaScript object.
 * @param {string} yaml
 * @returns {object|null} parsed object, or null if parsing fails
 */
export function parseYaml(yaml) {
  if (!yaml || typeof yaml !== "string") return null;

  try {
    const lines = yaml.split("\n");
    const result = parseBlock(lines, 0, 0);
    return result.value;
  } catch {
    return null;
  }
}

function parseBlock(lines, startIdx, baseIndent) {
  const obj = {};
  let isArray = false;
  const arr = [];
  let i = startIdx;

  while (i < lines.length) {
    const line = lines[i];
    const stripped = line.replace(/\s+$/, "");

    // Skip empty lines and comments
    if (stripped === "" || stripped.trimStart().startsWith("#")) {
      i++;
      continue;
    }

    const indent = stripped.length - stripped.trimStart().length;

    // If we've dedented, this block is done
    if (indent < baseIndent) break;

    // Skip lines at deeper indent (handled recursively)
    if (indent > baseIndent && !isArray) break;

    const trimmed = stripped.trimStart();

    // Array item
    if (trimmed.startsWith("- ")) {
      isArray = true;
      const rest = trimmed.slice(2).trim();

      if (rest.includes(": ")) {
        // Inline object in array: - key: value
        const childObj = {};
        const [k, ...vParts] = rest.split(": ");
        const v = vParts.join(": ");
        childObj[k.trim()] = parseValue(v);

        // Check for continuation lines at deeper indent
        let j = i + 1;
        while (j < lines.length) {
          const nextLine = lines[j];
          const nextStripped = nextLine.replace(/\s+$/, "");
          if (nextStripped === "" || nextStripped.trimStart().startsWith("#")) { j++; continue; }
          const nextIndent = nextStripped.length - nextStripped.trimStart().length;
          if (nextIndent <= indent) break;
          const nextTrimmed = nextStripped.trimStart();
          if (nextTrimmed.includes(": ")) {
            const [nk, ...nvParts] = nextTrimmed.split(": ");
            const nv = nvParts.join(": ");
            if (nv === "" || nv === "|" || nv === ">") {
              // Nested block
              const nested = parseBlock(lines, j + 1, nextIndent + 2);
              childObj[nk.trim()] = nested.value;
              j = nested.nextIdx;
            } else {
              childObj[nk.trim()] = parseValue(nv);
              j++;
            }
          } else if (nextTrimmed.startsWith("- ")) {
            // Nested array
            const nested = parseBlock(lines, j, nextIndent);
            const lastKey = Object.keys(childObj).pop();
            if (lastKey && childObj[lastKey] === null) {
              childObj[lastKey] = nested.value;
            }
            j = nested.nextIdx;
          } else {
            j++;
          }
        }
        arr.push(childObj);
        i = j;
        continue;
      } else {
        // Simple array value
        arr.push(parseValue(rest));
        i++;
        continue;
      }
    }

    // Key-value pair
    if (trimmed.includes(": ")) {
      const colonIdx = trimmed.indexOf(": ");
      const key = trimmed.slice(0, colonIdx).trim().replace(/^['"]|['"]$/g, "");
      const valStr = trimmed.slice(colonIdx + 2).trim();

      if (valStr === "" || valStr === "|" || valStr === ">") {
        // Block value — parse child block
        const childIndent = findChildIndent(lines, i + 1);
        if (childIndent > indent) {
          const child = parseBlock(lines, i + 1, childIndent);
          obj[key] = child.value;
          i = child.nextIdx;
        } else {
          obj[key] = null;
          i++;
        }
      } else {
        obj[key] = parseValue(valStr);
        i++;
      }
      continue;
    }

    // Bare key with colon at end: "key:"
    if (trimmed.endsWith(":")) {
      const key = trimmed.slice(0, -1).trim().replace(/^['"]|['"]$/g, "");
      const childIndent = findChildIndent(lines, i + 1);
      if (childIndent > indent) {
        const child = parseBlock(lines, i + 1, childIndent);
        obj[key] = child.value;
        i = child.nextIdx;
      } else {
        obj[key] = null;
        i++;
      }
      continue;
    }

    i++;
  }

  return {
    value: isArray ? arr : obj,
    nextIdx: i,
  };
}

function findChildIndent(lines, startIdx) {
  for (let i = startIdx; i < lines.length; i++) {
    const line = lines[i].replace(/\s+$/, "");
    if (line === "" || line.trimStart().startsWith("#")) continue;
    return line.length - line.trimStart().length;
  }
  return 0;
}

function parseValue(str) {
  if (str === undefined || str === null) return null;
  str = str.trim();

  // Remove trailing comments
  if (str.includes(" #")) {
    // But not inside quotes
    if (!str.startsWith("'") && !str.startsWith('"')) {
      str = str.replace(/\s+#.*$/, "").trim();
    }
  }

  // Quoted strings
  if ((str.startsWith("'") && str.endsWith("'")) || (str.startsWith('"') && str.endsWith('"'))) {
    return str.slice(1, -1);
  }

  // Inline array: [a, b, c]
  if (str.startsWith("[") && str.endsWith("]")) {
    return str.slice(1, -1).split(",").map(s => parseValue(s.trim()));
  }

  // Inline object: {a: b, c: d}
  if (str.startsWith("{") && str.endsWith("}")) {
    const obj = {};
    const inner = str.slice(1, -1);
    const pairs = inner.split(",");
    for (const pair of pairs) {
      const [k, ...vParts] = pair.split(":");
      if (k) obj[k.trim()] = parseValue(vParts.join(":"));
    }
    return obj;
  }

  // Booleans
  if (str === "true" || str === "True" || str === "TRUE") return true;
  if (str === "false" || str === "False" || str === "FALSE") return false;

  // Null
  if (str === "null" || str === "~" || str === "Null" || str === "NULL") return null;

  // Numbers
  if (/^-?\d+$/.test(str)) return parseInt(str, 10);
  if (/^-?\d+\.\d+$/.test(str)) return parseFloat(str);

  // $ref and other strings
  return str;
}
