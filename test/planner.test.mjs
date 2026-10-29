import test from 'node:test';
import assert from 'node:assert/strict';
import { keyOf } from '../src/lib/habits.js';
import {
  parseQuickAdd, nextDate, occurrences, repeatText, groupsFor, completeTask, matrixTasks, kanbanColumns,
  searchAll, dueLabel, reminderAt, positionBetween, viewCount,
} from '../src/lib/tasks.js';
import { eventOccurrences, itemsByDay, layoutBlocks, monthGrid } from '../src/lib/calendar.js';
import { idleState, start, pause, remaining, sessionFrom, nextPhase, focusStats, DEFAULT_FOCUS, fmtClock } from '../src/lib/focus.js';
import { buildFullSeed, normalizeAll } from '../src/lib/data.js';
import { buildSnapshot, emptyPending, uploadRows, toTaskRow, toEventRow, toListRow } from '../src/lib/sync.js';

const TODAY = '2026-10-29'; // quinta
const today = new Date(2026, 9, 29);
const lists = [{ id: 'inbox', name: 'Entrada' }, { id: 'trabalho', name: 'Trabalho' }, { id: 'pessoal', name: 'Pessoal' }];

test('entrada rápida: data, hora, prioridade, etiqueta, lista e repetição', () => {
  const r = parseQuickAdd('Reunião com cliente amanhã às 15h #trabalho !1', TODAY, lists);
  assert.deepEqual([r.title, r.date, r.time, r.priority, r.tags], ['Reunião com cliente', '2026-10-30', '15:00', 3, ['trabalho']]);
  const r2 = parseQuickAdd('Pagar aluguel dia 5 todo mês ^pessoal', TODAY, lists);
  assert.deepEqual([r2.title, r2.date, r2.repeat, r2.listId], ['Pagar aluguel', '2026-11-05', 'monthly', 'pessoal']);
  const r3 = parseQuickAdd('Academia toda segunda e quarta 7h', TODAY, lists);
  assert.deepEqual([r3.title, r3.date, r3.time, r3.repeat], ['Academia', '2026-11-02', '07:00', 'weekly:1,3']);
  const r4 = parseQuickAdd('Revisar código todo dia útil', TODAY, lists);
  assert.deepEqual([r4.repeat, r4.date], ['weekdays', TODAY]);
  assert.equal(parseQuickAdd('Comprar as 3 maçãs', TODAY, lists).title, 'Comprar as 3 maçãs');
  assert.equal(parseQuickAdd('Relatório 15/11 !alta', TODAY, lists).date, '2026-11-15');
  assert.ok(r.tokens.every((t, i, a) => i === 0 || a[i - 1].end <= t.start), 'tokens sem sobreposição');
});

test('repetição: próximas datas e textos', () => {
  assert.equal(nextDate('monthly', '2026-01-31'), '2026-02-28');
  assert.equal(nextDate('weekly:1,3', TODAY), '2026-11-02');
  assert.equal(nextDate('weekdays', '2026-10-30'), '2026-11-02');
  assert.equal(nextDate('daily/2', TODAY), '2026-10-31');
  assert.deepEqual(occurrences('weekly:1,3', '2026-10-26', '2026-11-01', '2026-11-15'), ['2026-11-02', '2026-11-04', '2026-11-09', '2026-11-11']);
  assert.equal(repeatText('weekly:1,3'), 'Toda seg, qua');
});

test('concluir tarefa repetida cria cópia concluída e avança a data', () => {
  const t = { id: 't1', title: 'Backup', date: '2026-10-31', repeat: 'weekly', checklist: [{ id: 'a', text: 'x', done: true }], done: false };
  const { updated, created } = completeTask(t, '2026-10-29T12:00:00.000Z');
  assert.equal(updated.date, '2026-11-07');
  assert.equal(updated.done, false);
  assert.equal(updated.checklist[0].done, false);
  assert.equal(created.done, true);
  assert.equal(created.repeat, '');
  assert.notEqual(created.id, t.id);
  const single = completeTask({ id: 't2', title: 'x', date: TODAY, repeat: '' });
  assert.equal(single.created, null);
  assert.equal(single.updated.done, true);
});

test('visões: hoje, próximos 7 dias, lista e contagem', () => {
  const data = buildFullSeed(today);
  const g = groupsFor('today', data, TODAY);
  assert.deepEqual(g.map((x) => x.id), ['overdue', 'today', 'done']);
  assert.ok(g[1].tasks.length >= 3);
  // Ordenação: com hora antes, depois prioridade
  assert.equal(g[1].tasks[0].id, 'ex-proposta');
  assert.equal(groupsFor('next7', data, TODAY).filter((x) => x.id.startsWith('d:')).length, 7);
  assert.ok(groupsFor('list:inbox', data, TODAY).some((x) => x.id === 'nodate'));
  assert.equal(viewCount('today', data, TODAY), g[0].tasks.length + g[1].tasks.length);
  assert.equal(dueLabel({ date: '2026-10-30', time: '15:00' }, TODAY), 'Amanhã, 15:00');
});

test('matriz e Kanban', () => {
  const data = buildFullSeed(today);
  const m = matrixTasks(data, TODAY);
  assert.equal(m.length, 4);
  assert.ok(m[0].tasks.every((t) => t.priority === 3 && !t.done));
  const cols = kanbanColumns(data.lists.find((l) => l.id === 'trabalho'), data);
  assert.deepEqual(cols.map((c) => c.name), ['A fazer', 'Em andamento', 'Revisão']);
  assert.ok(cols[0].tasks.some((t) => t.id === 'ex-apresentacao'));
  assert.equal(positionBetween(1, 2), 1.5);
  assert.equal(positionBetween(undefined, 2), 1);
});

