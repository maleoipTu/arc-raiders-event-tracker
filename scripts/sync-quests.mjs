import { mkdir, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SOURCE_URL = process.env.ARC_QUESTS_URL || 'https://arctracker.io/ru/quests';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputDir = path.join(root, 'assets', 'data');
const outputPath = path.join(outputDir, 'quests.ru.js');

function readFlightPayload(html) {
  const chunks = [];
  const pattern = /<script>self\.__next_f\.push\((\[1,"(?:\\.|[^"\\])*"\])\)<\/script>/gs;
  for (const match of html.matchAll(pattern)) {
    try {
      const frame = JSON.parse(match[1]);
      if (typeof frame[1] === 'string') chunks.push(frame[1]);
    } catch {
      // Other Next.js frames are not part of the quest payload.
    }
  }
  return chunks.join('');
}

function readJsonObject(source, marker) {
  const markerIndex = source.indexOf(marker);
  if (markerIndex < 0) throw new Error(`Marker not found: ${marker}`);
  const start = source.indexOf('{', markerIndex + marker.length);
  if (start < 0) throw new Error(`Object not found after: ${marker}`);

  let depth = 0;
  let quoted = false;
  let escaped = false;
  for (let index = start; index < source.length; index += 1) {
    const character = source[index];
    if (quoted) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === '"') quoted = false;
      continue;
    }
    if (character === '"') quoted = true;
    else if (character === '{') depth += 1;
    else if (character === '}') {
      depth -= 1;
      if (depth === 0) return JSON.parse(source.slice(start, index + 1));
    }
  }
  throw new Error(`Unterminated object after: ${marker}`);
}

function collectObjectiveMeta(node, result = {}) {
  if (!node || typeof node !== 'object') return result;
  if (node.type === 'step' && Number.isInteger(node.index)) {
    result[node.index] = {
      amount: Number(node.amount) || null,
      optional: Boolean(node.optional),
    };
  }
  for (const child of node.children || []) collectObjectiveMeta(child, result);
  return result;
}

function cleanItems(items) {
  return (items || []).map(({ itemId, quantity }) => ({
    id: itemId,
    quantity: Number(quantity) || 1,
  }));
}

const inputIndex=process.argv.indexOf('--from-file');
const response = inputIndex>=0 ? null : await fetch(SOURCE_URL, {
  headers: { 'user-agent': 'ARC-Event-Tracker quest catalog updater' },
});
if (response && !response.ok) throw new Error(`ARC Tracker returned ${response.status}`);

const html = inputIndex>=0 ? await readFile(process.argv[inputIndex+1],'utf8') : await response.text();
const flight = readFlightPayload(html);
const catalog = readJsonObject(flight, '"catalog":');
const syncedAt = new Date().toISOString();

const quests = Object.values(catalog).map((quest) => ({
  id: quest.id,
  slug: quest.slug,
  name: quest.name,
  nameEn: quest.nameEn || quest.name,
  trader: quest.trader || 'Неизвестно',
  description: quest.description || '',
  maps: quest.maps || [],
  xp: Number(quest.xp) || 0,
  imageUrl: quest.imageUrl || '',
  objectives: (quest.objectives || []).map((text, index) => ({
    text,
    ...(collectObjectiveMeta(quest.objectiveTree)[index] || {}),
  })),
  oneRaid: Boolean(quest.objectiveTree?.oneRaid),
  ordered: quest.objectiveTree?.type === 'sequence',
  previousQuestIds: quest.previousQuestIds || [],
  nextQuestIds: quest.nextQuestIds || [],
  requiredItems: cleanItems(quest.requiredItemIds),
  rewardItems: cleanItems(quest.rewardItemIds),
  grantedItems: cleanItems(quest.grantedItemIds),
})).sort((a, b) => a.name.localeCompare(b.name, 'ru'));

if (quests.length < 100) throw new Error(`Only ${quests.length} quests were found; refusing to overwrite catalog`);

const payload = {
  source: 'ARC Tracker / RaidTheory ARC Data Project',
  sourceUrl: 'https://arctracker.io/ru/quests',
  attributionUrl: 'https://github.com/RaidTheory/arcraiders-data',
  syncedAt,
  count: quests.length,
  quests,
};

await mkdir(outputDir, { recursive: true });
await writeFile(outputPath, `window.ARC_QUEST_CATALOG = ${JSON.stringify(payload, null, 2)};\n`, 'utf8');
console.log(`Saved ${quests.length} quests to ${outputPath}`);
