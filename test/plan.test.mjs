import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeTask, normalizeEvent } from '../src/lib/tasks.js';
import { freeSlots, dayLoad, autoSchedule, reorganizeOverdue, whatNow } from '../src/lib/plan.js';
import { gardenOf, billsSummary, countdowns, procrastinationRadar, yearActivity, weekReview, onThisDay } from '../src/lib/insights.js';
import { settingsOf, resolveTheme, onColor } from '../src/lib/settings.js';
import { buildFullSeed } from '../src/lib/data.js';
import { normalizeData, currentStreak, daySummary, habitDayState, normalizeHabit } from '../src/lib/habits.js';

const TODAY = '2026-10-29';
const S = settingsOf({ settings: { workStart: '09:00', workEnd: '18:00', dailyCapacity: 240 } });
const base = (tasks, events = []) => ({ tasks: tasks.map(normalizeTask), events: events.map(normalizeEvent), lists: [], habits: [], log: {} });

test('horários livres e carga do dia', () => {
  const data = base([{ id: 'a', title: 'A', date: TODAY, time: '13:00', duration: 60 }], [{ id: 'e', title: 'Reunião', date: TODAY, endDate: TODAY, start: '10:00', end: '11:00', allDay: false }]);
  const slots = freeSlots(data, TODAY, S);
  assert.deepEqual(slots.map((s) => [s.start, s.end]), [[540, 600], [660, 780], [840, 1080]]);
  const now = new Date(2026, 9, 29, 11, 7);
  assert.equal(freeSlots(data, TODAY, S, now)[0].start, 675);
  const many = base(Array.from({ length: 10 }, (_, i) => ({ id: `t${i}`, title: `T${i}`, date: TODAY, duration: 45 })));
  assert.equal(dayLoad(many, TODAY, S).over, true);
});

test('planejar meu dia encaixa por urgência', () => {
  const data = base(
    [
      { id: 'low', title: 'Baixa', date: TODAY, priority: 0, duration: 30 },
      { id: 'high', title: 'Alta', date: TODAY, priority: 3, duration: 60 },
      { id: 'late', title: 'Atrasada', date: '2026-10-25', priority: 1, duration: 30 },
    ],
    [{ id: 'e', title: 'Reunião', date: TODAY, endDate: TODAY, start: '09:00', end: '10:00', allDay: false }]
  );
  const { placed, left } = autoSchedule(data, TODAY, S, new Date(2026, 9, 29, 8, 0));
  assert.equal(left.length, 0);
  assert.deepEqual(placed.map((p) => [p.id, p.time]), [['high', '10:00'], ['late', '11:00'], ['low', '11:30']]);
});

test('reorganizar atrasadas respeita capacidade e dias úteis', () => {
  const tasks = Array.from({ length: 6 }, (_, i) => ({ id: `t${i}`, title: `T${i}`, date: '2026-10-20', duration: 90, priority: i % 3 }));
  const changes = reorganizeOverdue(base(tasks), TODAY, S);
  assert.equal(changes.length, 6);
  const perDay = {};
  for (const c of changes) perDay[c.date] = (perDay[c.date] || 0) + 1;
  assert.ok(!perDay['2026-10-31'] && !perDay['2026-11-01'] && !perDay['2026-11-02'], 'pula fim de semana e Finados');
  assert.ok(Object.values(perDay).every((n) => n <= 2));
});

test('o que faço agora', () => {
  const data = base([
    { id: 'a', title: 'Ler', date: TODAY, energy: 1, duration: 20 },
    { id: 'b', title: 'Relatório', date: TODAY, energy: 3, priority: 2, duration: 60 },
  ]);
  const r = whatNow(data, new Date(2026, 9, 29, 9, 0), S);
  assert.equal(r.task.id, 'b');
  assert.equal(whatNow(base([]), new Date(), S), null);
});

test('insights: jardim, contas, contagem regressiva, radar, mapa do ano, revisão', () => {
  const seed = buildFullSeed(new Date(2026, 9, 29));
  const g = gardenOf(seed, new Date(2026, 9, 29));
  assert.ok(g.length > 0 && g.every((x) => x.stage >= 0 && x.stage <= 4));
  const data = base(
    [
      { id: 'c1', title: 'Luz', listId: 'contas', date: '2026-10-10', amount: 120.5, done: true, completedAt: '2026-10-09T12:00:00Z' },
      { id: 'c2', title: 'Água', listId: 'contas', date: '2026-10-30', amount: 80 },
      { id: 'p', title: 'Empurrada', date: '2026-10-28', postponed: 4 },
    ],
    [{ id: 'n', title: 'Aniversário', date: '2026-03-10', endDate: '2026-03-10', repeat: 'yearly', countdown: true }]
  );
  assert.deepEqual(billsSummary(data, { id: 'contas' }, '2026-10'), { total: 200.5, paid: 120.5, open: 80, count: 1 });
  assert.equal(countdowns(data, TODAY)[0].date, '2027-03-10');
  assert.equal(procrastinationRadar(data, TODAY)[0].t.id, 'p');
  assert.ok(yearActivity(seed, 2026).map.size > 10);
  const r = weekReview(seed, new Date(2026, 9, 29));
  assert.ok(r.done.length >= 1 && r.focusMin > 0);
  assert.equal(onThisDay(seed, TODAY), null);
});

test('dia difícil protege sequência; pausa só de um hábito; check mínimo', () => {
  const h = normalizeHabit({ id: 'x', name: 'X', createdAt: '2026-10-01' });
  const y = normalizeHabit({ id: 'y', name: 'Y', createdAt: '2026-10-01' });
  const data = normalizeData({
    habits: [h, y],
    log: { '2026-10-28': { x: 1, y: 1 }, '2026-10-26': { x: 1 }, '2026-10-25': { x: 1 } },
    days: { '2026-10-27': { hard: true } },
    minimal: { '2026-10-28': { x: true } },
    breaks: [{ id: 'b', start: '2026-10-25', end: '2026-10-26', habitIds: ['y'] }],
  });
  const today = new Date(2026, 9, 29);
  assert.equal(currentStreak(h, data, today), 3);
  assert.equal(currentStreak(y, data, today), 1); // 28 feito, 27 difícil, 26-25 pausa só do Y, 24 quebra
  assert.equal(habitDayState(h, data, new Date(2026, 9, 28), TODAY), 'minimal');
  assert.equal(habitDayState(h, data, new Date(2026, 9, 27), TODAY), 'rest');
  assert.equal(daySummary(data, new Date(2026, 9, 26)).total, 1);
});

test('ajustes e tema', () => {
  assert.deepEqual(settingsOf({ settings: { modules: ['habits', 'xx'] } }).modules, ['habits']);
  assert.equal(settingsOf({ settings: { modules: ['habits'], startModule: 'tasks' } }).startModule, 'habits');
  assert.equal(resolveTheme('hour', new Date(2026, 1, 1, 22)), 'dark');
  assert.equal(resolveTheme('auto', new Date(), true), 'dark');
  assert.equal(onColor('#ffee00'), '#14161a');
});
