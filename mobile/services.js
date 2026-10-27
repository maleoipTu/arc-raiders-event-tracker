export function extractScheduleArray(html, key = 'liveEntries') {
  for (const escaped of [true, false]) {
    const token = escaped ? `\\"${key}\\":` : `"${key}":`;
    const index = html.indexOf(token);
    if (index < 0) continue;
    const start = html.indexOf('[', index + token.length);
    if (start < 0) continue;
    let depth = 0, quoted = false, slash = false;
    const source = escaped ? html.slice(start).replaceAll('\\"', '"') : html.slice(start);
    for (let i = 0; i < source.length; i++) {
      const ch = source[i];
      if (quoted) { if (slash) slash = false; else if (ch === '\\') slash = true; else if (ch === '"') quoted = false; continue; }
      if (ch === '"') quoted = true;
      else if (ch === '[') depth++;
      else if (ch === ']' && --depth === 0) return JSON.parse(source.slice(0, i + 1));
    }
  }
  return [];
}

export function scheduleFromHtml(html, region = 'europe') {
  const entries = extractScheduleArray(html);
  if (!entries.length) throw new Error('Официальное расписание временно недоступно.');
  return { region, syncedAt: Date.now(), events: entries.map(entry => {
    const times = region === 'europe' ? null : entry.regionTimestamps?.[region];
    const start = times?.[0] ?? entry.startTimestamp, end = times?.[1] ?? entry.endTimestamp;
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) throw new Error('Некорректное время события.');
    return { id: `${entry.conditionName}|${entry.mapDisplayName}|${start}`, originalName: entry.conditionName, originalMap: entry.mapDisplayName, start, end };
  }) };
}

export function notificationGroups(events, lead, now = Date.now()) {
  const groups = new Map();
  for (const event of events) {
    if (!Number.isFinite(event.start) || event.start <= now || event.start > now + 24 * 60 * 60 * 1000) continue;
    const at = Math.max(now + 1500, event.start - lead * 60000);
    if (!groups.has(at)) groups.set(at, []);
    groups.get(at).push(event);
  }
  return [...groups].slice(0, 60).map(([at, items]) => ({
    id: Math.floor(items[0].start / 1000) % 2147483647, title: items.length === 1 ? items[0].title : `События ARC · ${items.length}`,
    body: items.map(item => `${item.title} · ${item.location}`).join('\n'), schedule: { at: new Date(at), allowWhileIdle: true }, channelId: 'arc-events', isExactNotification: false,
    extra: { startsAt: items[0].start }
  }));
}
