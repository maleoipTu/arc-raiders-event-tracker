import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { readFlight } from './arc-source.mjs';

const SITE = 'https://arctracker.io';
const OUTPUT = new URL('../.cache-research/current-skills.json', import.meta.url);

// Decode a JavaScript string literal as data. Never execute downloaded code.
export function decodeStringLiteral(source, start) {
  const quote = source[start];
  if (quote !== "'" && quote !== '"') throw new Error('Expected a quoted string');
  let value = '';
  for (let index = start + 1; index < source.length; index++) {
    let char = source[index];
    if (char === quote) return { value, end: index + 1 };
    if (char !== '\\') { value += char; continue; }
    char = source[++index];
    if (char === undefined) throw new Error('Incomplete escape');
    const simple = { n: '\n', r: '\r', t: '\t', b: '\b', f: '\f', v: '\v', '0': '\0', '\\': '\\', "'": "'", '"': '"' };
    if (Object.hasOwn(simple, char)) { value += simple[char]; continue; }
    if (char === '\n') continue;
    if (char === '\r') { if (source[index + 1] === '\n') index++; continue; }
    if (char === 'x' || char === 'u') {
      const length = char === 'x' ? 2 : 4;
      const digits = source.slice(index + 1, index + length + 1);
      if (digits.length !== length || !/^[\da-f]+$/i.test(digits)) throw new Error('Invalid hexadecimal escape');
      value += String.fromCharCode(Number.parseInt(digits, 16));
      index += length;
      continue;
    }
    throw new Error(`Unsupported string escape: ${char}`);
  }
  throw new Error('Unterminated string literal');
}

export function jsonLiterals(source) {
  const values = [];
  for (const match of source.matchAll(/JSON\.parse\(\s*(['"])/g)) {
    try {
      const literal = decodeStringLiteral(source, match.index + match[0].length - 1);
      values.push(JSON.parse(literal.value));
    } catch { /* Other string expressions are not game datasets. */ }
  }
  return values;
}

export function discoverSkillChunks(html) {
  const flight = readFlight(html);
  const paths = [];
  for (const line of flight.split('\n')) {
    const match = line.match(/^[\da-f]+:I(\[.*\])$/i);
    if (!match) continue;
    let record;
    try { record = JSON.parse(match[1]); } catch { continue; }
    if (record[2] !== 'SkillTreePlanner' || !Array.isArray(record[1])) continue;
    // The planner's module and its data dependencies are listed in its Flight import.
    paths.push(...record[1].filter(value => typeof value === 'string' && value.endsWith('.js')).reverse());
  }
  if (!paths.length) throw new Error('SkillTreePlanner import was not found in the current ARC Tracker page');
  return [...new Set(paths)].map(path => new URL(`/_next/${path}`, SITE).href);
}

function isSkillCatalog(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const nodes = Object.values(value);
  return nodes.length >= 30 && nodes.every(node => node && typeof node.id === 'string'
    && typeof node.category === 'string' && Number.isInteger(node.maxPoints)
    && Array.isArray(node.prerequisiteNodeIds) && typeof node.name === 'object');
}

export async function syncSkills({ fetchImpl = fetch, output = OUTPUT, allowCached = false } = {}) {
  let previous;
  try { previous = JSON.parse(await readFile(output, 'utf8')); } catch { /* First sync. */ }
  const get = async url => {
    const response = await fetchImpl(url, { signal: AbortSignal.timeout(30000), headers: { 'user-agent': 'ARC Event Tracker skill catalog sync' } });
    if (!response.ok) throw new Error(`Skill source returned HTTP ${response.status}: ${url}`);
    return response.text();
  };
  try {
    const chunks = discoverSkillChunks(await get(`${SITE}/ru/skill-tree`));
    if (previous?.skills?.length >= 30 && previous?.meta?.structureHash && previous.sourceChunks?.every(url => chunks.includes(url))) {
      const checked = { ...previous, checkedAt: new Date().toISOString(), cached: true };
      await writeFile(output, JSON.stringify(checked, null, 2));
      return checked;
    }
    let skills, meta, retired;
    const sourceChunks = [];
    for (const url of chunks) {
      let used = false;
      for (const value of jsonLiterals(await get(url))) {
        if (isSkillCatalog(value)) { skills = Object.values(value); used = true; }
        if (value && typeof value === 'object' && value.structureHash && Array.isArray(value.groups)) { meta = value; used = true; }
        if (value && typeof value === 'object' && !Array.isArray(value) && Object.values(value).length
          && Object.values(value).every(node => node && typeof node === 'object' && Object.hasOwn(node, 'replacedBy') && Number.isInteger(node.shareIndex))) { retired = value; used = true; }
      }
      if (used) sourceChunks.push(url);
      if (skills && meta) break;
    }
    if (!skills || !meta) throw new Error('Current skills or structure metadata were not found in ARC Tracker client data');
    const ids = new Set(skills.map(skill => skill.id));
    if (ids.size !== skills.length || skills.some(skill => skill.prerequisiteNodeIds.some(id => !ids.has(id)))) throw new Error('Invalid current skill graph');
    if (skills.some(skill => !skill.name.ru || !skill.description?.ru)) throw new Error('Current skill dataset is missing Russian text');
    if (!Array.isArray(meta.tracks) || meta.tracks.reduce((sum, track) => sum + track.nodeCount, 0) !== skills.length
      || meta.rootNodeIds.some(id => !ids.has(id)) || meta.groups.some(group => group.nodeIds.some(id => !ids.has(id)))) {
      throw new Error('Skill structure metadata does not match the node catalog');
    }
    const now = new Date().toISOString();
    const result = { source: 'ARC Tracker', sourceUrl: `${SITE}/ru/skill-tree`, sourceChunks,
      syncedAt: now, checkedAt: now, cached: false, count: skills.length, skills, meta, retired: retired || {} };
    if(output instanceof URL)await mkdir(new URL('.',output),{recursive:true});
    else {const path=await import('node:path');await mkdir(path.dirname(output),{recursive:true});}
    await writeFile(output, JSON.stringify(result, null, 2));
    return result;
  } catch (error) {
    if (!allowCached || !previous?.skills?.length) throw error;
    return { ...previous, cached: true, stale: true, error: error.message };
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === fileURLToPath(new URL(`file:///${process.argv[1].replaceAll('\\', '/')}`))) {
  const catalog = await syncSkills({ allowCached: process.argv.includes('--allow-cached') });
  console.log(`Current skills: ${catalog.count}; game ${catalog.meta.version}; structure ${catalog.meta.structureHash}; cached=${catalog.cached}`);
}
