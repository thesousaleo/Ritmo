import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSeed, currentStreak, bestStreak, keyOf, addDays } from '../src/lib/habits.js';
import { buildSnapshot, emptyPending, toHabitRow, uploadRows, createSyncEngine } from '../src/lib/sync.js';

const today = new Date(2026, 9, 28); // quarta

test('sequências dos exemplos', () => {
  const seed = buildSeed(today);
  const ler = seed.habits.find((h) => h.id === 'ler');
  assert.equal(currentStreak(ler, seed.log, today), 20);
  assert.ok(bestStreak(ler, seed.log, today) >= 20);
  const treino = seed.habits.find((h) => h.id === 'treino');
  // Hoje (quarta) ainda pendente não quebra a sequência
  assert.ok(currentStreak(treino, seed.log, today) >= 4);
});

test('pendente quebra a sequência a partir de ontem', () => {
  const h = { id: 'x', days: [0, 1, 2, 3, 4, 5, 6], target: 1, createdAt: '2026-10-01' };
  const log = { '2026-10-27': { x: 1 }, '2026-10-26': {}, '2026-10-25': { x: 1 } };
  assert.equal(currentStreak(h, log, today), 1);
});

test('snapshot: servidor + fila local por cima, hábitos excluídos somem', () => {
  const uid = 'u1';
  const habitRows = [
    { ...toHabitRow({ id: 'a', name: 'A', icon: 'Leaf', color: 'mint', period: 'morning', days: [1, 2], target: 1, unit: '', createdAt: '2026-10-01' }, uid, 1) },
    { ...toHabitRow({ id: 'b', name: 'B', icon: 'Leaf', color: 'mint', period: 'any', days: [1], target: 2, unit: '', createdAt: '2026-10-01' }, uid, 0) },
    { ...toHabitRow({ id: 'c', name: 'C', icon: 'Leaf', color: 'mint', period: 'any', days: [1], target: 1, unit: '', createdAt: '2026-10-01', deleted: true }, uid, 2) },
  ];
  const checkins = [
    { habit_id: 'a', day: '2026-10-27', count: 1 },
    { habit_id: 'b', day: '2026-10-27', count: 1 },
    { habit_id: 'c', day: '2026-10-27', count: 1 },
  ];
  const pending = emptyPending();
  pending.checkins['a|2026-10-27'] = { habit_id: 'a', day: '2026-10-27', count: 0 };
  pending.checkins['b|2026-10-28'] = { habit_id: 'b', day: '2026-10-28', count: 2 };
  const s = buildSnapshot(habitRows, checkins, { name: 'Leo' }, pending);
  assert.deepEqual(s.habits.map((h) => h.id), ['b', 'a']);
  assert.deepEqual(s.log, { '2026-10-27': { b: 1 }, '2026-10-28': { b: 2 } });
  assert.equal(s.name, 'Leo');
});

test('upload de conta nova leva hábitos e check-ins do aparelho', () => {
  const seed = buildSeed(today);
  const up = uploadRows(seed, 'u1');
  assert.equal(Object.keys(up.habits).length, 5);
  assert.ok(Object.keys(up.checkins).length > 300);
  assert.ok(Object.values(up.checkins).every((r) => r.count > 0 && r.user_id === 'u1'));
});

/* ---------- motor com um cliente falso em memória ---------- */
function fakeClient() {
  const db = { habits: new Map(), checkins: new Map(), profiles: new Map() };
  const keyFor = (table, r) => (table === 'habits' ? `${r.user_id}|${r.id}` : table === 'checkins' ? `${r.user_id}|${r.habit_id}|${r.day}` : r.user_id);
  const query = (table) => {
    let rows = () => [...db[table].values()];
    const q = {
      select: () => q,
      gt: (col, v) => ((rows = ((prev) => () => prev().filter((r) => r[col] > v))(rows)), q),
      order: () => q,
      range: (a, b) => Promise.resolve({ data: rows().slice(a, b + 1), error: null }),
      maybeSingle: () => Promise.resolve({ data: rows()[0] || null, error: null }),
      then: (res) => res({ data: rows(), error: null }),
      upsert: (input) => {
        for (const r of [].concat(input)) db[table].set(keyFor(table, r), { ...(db[table].get(keyFor(table, r)) || {}), ...r });
        return Promise.resolve({ error: null });
      },
      delete: () => ({ eq: () => (db[table].clear(), Promise.resolve({ error: null })) }),
    };
    return q;
  };
  return {
    db,
    from: query,
    channel: () => ({ on() { return this; }, subscribe() { return this; } }),
    removeChannel() {},
  };
}

globalThis.localStorage = { _m: {}, getItem(k) { return this._m[k] ?? null; }, setItem(k, v) { this._m[k] = v; }, removeItem(k) { delete this._m[k]; } };

test('motor: conta nova sobe dados; segundo aparelho recebe; alteração propaga', async () => {
  const client = fakeClient();
  const seed = buildSeed(today);

  // Aparelho A: primeira conexão com conta vazia → upload
  let snapA = null;
  const a = createSyncEngine({ client, onSnapshot: (s) => (snapA = s), onStatus: () => {} });
  assert.equal(await a.link('u1', { ...seed, name: 'Leo' }), 'uploaded');
  assert.equal(client.db.habits.size, 5);
  assert.equal(client.db.profiles.get('u1').name, 'Leo');

  // Aparelho B (outro storage): conta existente → substitui pelo servidor
  globalThis.localStorage._m = {};
  let snapB = null;
  const b = createSyncEngine({ client, onSnapshot: (s) => (snapB = s), onStatus: () => {} });
  assert.equal(await b.link('u1', buildSeed(addDays(today, -400))), 'replaced');
  assert.deepEqual(snapB.habits.map((h) => h.id).sort(), seed.habits.map((h) => h.id).sort());
  assert.equal(snapB.log[keyOf(today)].agua, 3);
  assert.equal(snapB.name, 'Leo');

  // B marca água; A faz pull e vê
  b.queueCheckin('agua', keyOf(today), 4);
  await new Promise((r) => setTimeout(r, 500));
  assert.equal(b.hasPending(), false);
  a.pull();
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(snapA.log[keyOf(today)].agua, 4);
});
