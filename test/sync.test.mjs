import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildSeed, currentStreak, bestStreak, keyOf, addDays, daySummary, normalizeData, normalizeHabit,
  habitRate, weekdayRates, moodInsights, exportCsv, frequencyText, isScheduled,
} from '../src/lib/habits.js';
import { buildSnapshot, emptyPending, toHabitRow, uploadRows, createSyncEngine } from '../src/lib/sync.js';

const today = new Date(2026, 9, 28); // quarta
const daily = (extra = {}) => normalizeHabit({ id: 'x', name: 'X', icon: 'Leaf', color: 'mint', days: [0, 1, 2, 3, 4, 5, 6], target: 1, createdAt: '2026-09-01', ...extra });

test('sequências dos exemplos', () => {
  const seed = buildSeed(today);
  const ler = seed.habits.find((h) => h.id === 'ler');
  assert.ok(currentStreak(ler, seed, today) >= 13);
  assert.ok(bestStreak(ler, seed, today) >= currentStreak(ler, seed, today));
  const treino = seed.habits.find((h) => h.id === 'treino');
  assert.ok(currentStreak(treino, seed, today) >= 4);
});

test('pendente quebra a sequência a partir de ontem', () => {
  const data = normalizeData({ habits: [daily()], log: { '2026-10-27': { x: 1 }, '2026-10-25': { x: 1 } } });
  assert.equal(currentStreak(data.habits[0], data, today), 1);
});

test('pausa protege a sequência e some do resumo do dia', () => {
  const log = { '2026-10-27': { x: 1 }, '2026-10-23': { x: 1 }, '2026-10-22': { x: 1 } };
  const data = normalizeData({ habits: [daily()], log, breaks: [{ id: 'b', start: '2026-10-24', end: '2026-10-26' }] });
  assert.equal(currentStreak(data.habits[0], data, today), 3);
  assert.equal(isScheduled(data.habits[0], new Date(2026, 9, 25), data), false);
  assert.equal(daySummary(data, new Date(2026, 9, 25)).total, 0);
});

test('meta semanal: sequência em semanas e resumo do dia só soma', () => {
  const h = daily({ freq: 'weekly', perWeek: 2, createdAt: '2026-10-01' });
  const log = {
    // semana de 18/10: 2 vezes (cumpriu)
    '2026-10-19': { x: 1 }, '2026-10-21': { x: 1 },
    // semana de 11/10: 2 vezes (cumpriu)
    '2026-10-12': { x: 1 }, '2026-10-16': { x: 1 },
    // semana de 25/10 (atual): 1 vez até agora
    '2026-10-26': { x: 1 },
  };
  const data = normalizeData({ habits: [h], log });
  assert.equal(currentStreak(data.habits[0], data, today), 2);
  assert.deepEqual([daySummary(data, today).total, daySummary(data, new Date(2026, 9, 26)).done], [0, 1]);
  assert.equal(frequencyText(data.habits[0]), '2× por semana');
  assert.deepEqual(habitRate(data.habits[0], data, today), { rate: 0.5, done: 2, total: 4 });
});

test('humor por hábito e taxa por dia da semana', () => {
  const seed = buildSeed(today);
  const insights = moodInsights(seed, today);
  assert.ok(insights.length > 0);
  const treino = insights.find((i) => i.h.id === 'treino');
  assert.ok(treino && treino.diff > 0, 'dias com treino têm humor melhor nos exemplos');
  const rates = weekdayRates(seed.habits.find((h) => h.id === 'treino'), seed, today);
  assert.equal(rates[0], null); // domingo não programado
  assert.ok(rates[1] > 0);
});

test('exportação CSV', () => {
  const csv = exportCsv(buildSeed(today));
  const lines = csv.split('\r\n');
  assert.ok(lines[0].includes('data;hábito;tipo'));
  assert.ok(lines.length > 300);
});

