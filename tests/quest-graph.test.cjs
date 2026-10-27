const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { createGraph, closure, completeThrough, uncomplete, layout } = require('../quest-graph.js');
const quest = (id, previousQuestIds = []) => ({ id, previousQuestIds, objectives: [{ text: id }, { text: 'Вторая цель' }] });
const quests = [quest('root'), quest('left', ['root']), quest('right', ['root']), quest('merge', ['left', 'right']), quest('after', ['merge']), quest('sibling', ['root']), quest('other')];
const graph = createGraph(quests);
test('completing a merged quest completes both prerequisite branches, not siblings or successors', () => {
  const original = { sibling: { completed: false, objectives: [true] }, other: { completed: true, objectives: [true, true] } };
  const result = completeThrough(graph, original, 'merge');
  assert.deepEqual(new Set(result.changed), new Set(['root', 'left', 'right', 'merge']));
  for (const id of result.changed) assert.deepEqual(result.progress[id], { completed: true, objectives: [true, true] });
  assert.deepEqual(result.progress.sibling, original.sibling);
  assert.deepEqual(result.progress.other, original.other);
  assert.equal(result.progress.after, undefined);
  assert.equal(original.root, undefined);
});
test('completion is idempotent and fills missing objective flags', () => {
  const first = completeThrough(graph, {}, 'merge');
  assert.equal(completeThrough(graph, first.progress, 'merge').changed.length, 0);
  assert.equal(completeThrough(graph, { root: { completed: true, objectives: [] } }, 'root').changed.length, 1);
});
test('unchecking only resets the selected quest and never removes prerequisite progress', () => {
  const completed = completeThrough(graph, {}, 'merge').progress;
  const result = uncomplete(completed, 'merge');
  assert.equal(result.merge.completed, false);
  assert.deepEqual(result.merge.objectives, []);
  assert.equal(result.left.completed, true);
  assert.equal(result.root.completed, true);
  assert.equal(completed.merge.completed, true);
});
test('closure excludes the selected node and follows only the requested direction', () => {
  assert.deepEqual(new Set(closure(graph, 'merge')), new Set(['left', 'right', 'root']));
  assert.deepEqual([...closure(graph, 'merge', 'children')], ['after']);
});
test('invalid graphs and unknown selections cannot partially change progress', () => {
  assert.throws(() => createGraph([quest('a', ['missing'])]));
  assert.throws(() => createGraph([quest('a', ['b']), quest('b', ['a'])]));
  assert.throws(() => createGraph([quest('a'), quest('a')]));
  assert.throws(() => completeThrough(graph, {}, 'missing'));
});
test('the bundled catalog is acyclic; layout has no overlaps and every edge advances', () => {
  const scope = { window: {} };
  vm.runInNewContext(fs.readFileSync('assets/data/quests.ru.js', 'utf8'), scope);
  const catalog = scope.window.ARC_QUEST_CATALOG.quests;
  const actual = createGraph(catalog), map = layout(actual);
  assert.equal(actual.byId.size, 123);
  assert.equal(map.nodes.size, catalog.length);
  for (const [id, point] of map.nodes) {
    assert.ok(point.x >= 0 && point.y >= 0 && point.x + point.width <= map.width && point.y + point.height <= map.height);
    for (const parent of actual.parents.get(id)) assert.ok(map.nodes.get(parent).x + point.width < point.x);
    for (const [otherId, other] of map.nodes) {
      if (id === otherId) continue;
      assert.ok(point.x + point.width <= other.x || other.x + other.width <= point.x || point.y + point.height <= other.y || other.y + other.height <= point.y, `overlap ${id}/${otherId}`);
    }
  }
  const middle = actual.order.find(id => actual.parents.get(id).length > 1 && actual.children.get(id).length);
  const expected = closure(actual, middle); expected.add(middle);
  assert.deepEqual(new Set(completeThrough(actual, {}, middle).changed), expected);
});
