// Public Next.js Flight frames contain structured game data, never executable imports.
export function readFlight(html) {
  return [...html.matchAll(/<script>self\.__next_f\.push\((\[1,"(?:\\.|[^"\\])*"\])\)<\/script>/gs)]
    .map(match => JSON.parse(match[1])[1]).join('');
}
export function readObject(source, marker) {
  let position = source.indexOf(marker);
  if (position < 0) return null;
  position += marker.length;
  while (/\s/.test(source[position])) position++;
  if (!['{', '['].includes(source[position])) return null;
  const start = position;
  let depth = 0, quoted = false, escaped = false;
  for (; position < source.length; position++) {
    const char = source[position];
    if (quoted) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') quoted = false;
    } else if (char === '"') quoted = true;
    else if (char === '{' || char === '[') depth++;
    else if ((char === '}' || char === ']') && --depth === 0) return JSON.parse(source.slice(start, position + 1));
  }
  throw new Error(`Incomplete JSON: ${marker}`);
}
export function flightRecords(source) {
  const records = [];
  for (const line of source.split('\n')) {
    const match = line.match(/^[\da-f]+:(\[.*|\{.*)$/i);
    if (match) { try { records.push(JSON.parse(match[1])); } catch {} }
  }
  return records;
}
