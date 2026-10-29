import test from 'node:test';
import assert from 'node:assert/strict';
import { buildWidgetPayload, taskSources, applyWidgetAction, collapseWidgetActions, parseRitmoUrl, WIDGETS } from '../src/lib/widgetData.js';
import { normalizeHabit } from '../src/lib/habits.js';

const TODAY = '2026-10-29';
const data = () => ({
  lists: [{ id: 'inbox', name: 'Entrada', color: 'cobalt' }, { id: 'casa', name: 'Casa', color: 'mint' }],
  tasks: [
    { id: 'a', title: 'Pagar luz', listId: 'casa', date: '2026-10-28', priority: 3, done: false },
    { id: 'b', title: 'Mercado', listId: 'casa', date: TODAY, time: '18:00', priority: 0, done: false },
    { id: 'c', title: 'Dentista', listId: 'inbox', date: '2026-11-02', priority: 1, done: false },
    { id: 'd', title: 'Ler', listId: 'inbox', priority: 0, done: false },
    { id: 'e', title: 'Feita', listId: 'casa', date: TODAY, done: true, completedAt: new Date(2026, 9, 29, 9).toISOString() },
  ],
  habits: [
    normalizeHabit({ id: 'h1', name: 'Água', target: 3, period: 'morning', createdAt: '2026-01-01', color: 'cobalt' }),
    normalizeHabit({ id: 'h2', name: 'Ler', target: 1, period: 'evening', createdAt: '2026-01-01' }),
    normalizeHabit({ id: 'h3', name: 'Arquivado', archived: true, createdAt: '2026-01-01' }),
  ],
  log: { [TODAY]: { h1: 3 } },
  events: [
    { id: 'ev1', title: 'Reunião', date: TODAY, start: '15:00', end: '16:00', color: 'cobalt' },
    { id: 'ev2', title: 'Aniversário', date: '2026-11-10', allDay: true, countdown: true },
    { id: 'ev3', title: 'Café cedo', date: TODAY, start: '07:00', end: '08:00' },
  ],
  settings: {},
});

test('widgets: fontes de tarefas (Hoje inclui atrasadas; listas sem as concluídas)', () => {
  const s = taskSources(data(), TODAY);
  const by = Object.fromEntries(s.map((x) => [x.id, x]));
  assert.deepEqual(by.today.tasks.map((t) => t.id).sort(), ['a', 'b']);
  assert.equal(by.today.count, 2);
  assert.equal(by.today.tasks.find((t) => t.id === 'a').late, true);
  assert.equal(by.today.tasks.find((t) => t.id === 'b').meta, '18:00');
  assert.deepEqual(by.next7.tasks.map((t) => t.id).sort(), ['a', 'b', 'c']);
  assert.equal(by['list:inbox'].name, 'Entrada');
  assert.deepEqual(by['list:casa'].tasks.map((t) => t.id).sort(), ['a', 'b']);
});

test('widgets: pacote com hábitos, progresso, agenda e contagem', () => {
  const p = buildWidgetPayload(data(), TODAY, { now: new Date(2026, 9, 29, 10, 0), theme: 'dark', style: { opacity: 10, textScale: 'large' } });
  assert.equal(p.date, TODAY);
  assert.equal(p.theme, 'dark');
  assert.equal(p.opacity, 20);
  assert.equal(p.textScale, 1.15);
  assert.equal(p.accent, '');
  assert.deepEqual(p.habits.map((h) => h.id), ['h1', 'h2']);
  assert.equal(p.habits[0].done, true);
  assert.equal(p.habits[0].periodLabel, 'Manhã');
  assert.equal(p.habitsDone, 1);
  assert.equal(p.habitsTotal, 2);
  assert.equal(p.tasksDone, 1);
  assert.equal(p.tasksOpen, 2);
  // O café das 7h já acabou às 10h; a reunião ainda vem
  assert.deepEqual(p.events.map((e) => e.id), ['ev1']);
  assert.equal(p.events[0].time, '15:00–16:00');
  assert.equal(p.countdowns[0].id, 'ev2');
  assert.equal(p.countdowns[0].days, 12);
  assert.deepEqual(p.periods.map((x) => x.id), ['morning', 'afternoon', 'evening', 'any']);
});

test('widgets: cor própria dos widgets vence a do app', () => {
  const p = buildWidgetPayload(data(), TODAY, { accent: '#3450E6', style: { accent: 'mint' } });
  assert.equal(p.accent, '#1FAA78');
  assert.equal(buildWidgetPayload(data(), TODAY, { accent: '#123456' }).accent, '#123456');
});

test('widgets: fila junta toques repetidos', () => {
  const q = collapseWidgetActions([
    { type: 'habit', id: 'h2', count: 1, date: TODAY },
    { type: 'task-done', id: 'a' },
    { type: 'habit', id: 'h2', count: 0, date: TODAY },
    { type: 'task-done', id: 'a' },
    { type: 'habit', id: 'h1', count: 2, date: TODAY },
    null,
  ]);
  assert.deepEqual(q, [
    { type: 'habit', id: 'h2', count: 0, date: TODAY },
    { type: 'task-done', id: 'a' },
    { type: 'habit', id: 'h1', count: 2, date: TODAY },
  ]);
});

test('widgets: aplicar ações no app', () => {
  const d = data();
  const calls = [];
  const store = {
    data: d,
    tasks: { toggle: (id) => calls.push(['toggle', id]) },
    habits: { setCount: (h, day, n) => calls.push(['count', h.id, day, n]) },
  };
  applyWidgetAction(store, { type: 'task-done', id: 'a' }, TODAY);
  applyWidgetAction(store, { type: 'task-done', id: 'e' }, TODAY); // já feita
  applyWidgetAction(store, { type: 'habit', id: 'h2', count: 1, date: TODAY }, TODAY);
  applyWidgetAction(store, { type: 'habit', id: 'h1', count: 9 }, TODAY); // limita à meta (já está em 3)
  applyWidgetAction(store, { type: 'habit', id: 'x', count: 1 }, TODAY);
  assert.deepEqual(calls, [['toggle', 'a'], ['count', 'h2', TODAY, 1]]);
});

test('widgets: endereços ritmo://', () => {
  assert.deepEqual(parseRitmoUrl('ritmo://task/abc'), { kind: 'task', id: 'abc', query: {} });
  assert.deepEqual(parseRitmoUrl('ritmo://new-task?list=casa'), { kind: 'new-task', id: '', query: { list: 'casa' } });
  assert.deepEqual(parseRitmoUrl('ritmo://tasks/list%3Acasa'), { kind: 'tasks', id: 'list:casa', query: {} });
  assert.equal(parseRitmoUrl('https://x.com'), null);
  assert.equal(WIDGETS.length, 6);
});
