import test from 'node:test';
import assert from 'node:assert/strict';
import { readFlight, readObject } from '../scripts/arc-source.mjs';
import { decodeStringLiteral, jsonLiterals, discoverSkillChunks } from '../scripts/sync-skills.mjs';
import { readArcFacts } from '../scripts/arc-facts.mjs';

const frame = value => `<script>self.__next_f.push(${JSON.stringify(value)})</script>`;
const element = (tag, children, attributes = {}) => ['$', tag, null, { ...attributes, children }];
const section = (kind, children) => element('section', children, { [`data-arc-${kind}`]: true });
const records = entries => entries.map(([id, value]) => `${id}:${JSON.stringify(value)}`).join('\n');

test('Flight stream chunks may split JSON inside Russian text without adding bytes', () => {
  const html = frame([0]) + frame([1, '1:{"catalog":{"name":"Ар'])
    + '<script>unrelatedCode()</script>' + frame([1, 'к","labels":["a}","b["]}}\n']) + frame([2, null]);
  const flight = readFlight(html);
  assert.equal(flight, '1:{"catalog":{"name":"Арк","labels":["a}","b["]}}\n');
  assert.deepEqual(readObject(flight, '"catalog":'), { name: 'Арк', labels: ['a}', 'b['] });
});

test('balanced data extraction handles nested arrays, quoted braces and escaped quotes', () => {
  const value = { name: 'A "quoted" } item', nested: [{ text: '\\ path [ ]' }], empty: {} };
  const source = `prefix "catalog": ${JSON.stringify(value)}, "other": {"doNotRead":true}`;
  assert.deepEqual(readObject(source, '"catalog":'), value);
  assert.deepEqual(readObject('"rows":[{"id":1},[2,3]]', '"rows":'), [{ id: 1 }, [2, 3]]);
  assert.equal(readObject(source, '"missing":'), null);
  assert.equal(readObject('"catalog":"$L42"', '"catalog":'), null, 'RSC references are not JSON objects');
  assert.throws(() => readObject('"catalog":{"rows":[1,2]', '"catalog":'), /Incomplete JSON/);
});

test('JavaScript string decoder reads emitted escapes without executing a program', () => {
  const source = String.raw`'A\x42\u0043\' \\ \n end' trailing`;
  const literal = decodeStringLiteral(source, 0);
  assert.equal(literal.value, "ABC' \\ \n end");
  assert.equal(source.slice(literal.end), ' trailing');
  assert.equal(decodeStringLiteral('"double\\\" quote"', 0).value, 'double" quote');
  for (const bad of [String.raw`'\xZZ'`, String.raw`'\uZZZZ'`, "'unfinished", String.raw`'\q'`]) {
    assert.throws(() => decodeStringLiteral(bad, 0));
  }
});

test('JSON literals are parsed as inert data, while expressions and malformed values are ignored', () => {
  globalThis.arcSourceTestExecuted = false;
  try {
    const code = `JSON.parse('{"name":"Привет","tip":"Не выполнить код"}');`
      + `globalThis.arcSourceTestExecuted=true; JSON.parse(window.secret); JSON.parse('broken');`;
    assert.deepEqual(jsonLiterals(code), [{ name: 'Привет', tip: 'Не выполнить код' }]);
    assert.equal(globalThis.arcSourceTestExecuted, false);
  } finally { delete globalThis.arcSourceTestExecuted; }
});

test('skill dependency discovery follows the current planner Flight import, including changed hashes', () => {
  const entry = 'a:I' + JSON.stringify([93501, ['12', 'static/chunks/data-new-hash.js', '93501', 'static/chunks/planner-new-hash.js'], 'SkillTreePlanner']) + '\n';
  const html = frame([1, entry]);
  assert.deepEqual(discoverSkillChunks(html), [
    'https://arctracker.io/_next/static/chunks/planner-new-hash.js',
    'https://arctracker.io/_next/static/chunks/data-new-hash.js',
  ]);
  assert.throws(() => discoverSkillChunks(frame([1, 'a:["not a planner"]\n'])), /SkillTreePlanner/);
});

test('ARC toughness excludes scale endpoint legends and preserves the accessible actual value', () => {
  const flight = records([['1', section('toughness', [
    element('h2', 'Прочность'), element('div', 'decorative', { role: 'img', 'aria-label': 'Тяжелая: уровень 4 из 5' }),
    element('div', [element('span', 'Хрупкая'), element('span', 'Босс')]),
  ])]]);
  assert.deepEqual(readArcFacts(flight, new Set()).facts.sections, [{
    title: 'Прочность', paragraphs: ['Тяжелая: уровень 4 из 5'], text: 'Тяжелая: уровень 4 из 5',
  }]);
});

test('ARC attacks and perception retain dt/dd labels and resolve lazy and colon-path references', () => {
  const flight = records([
    ['1', section('attacks', '$L2')],
    ['2', element('dl', [element('dt', 'Орудие'), element('dd', '$3:damage')])],
    ['3', { damage: '6,5' }],
    ['4', section('perception', [element('svg', null, { 'aria-label': 'Угол обзора: 240 градусов' }), '$L5'])],
    ['5', element('dl', [element('dt', 'Замечает вас с расстояния'), element('dd', '60 м')])],
  ]);
  const facts = readArcFacts(flight, new Set()).facts.sections;
  assert.deepEqual(facts.find(value => value.title === 'Атаки').paragraphs, ['Орудие: 6,5']);
  assert.deepEqual(facts.find(value => value.title === 'Обзор').paragraphs, ['Замечает вас с расстояния: 60 м', 'Угол обзора: 240 градусов']);
});

test('ARC armor groups part names and excludes hidden decorations without duplicating notes', () => {
  const flight = records([['1', section('armor', [
    element('div', [element('h3', 'Разрушаемые части'), element('span', [
      element('span', 'Ноги', { className: 'arc-pill' }), element('span', 'Ядро', { className: 'arc-pill' }),
      element('span', 'Иконка', { 'aria-hidden': true }),
    ]), element('p', 'Есть уязвимое место.')]),
  ])]]);
  assert.deepEqual(readArcFacts(flight, []).facts.sections[0].paragraphs, ['Разрушаемые части: Ноги, Ядро', 'Есть уязвимое место.']);
});

test('ARC descriptions tolerate cycles and missing references while preserving available paragraphs', () => {
  const flight = records([
    ['1', section('about', '$L2')],
    ['2', element('p', ['Описание ARC.', '$L3', '$L999', '$undefined'])],
    ['3', '$L2'],
  ]) + '\na:I[1,[],"ExecutableComponent"]\nb:invalid';
  assert.equal(readArcFacts(flight, []).facts.sections[0].text, 'Описание ARC.');
});

test('ARC drops are scoped to the drops section, deduplicated and restricted to real catalog items', () => {
  const drops = section('drops', '$L2');
  const flight = records([
    ['1', drops],
    ['2', [element('$L8', null, { item: { id: 'drop_a' } }), element('a', 'Материал', { href: '/ru/items/drop_b' }),
      element('$L8', null, { item: { id: 'drop_a' } }), element('$L8', null, { item: { id: 'not_in_catalog' } })]],
    ['3', element('aside', null, { item: { id: 'unrelated_catalog_item' } })],
    ['4', drops],
  ]);
  assert.deepEqual(readArcFacts(flight, new Set(['drop_a', 'drop_b', 'unrelated_catalog_item'])).drops, ['drop_a', 'drop_b']);
});