test('agenda: ocorrências, dias e sobreposição', () => {
  const data = buildFullSeed(today);
  const occ = eventOccurrences(data.events, '2026-11-02', '2026-11-08');
  assert.ok(occ.some((o) => o.ev.id === 'ex-equipe' && o.date === '2026-11-02'));
  assert.ok(occ.some((o) => o.ev.id === 'ex-equipe' && o.date === '2026-11-04'));
  const map = itemsByDay(data, keyOf(new Date(2026, 10, 6)), keyOf(new Date(2026, 10, 8)));
  assert.equal(map.get('2026-11-07').events.filter((o) => o.ev.id === 'ex-praia').length, 1, 'evento de vários dias aparece em cada dia');
  const laid = layoutBlocks([{ id: 'a', start: 540, end: 600 }, { id: 'b', start: 570, end: 630 }, { id: 'c', start: 700, end: 760 }]);
  assert.deepEqual(laid.map((b) => [b.id, b.col, b.cols]), [['a', 0, 2], ['b', 1, 2], ['c', 0, 1]]);
  assert.equal(monthGrid(2026, 9).length, 42);
  assert.equal(monthGrid(2026, 9)[0].key, '2026-09-27');
});

test('lembretes: momento do disparo', () => {
  assert.equal(reminderAt('2026-10-30', '15:00', 15).getHours(), 14);
  assert.equal(reminderAt('2026-10-30', '15:00', 15).getMinutes(), 45);
  const allDay = reminderAt('2026-10-30', '', 1440);
  assert.deepEqual([allDay.getDate(), allDay.getHours()], [29, 9]);
  assert.equal(reminderAt('2026-10-30', '', -1), null);
});

test('foco: ciclo do Pomodoro e sessões', () => {
  const s0 = idleState('focus', DEFAULT_FOCUS);
  const t0 = 1_000_000;
  const s1 = start(s0, t0);
  assert.equal(remaining(s1, t0 + 60_000), 24 * 60_000);
  const s2 = pause(s1, t0 + 60_000);
  assert.equal(s2.remainingMs, 24 * 60_000);
  const sess = sessionFrom(start(s2, t0 + 120_000), t0 + 120_000 + 24 * 60_000);
  assert.equal(sess.minutes, 25);
  let s = s0;
  const phases = [];
  for (let i = 0; i < 8; i++) {
    s = nextPhase(s, DEFAULT_FOCUS);
    phases.push(s.phase);
  }
  assert.deepEqual(phases, ['short', 'focus', 'short', 'focus', 'short', 'focus', 'long', 'focus']);
  const stats = focusStats(buildFullSeed(today), today);
  assert.equal(stats.week.length, 7);
  assert.equal(stats.todayPomos, 1);
  assert.equal(fmtClock(25 * 60_000), '25:00');
  assert.equal(fmtClock(1), '00:01');
});

test('busca encontra título, etiqueta e subtarefa', () => {
  const data = buildFullSeed(today);
  assert.ok(searchAll(data, 'proposta').tasks.length >= 1);
  assert.ok(searchAll(data, 'cafe').tasks.some((t) => t.id === 'ex-mercado'), 'sem acento encontra subtarefa "Café"');
  assert.ok(searchAll(data, 'dentista').events.length === 1);
});

test('sincronização: linhas de listas, tarefas e eventos ida e volta', () => {
  const data = buildFullSeed(today);
  const up = uploadRows(data, 'u1');
  assert.equal(Object.keys(up.lists).length, data.lists.length);
  assert.equal(Object.keys(up.tasks).length, data.tasks.length);
  assert.equal(Object.keys(up.events).length, data.events.length);
  assert.equal(Object.keys(up.focus).length, data.focus.length);
  const pending = emptyPending();
  const edited = { ...data.tasks[0], title: 'Editado offline' };
  pending.tasks[edited.id] = toTaskRow(edited, 'u1');
  pending.tasks['ex-ideias'] = toTaskRow({ ...data.tasks.find((t) => t.id === 'ex-ideias'), deleted: true }, 'u1');
  const snap = buildSnapshot(
    { habitRows: [], listRows: Object.values(up.lists), taskRows: Object.values(up.tasks), eventRows: Object.values(up.events), focusRows: Object.values(up.focus) },
    pending
  );
  assert.equal(snap.tasks.find((t) => t.id === edited.id).title, 'Editado offline');
  assert.ok(!snap.tasks.some((t) => t.id === 'ex-ideias'), 'excluída some');
  const back = snap.tasks.find((t) => t.id === 'ex-mercado');
  const orig = data.tasks.find((t) => t.id === 'ex-mercado');
  assert.deepEqual([back.date, back.checklist.length, back.listId], [orig.date, orig.checklist.length, orig.listId]);
  const ev = snap.events.find((e) => e.id === 'ex-praia');
  assert.deepEqual([ev.allDay, ev.endDate], [true, data.events.find((e) => e.id === 'ex-praia').endDate]);
  assert.equal(snap.lists.find((l) => l.id === 'trabalho').sections.length, 3);
  assert.equal(toEventRow({ id: 'e', title: 'x', date: TODAY, endDate: '2026-10-01', allDay: true }, 'u').end_date, TODAY, 'fim nunca antes do início');
  assert.equal(toListRow({ id: 'l', name: 'x', view: 'qualquer' }, 'u').view, 'list');
});

test('dados antigos (só hábitos) ganham listas padrão', () => {
  const old = normalizeAll({ habits: [], log: {} });
  assert.deepEqual(old.lists.map((l) => l.id), ['inbox', 'pessoal', 'trabalho']);
  assert.deepEqual([old.tasks, old.events, old.focus], [[], [], []]);
});
