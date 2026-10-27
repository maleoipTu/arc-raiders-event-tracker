(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ARCQuestGraph = api;
})(typeof window === 'undefined' ? globalThis : window, function () {
  'use strict';
  function createGraph(quests) {
    const byId = new Map(quests.map(quest => [quest.id, quest]));
    if (byId.size !== quests.length) throw new Error('Повторяющийся ID квеста');
    const parents = new Map(), children = new Map(quests.map(quest => [quest.id, []]));
    for (const quest of quests) {
      const ids = [...new Set(quest.previousQuestIds || [])];
      if (ids.some(id => !byId.has(id))) throw new Error(`Не найден предшественник: ${quest.id}`);
      parents.set(quest.id, ids);
      ids.forEach(id => children.get(id).push(quest.id));
    }
    const remaining = new Map([...parents].map(([id, ids]) => [id, ids.length]));
    const roots = quests.filter(quest => !remaining.get(quest.id)).map(quest => quest.id);
    const queue = [...roots], order = [], levels = new Map(roots.map(id => [id, 0]));
    while (queue.length) {
      const id = queue.shift(); order.push(id);
      for (const next of children.get(id)) {
        levels.set(next, Math.max(levels.get(next) || 0, levels.get(id) + 1));
        remaining.set(next, remaining.get(next) - 1);
        if (!remaining.get(next)) queue.push(next);
      }
    }
    if (order.length !== quests.length) throw new Error('В зависимостях квестов обнаружен цикл');
    return { byId, parents, children, roots, order, levels };
  }
  function closure(graph, id, direction = 'parents') {
    if (!graph.byId.has(id)) return new Set();
    const result = new Set(), stack = [...graph[direction].get(id)];
    while (stack.length) {
      const current = stack.pop();
      if (current === id || result.has(current)) continue;
      result.add(current); stack.push(...graph[direction].get(current));
    }
    return result;
  }
  function completeThrough(graph, progress, id) {
    if (!graph.byId.has(id)) throw new Error('Квест не найден');
    const required = closure(graph, id); required.add(id);
    const next = { ...progress }, changed = [];
    for (const current of graph.order.filter(value => required.has(value))) {
      const quest = graph.byId.get(current), old = progress[current];
      if (!old?.completed || quest.objectives.some((_, index) => !old.objectives?.[index])) changed.push(current);
      next[current] = { ...old, completed: true, objectives: quest.objectives.map(() => true) };
    }
    return { progress: next, changed };
  }
  function uncomplete(progress, id) {
    return { ...progress, [id]: { ...progress[id], completed: false, objectives: [] } };
  }
  function layout(graph, ids = new Set(graph.byId.keys())) {
    const layers = new Map();
    graph.order.filter(id => ids.has(id)).forEach(id => {
      const level = graph.levels.get(id);
      if (!layers.has(level)) layers.set(level, []);
      layers.get(level).push(id);
    });
    const ranks = [...layers.keys()].sort((a, b) => a - b);
    const rows = new Map();
    const updateRows = () => layers.forEach(nodes => nodes.forEach((id, index) => rows.set(id, index - nodes.length / 2)));
    updateRows();
    for (let pass = 0; pass < 4; pass++) {
      const direction = pass % 2 ? 'children' : 'parents';
      for (const rank of pass % 2 ? [...ranks].reverse() : ranks) {
        const score = id => {
          const connected = graph[direction].get(id).filter(value => ids.has(value));
          return connected.length ? connected.reduce((sum, value) => sum + rows.get(value), 0) / connected.length : rows.get(id);
        };
        layers.get(rank).sort((a, b) => score(a) - score(b)); updateRows();
      }
    }
    const maxRows = Math.max(1, ...[...layers.values()].map(nodes => nodes.length));
    const width = Math.max(480, (ranks.at(-1) || 0) * 294 + 272), height = Math.max(380, maxRows * 126 + 76);
    const nodes = new Map();
    layers.forEach((list, level) => list.forEach((id, index) => nodes.set(id, { x: 24 + level * 294, y: 62 + (index + (maxRows - list.length) / 2) * 126, width: 224, height: 94 })));
    return { nodes, layers, width, height };
  }
  return { createGraph, closure, completeThrough, uncomplete, layout };
});
