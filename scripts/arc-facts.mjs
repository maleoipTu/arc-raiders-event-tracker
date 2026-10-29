// Extract semantic ARC facts from public Flight records; downloaded code is never executed.
function readRecords(flight) {
  const records = new Map();
  for (const line of flight.split('\n')) {
    const match = line.match(/^([\da-f]+):(.+)$/i);
    if (!match) continue;
    try { records.set(match[1], JSON.parse(match[2])); } catch { /* Module imports and executable records are not data. */ }
  }
  return records;
}

function resolver(records) {
  function resolve(value, trail = new Set(), depth = 0) {
    if (depth > 80) return null;
    if (typeof value === 'string') {
      if (value === '$undefined') return null;
      const ref = value.match(/^\$L?([\da-f]+)(?::(.+))?$/i);
      if (!ref) return value;
      if (!records.has(ref[1]) || trail.has(ref[1])) return null;
      let target = records.get(ref[1]);
      if (ref[2]) for (const key of ref[2].split(':')) target = target?.[key];
      return resolve(target, new Set([...trail, ref[1]]), depth + 1);
    }
    if (Array.isArray(value)) return value.map(item => resolve(item, trail, depth + 1));
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, resolve(item, trail, depth + 1)]));
    return value;
  }
  return resolve;
}

const isElement = node => Array.isArray(node) && node[0] === '$';
const props = node => isElement(node) && node[3] && typeof node[3] === 'object' ? node[3] : {};
function walk(value, callback) {
  if (!value || typeof value !== 'object') return;
  callback(value);
  for (const child of Object.values(value)) walk(child, callback);
}
function text(value) {
  if (typeof value === 'string') return value.startsWith('$') ? '' : value;
  if (typeof value === 'number') return String(value);
  if (isElement(value)) {
    const attributes = props(value);
    if (attributes['aria-hidden'] === true || attributes['aria-hidden'] === 'true' || ['svg', 'title', 'style', 'script'].includes(value[1])) return '';
    return text(attributes.children);
  }
  if (Array.isArray(value)) return value.map(text).filter(Boolean).join(' ');
  if (value && typeof value === 'object') return text(value.children);
  return '';
}
const clean = value => value.replace(/\s+/g, ' ').trim();
const unique = values => [...new Set(values.map(clean).filter(Boolean))];
function elements(value, tag) {
  const result = [];
  walk(value, node => { if (isElement(node) && node[1] === tag) result.push(node); });
  return result;
}
function definitionPairs(children) {
  const result = [];
  let label = '';
  walk(children, node => {
    if (!isElement(node)) return;
    if (node[1] === 'dt') label = clean(text(node));
    if (node[1] === 'dd' && label) { const value = clean(text(node)); if (value) result.push(`${label}: ${value}`); label = ''; }
  });
  return unique(result);
}
function armorFacts(children) {
  const result = [];
  walk(children, node => {
    if (!isElement(node)) return;
    const value = props(node).children;
    const siblings = isElement(value) ? [value] : Array.isArray(value) ? value.filter(isElement) : [];
    const heading = siblings.find(child => child[1] === 'h3');
    if (!heading) return;
    const label = clean(text(heading));
    const values = unique(siblings.filter(child => child !== heading && child[1] !== 'p').map(child => {
      const pills = elements(child, 'span').filter(span => String(props(span).className || '').includes('arc-pill'));
      return pills.length ? unique(pills.map(text)).join(', ') : text(child);
    }));
    if (label && values.length) result.push(`${label}: ${values.join('; ')}`);
  });
  return unique([...result, ...definitionPairs(children), ...elements(children, 'p').map(text)]);
}

export function readArcFacts(flight, itemIds) {
  const records = readRecords(flight);
  const resolve = resolver(records);
  const knownItems = itemIds instanceof Set ? itemIds : new Set(itemIds);
  const drops = new Set(), sections = [], seen = new Set();
  const titles = { about: 'Об ARC', toughness: 'Прочность', armor: 'Броня и части', attacks: 'Атаки', perception: 'Обзор' };
  for (const record of records.values()) walk(record, node => {
    const key = Object.keys(node).find(key => /^data-arc-(drops|about|toughness|armor|attacks|perception)$/.test(key));
    if (!key || node[key] !== true) return;
    const kind = key.slice('data-arc-'.length);
    const children = resolve(node.children);
    if (kind === 'drops') {
      walk(children, child => {
        if (knownItems.has(child.id)) drops.add(child.id);
        if (typeof child.href === 'string') { const id = child.href.match(/\/items\/([\w-]+)/)?.[1]; if (knownItems.has(id)) drops.add(id); }
      });
      return;
    }
    let paragraphs = [];
    if (kind === 'about') paragraphs = elements(children, 'p').map(text);
    if (kind === 'toughness') walk(children, child => {
      if (!isElement(child)) return;
      const attributes = props(child);
      if (attributes.role === 'img' && typeof attributes['aria-label'] === 'string') paragraphs.push(attributes['aria-label']);
    });
    if (kind === 'armor') paragraphs = armorFacts(children);
    if (kind === 'attacks' || kind === 'perception') paragraphs = definitionPairs(children);
    if (kind === 'perception' && !paragraphs.some(value => /угол обзора/i.test(value))) walk(children, child => {
      if (!isElement(child)) return;
      const label = props(child)['aria-label'];
      if (typeof label === 'string' && /угол обзора/i.test(label)) paragraphs.push(label);
    });
    paragraphs = unique(paragraphs);
    if (!paragraphs.length) return;
    const title = clean(text(elements(children, 'h2')[0])) || titles[kind];
    const signature = `${title}\0${paragraphs.join('\0')}`;
    if (seen.has(signature)) return;
    seen.add(signature);
    sections.push({ title, paragraphs, text: paragraphs.join('\n') });
  });
  return { drops: [...drops], facts: { sections } };
}
