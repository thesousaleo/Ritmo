import test from 'node:test';
import assert from 'node:assert/strict';
import { buildFullSeed, stripSample, blankData } from '../src/lib/data.js';
import { normalizeHabit } from '../src/lib/habits.js';

const today = new Date(2026, 9, 29);

test('exemplos: o app nasce com exemplos e todos são reconhecidos', () => {
  const d = buildFullSeed(today);
  assert.equal(d.sample, true);
  const { data, ids, count } = stripSample(d);
  assert.ok(count > 50);
  assert.equal(data.sample, false);
  assert.equal(data.habits.length, 0);
  assert.equal(data.tasks.length, 0);
  assert.equal(data.events.length, 0);
  assert.equal(data.focus.length, 0);
  assert.deepEqual(data.log, {});
  assert.deepEqual(data.notes, {});
  assert.deepEqual(data.moods, {});
  assert.ok(ids.lists.includes('compras'));
  assert.ok(data.lists.some((l) => l.id === 'inbox'));
  assert.equal(stripSample(data).count, 0);
});

test('exemplos: o que a pessoa criou continua', () => {
  const d = buildFullSeed(today);
  const mine = normalizeHabit({ id: 'k9x2', name: 'Correr', createdAt: '2026-10-29' });
  d.habits.push(mine);
  d.log['2026-10-29'] = { ...d.log['2026-10-29'], k9x2: 1 };
  d.moods['2026-10-29'] = 4; // humor de hoje é de verdade (os exemplos só têm dias anteriores)
  d.tasks.push({ id: 'abc123', title: 'Minha tarefa', listId: 'compras', done: false });
  d.events.push({ id: 'ev9', title: 'Meu evento', date: '2026-10-30' });
  const { data, ids } = stripSample(d);
  assert.deepEqual(data.habits.map((h) => h.id), ['k9x2']);
  assert.deepEqual(data.log, { '2026-10-29': { k9x2: 1 } });
  assert.deepEqual(data.moods, { '2026-10-29': 4 });
  assert.deepEqual(data.tasks.map((t) => t.id), ['abc123']);
  assert.deepEqual(data.events.map((e) => e.id), ['ev9']);
  // A lista Compras tem tarefa minha: fica
  assert.ok(data.lists.some((l) => l.id === 'compras'));
  assert.equal(ids.lists.length, 0);
  assert.ok(!ids.moods.includes('2026-10-29'));
});

test('apagar tudo: só ficam nome, ajustes e o que é compartilhado comigo', () => {
  const d = buildFullSeed(today);
  d.name = 'Leo';
  d.settings = { theme: 'dark' };
  d.lists.push({ id: 'u1/casa', name: 'Casa da Ana', ownerId: 'u1' });
  d.tasks.push({ id: 'u1/t1', title: 'Compartilhada', listId: 'u1/casa', ownerId: 'u1' });
  const b = blankData(d);
  assert.equal(b.name, 'Leo');
  assert.deepEqual(b.settings, { theme: 'dark' });
  assert.equal(b.sample, false);
  assert.equal(b.habits.length, 0);
  assert.deepEqual(b.log, {});
  assert.deepEqual(b.moods, {});
  assert.equal(b.events.length, 0);
  assert.equal(b.focus.length, 0);
  assert.deepEqual(b.tasks.map((t) => t.id), ['u1/t1']);
  assert.ok(b.lists.some((l) => l.id === 'inbox'));
  assert.ok(b.lists.some((l) => l.id === 'u1/casa'));
  assert.ok(!b.lists.some((l) => l.id === 'compras'));
});
