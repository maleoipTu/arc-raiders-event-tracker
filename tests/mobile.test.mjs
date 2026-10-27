import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
// The project uses CommonJS for Electron; import the mobile ES module as a data URL.
const services = await readFile(new URL('../mobile/services.js', import.meta.url), 'utf8');
const { scheduleFromHtml, notificationGroups } = await import(`data:text/javascript;base64,${Buffer.from(services).toString('base64')}`);
const entry = { conditionName: 'Night Raid', mapDisplayName: 'Blue Gate', startTimestamp: 1800000000000, endTimestamp: 1800003600000, regionTimestamps: { 'east-asia': [1800007200000, 1800010800000] } };
test('reads official escaped schedule and applies region timestamps', () => {
  const html = JSON.stringify({ liveEntries: [entry] }).replaceAll('"', '\\"');
  assert.equal(scheduleFromHtml(html, 'east-asia').events[0].start, 1800007200000);
  assert.equal(scheduleFromHtml(html, 'europe').events[0].end, entry.endTimestamp);
});
test('reads plain JSON and brackets inside quoted names', () => {
  const html = JSON.stringify({ liveEntries: [{ ...entry, conditionName: 'Name [test]' }] });
  assert.equal(scheduleFromHtml(html).events[0].originalName, 'Name [test]');
});
test('rejects missing data and invalid time ranges', () => {
  assert.throws(() => scheduleFromHtml('<html>offline</html>'));
  assert.throws(() => scheduleFromHtml(JSON.stringify({ liveEntries: [{ ...entry, endTimestamp: entry.startTimestamp }] })));
});
test('groups simultaneous events and only schedules the next day', () => {
  const now = 1800000000000;
  const event = { title: 'Ночной рейд', location: 'Космопорт', start: now + 3600000 };
  const result = notificationGroups([event, { ...event, title: 'Шторм' }, { ...event, start: now - 1 }, { ...event, start: now + 90000000 }], 10, now);
  assert.equal(result.length, 1);
  assert.equal(result[0].schedule.at.getTime(), now + 3000000);
  assert.match(result[0].body, /Шторм/);
  assert.equal(result[0].isExactNotification, false);
});
test('lead time in the past schedules a near-future reminder', () => {
  const now = 1800000000000;
  assert.equal(notificationGroups([{ title: 'ARC', location: 'Карта', start: now + 60000 }], 10, now)[0].schedule.at.getTime(), now + 1500);
});