test('snapshot: servidor + fila local, notas, humor e exclusões', () => {
  const uid = 'u1';
  const mk = (id, pos, extra = {}) => toHabitRow(daily({ id, ...extra }), uid, pos);
  const habitRows = [mk('a', 1), mk('b', 0, { freq: 'weekly', perWeek: 4, reminder: '07:30' }), mk('c', 2, { deleted: true })];
  const checkinRows = [
    { habit_id: 'a', day: '2026-10-27', count: 1, note: 'boa' },
    { habit_id: 'b', day: '2026-10-27', count: 1, note: '' },
    { habit_id: 'c', day: '2026-10-27', count: 1, note: '' },
  ];
  const pending = emptyPending();
  pending.checkins['a|2026-10-27'] = { habit_id: 'a', day: '2026-10-27', count: 0, note: 'boa' };
  pending.moods['2026-10-28'] = { day: '2026-10-28', mood: 4 };
  const s = buildSnapshot({ habitRows, checkinRows, moodRows: [{ day: '2026-10-27', mood: 2 }], profileRow: { name: 'Leo', breaks: [], weekly_email: true } }, pending);
  assert.deepEqual(s.habits.map((h) => h.id), ['b', 'a']);
  assert.equal(s.habits[0].freq, 'weekly');
  assert.equal(s.habits[0].reminder, '07:30');
  assert.deepEqual(s.log, { '2026-10-27': { b: 1 } });
  assert.deepEqual(s.notes, { '2026-10-27': { a: 'boa' } });
  assert.deepEqual(s.moods, { '2026-10-27': 2, '2026-10-28': 4 });
  assert.equal(s.weeklyEmail, true);
});

test('upload de conta nova leva hábitos, check-ins, notas e humor', () => {
  const seed = buildSeed(today);
  const up = uploadRows(seed, 'u1');
  assert.equal(Object.keys(up.habits).length, 6);
  assert.ok(Object.keys(up.checkins).length > 300);
  assert.ok(Object.keys(up.moods).length > 30);
  assert.ok(Object.values(up.checkins).some((r) => r.note));
});

/* ---------- motor com um cliente falso em memória ---------- */
function fakeClient() {
  const db = { habits: new Map(), checkins: new Map(), profiles: new Map(), moods: new Map(), lists: new Map(), tasks: new Map(), events: new Map(), focus_sessions: new Map() };
  const keyFor = (table, r) =>
    ['habits', 'lists', 'tasks', 'events', 'focus_sessions'].includes(table) ? `${r.user_id}|${r.id}` : table === 'checkins' ? `${r.user_id}|${r.habit_id}|${r.day}` : table === 'moods' ? `${r.user_id}|${r.day}` : r.user_id;
  const query = (table) => {
    const rows = () => [...db[table].values()];
    const q = {
      select: () => q,
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
  return { db, from: query, channel: () => ({ on() { return this; }, subscribe() { return this; } }), removeChannel() {} };
}

globalThis.localStorage = { _m: {}, getItem(k) { return this._m[k] ?? null; }, setItem(k, v) { this._m[k] = v; }, removeItem(k) { delete this._m[k]; } };

test('motor: conta nova sobe dados; segundo aparelho recebe; alterações propagam', async () => {
  const client = fakeClient();
  const seed = { ...buildSeed(today), name: 'Leo', breaks: [{ id: 'b1', start: '2026-12-20', end: '2026-12-31' }] };

  let snapA = null;
  const a = createSyncEngine({ client, onSnapshot: (s) => (snapA = s), onStatus: () => {} });
  assert.equal(await a.link('u1', seed), 'uploaded');
  assert.equal(client.db.habits.size, 6);
  assert.equal(client.db.profiles.get('u1').breaks.length, 1);

  globalThis.localStorage._m = {};
  let snapB = null;
  const b = createSyncEngine({ client, onSnapshot: (s) => (snapB = s), onStatus: () => {} });
  assert.equal(await b.link('u1', buildSeed(addDays(today, -400))), 'replaced');
  assert.equal(snapB.log[keyOf(today)].agua, 3);
  assert.equal(snapB.name, 'Leo');
  assert.equal(snapB.breaks[0].start, '2026-12-20');
  assert.ok(Object.keys(snapB.moods).length > 30);

  b.queueCheckin('agua', keyOf(today), 4, 'garrafa nova');
  b.queueMood(keyOf(today), 5);
  await new Promise((r) => setTimeout(r, 500));
  assert.equal(b.hasPending(), false);
  a.pull();
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(snapA.log[keyOf(today)].agua, 4);
  assert.equal(snapA.notes[keyOf(today)].agua, 'garrafa nova');
  assert.equal(snapA.moods[keyOf(today)], 5);
});
