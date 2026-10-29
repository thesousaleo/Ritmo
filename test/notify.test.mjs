import test from 'node:test';
import assert from 'node:assert/strict';
import { whenText, taskNotice, eventNotice, habitNotice } from '../src/lib/notifyText.js';

const data = { lists: [{ id: 'inbox', name: 'Entrada', color: 'cobalt' }, { id: 'casa', name: 'Casa', color: 'mint' }] };
const at = (h, m, day = 29) => new Date(2026, 9, day, h, m);

test('notificação: quando, visto da hora do lembrete', () => {
  assert.equal(whenText('2026-10-29', '15:02', at(15, 2)), 'Agora · 15:02');
  assert.equal(whenText('2026-10-29', '15:00', at(14, 45)), 'Em 15 min · às 15:00');
  assert.equal(whenText('2026-10-29', '16:30', at(15, 0)), 'Em 1 h 30 min · às 16:30');
  assert.equal(whenText('2026-10-30', '09:00', at(9, 0)), 'Amanhã às 09:00');
  assert.equal(whenText('2026-11-02', '09:00', at(9, 0)), 'Seg, 02/11 às 09:00');
  assert.equal(whenText('2026-10-29', '', at(9, 0)), 'Para hoje');
  assert.equal(whenText('2026-10-30', '', at(9, 0)), 'Para amanhã');
  assert.equal(whenText('2026-11-02', '', at(9, 0)), 'Para segunda, 02/11');
});

test('notificação de tarefa: lista, cor, prioridade, subtarefas e descrição', () => {
  const t = {
    id: 't1', title: 'Pagar luz', listId: 'casa', date: '2026-10-29', time: '15:00', priority: 3, amount: 120.5,
    checklist: [{ text: 'Pegar boleto', done: true }, { text: 'Pagar no app do banco', done: false }],
    notes: 'Vence hoje,   não esquecer',
  };
  const n = taskNotice(t, data, at(14, 45));
  assert.equal(n.title, 'Pagar luz');
  assert.equal(n.body, 'Em 15 min · às 15:00 · Prioridade alta · R$ 120,50');
  assert.equal(n.summaryText, 'Casa');
  assert.equal(n.iconColor, '#1FAA78');
  assert.equal(n.largeBody, `${n.body}\n1 de 2 subtarefas · próxima: Pagar no app do banco\nVence hoje, não esquecer`);

  const plain = taskNotice({ id: 't2', title: 'teste', listId: 'inbox', date: '2026-10-29', time: '15:02', priority: 0 }, data, at(15, 2));
  assert.deepEqual([plain.body, plain.largeBody, plain.summaryText, plain.iconColor], ['Agora · 15:02', 'Agora · 15:02', 'Entrada', '#4C6EF5']);
  assert.equal(taskNotice({ ...t, priority: 0, amount: null }, data, at(15, 30), 'nag').body, 'Ainda pendente · era às 15:00');
  assert.equal(taskNotice({ ...t, priority: 0, amount: null, time: '' }, data, at(16, 0), 'snooze').body, 'Adiada');
  assert.equal(taskNotice({ ...t, listId: 'sumiu' }, data, at(14, 0)).summaryText, 'Tarefa');
});

test('notificação de evento e de hábito', () => {
  const ev = { title: 'Dentista', start: '10:00', end: '11:00', location: 'Rua A, 10', color: 'rose', notes: '' };
  const e = eventNotice(ev, '2026-10-29', at(9, 30));
  assert.deepEqual([e.body, e.summaryText, e.iconColor], ['Em 30 min · às 10:00–11:00 · Rua A, 10', 'Agenda', '#E0507F']);
  assert.equal(eventNotice({ title: 'Feriado', allDay: true }, '2026-10-30', at(9, 0)).body, 'Amanhã, dia inteiro');

  assert.equal(habitNotice({ name: 'Beber água', target: 8, unit: 'copos', color: 'sky' }).body, 'Meta de hoje: 8 copos');
  assert.equal(habitNotice({ name: 'Ler', target: 1, unit: '20 páginas' }).body, 'Hoje: 20 páginas');
  const avoid = habitNotice({ name: 'Celular depois das 23h', kind: 'avoid', target: 1 });
  assert.deepEqual([avoid.title, avoid.body], ['Lembrete: Celular depois das 23h', 'Segure firme hoje.']);
});
