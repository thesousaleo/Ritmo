import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseQuickAdd, nextDate, occurrences, repeatText, completeTask, reminderAt, REMINDER_BIZ_BEFORE, groupsFor, normalizeTask, matchesFilter, dateFromWord,
} from '../src/lib/tasks.js';
import { holidayOn, isBusinessDay, nthBusinessDay, lastBusinessDay, previousBusinessDay, easter } from '../src/lib/holidays.js';
import { setPrefs, fmtTime } from '../src/lib/prefs.js';

const TODAY = '2026-10-29'; // quinta
const lists = [{ id: 'inbox', name: 'Entrada' }];

test('feriados: Páscoa, móveis, estaduais e pessoais', () => {
  assert.deepEqual(easter(2026), [4, 5]);
  assert.equal(holidayOn('2026-04-03').name, 'Sexta-feira Santa');
  assert.equal(holidayOn('2026-02-16').kind, 'facultativo'); // carnaval
  assert.equal(holidayOn('2026-11-20').kind, 'nacional');
  assert.equal(holidayOn('2026-07-09'), null);
  setPrefs({ uf: 'SP' });
  assert.equal(holidayOn('2026-07-09').kind, 'estadual');
  setPrefs({ uf: '', customHolidays: [{ date: '2026-12-24', name: 'Recesso' }] });
  assert.equal(holidayOn('2026-12-24').name, 'Recesso');
  setPrefs({ customHolidays: [] });
  assert.equal(isBusinessDay('2026-11-02'), false); // Finados
  assert.equal(nthBusinessDay(2026, 11, 5), '2026-11-09');
  assert.equal(lastBusinessDay(2026, 10), '2026-10-30');
  assert.equal(previousBusinessDay('2026-11-03'), '2026-10-30');
});

test('repetições avançadas', () => {
  assert.equal(nextDate('monthly:biz5', '2026-10-29'), '2026-11-09');
  assert.equal(nextDate('monthly:lastbiz', '2026-10-29'), '2026-10-30');
  assert.equal(nextDate('monthly:last', '2026-10-31'), '2026-11-30');
  assert.equal(nextDate('monthly:wL-5', '2026-10-30'), '2026-11-27');
  assert.equal(nextDate('monthly:w1-1', '2026-11-02'), '2026-12-07');
  assert.equal(nextDate('weekly:2/2', '2026-11-03'), '2026-11-17');
  assert.equal(nextDate('weekly:2,4/2', '2026-11-03'), '2026-11-05');
  assert.equal(nextDate('weekly:2,4/2', '2026-11-05'), '2026-11-17');
  assert.equal(nextDate('bizdays', '2026-10-30'), '2026-11-03');
  assert.equal(nextDate('monthly/3', '2026-01-31'), '2026-04-30');
  assert.deepEqual(occurrences('monthly:biz5', '2026-10-01', '2026-10-01', '2026-12-31'), ['2026-10-07', '2026-11-09', '2026-12-07']);
  assert.deepEqual(occurrences('weekly:1/2', '2026-11-02', '2026-11-01', '2026-11-30'), ['2026-11-02', '2026-11-16', '2026-11-30']);
  assert.equal(repeatText('monthly:biz5'), 'Todo mês, no 5º dia útil');
  assert.equal(repeatText('monthly:wL-5'), 'Todo mês, na última sexta');
  assert.equal(repeatText('monthly:w1-0'), 'Todo mês, no primeiro domingo');
  assert.equal(repeatText('weekly:2/2'), 'A cada 2 semanas: ter');
  assert.equal(repeatText('after:3d'), '3 dias depois de concluir');
});

test('semana começando na segunda muda o ciclo quinzenal', () => {
  setPrefs({ weekStart: 1 });
  assert.equal(nextDate('weekly:0,6/2', '2026-11-07'), '2026-11-08'); // sáb -> dom na mesma semana
  setPrefs({ weekStart: 0 });
  assert.equal(nextDate('weekly:0,6/2', '2026-11-07'), '2026-11-15');
});

test('repetir depois de concluir', () => {
  const t = normalizeTask({ id: 't1', title: 'Regar plantas', date: '2026-10-20', repeat: 'after:3d', postponed: 2 });
  const { updated, created } = completeTask(t, new Date(2026, 9, 29, 10).toISOString());
  assert.equal(updated.date, '2026-11-01');
  assert.equal(updated.postponed, 0);
  assert.equal(created.done, true);
});

test('entrada rápida: novos padrões', () => {
  let r = parseQuickAdd('Pagar aluguel todo quinto dia útil R$ 1.250,00', TODAY, lists);
  assert.deepEqual([r.title, r.repeat, r.date, r.amount], ['Pagar aluguel', 'monthly:biz5', '2026-11-09', 1250]);
  r = parseQuickAdd('Fechar caixa no último dia útil', TODAY, lists);
  assert.deepEqual([r.title, r.repeat, r.date], ['Fechar caixa', '', '2026-10-30']);
  r = parseQuickAdd('Reunião de conselho toda última sexta do mês 9h', TODAY, lists);
  assert.deepEqual([r.title, r.repeat, r.date, r.time], ['Reunião de conselho', 'monthly:wL-5', '2026-10-30', '09:00']);
  r = parseQuickAdd('Faxina a cada 2 semanas no sábado', TODAY, lists);
  assert.deepEqual([r.title, r.repeat, r.date], ['Faxina', 'weekly:6/2', '2026-10-31']);
  r = parseQuickAdd('Trocar filtro 3 meses depois de concluir', TODAY, lists);
  assert.deepEqual([r.title, r.repeat, r.date], ['Trocar filtro', 'after:3m', TODAY]);
  r = parseQuickAdd('Entregar relatório até sexta ~pesada ~2h', TODAY, lists);
  assert.deepEqual([r.title, r.deadline, r.energy, r.duration, r.date], ['Entregar relatório', '2026-10-30', 3, 120, '']);
  r = parseQuickAdd('Aprender violão algum dia', TODAY, lists);
  assert.deepEqual([r.title, r.someday], ['Aprender violão', true]);
  r = parseQuickAdd('Dentista amanhã 14h @agenda', TODAY, lists);
  assert.deepEqual([r.title, r.asEvent, r.date, r.time], ['Dentista', true, '2026-10-30', '14:00']);
  assert.equal(dateFromWord('15/11', TODAY), '2026-11-15');
  assert.equal(dateFromWord('fim do mês', TODAY), '2026-10-31');
});

test('lembrete no dia útil anterior', () => {
  const d = reminderAt('2026-11-03', '', REMINDER_BIZ_BEFORE);
  assert.equal(d.getDate(), 30);
  assert.equal(d.getHours(), 9);
});

test('algum dia e filtros', () => {
  const data = {
    lists: [{ id: 'inbox', name: 'Entrada' }],
    tasks: [
      normalizeTask({ id: 'a', title: 'A', someday: true }),
      normalizeTask({ id: 'b', title: 'B', date: TODAY, priority: 3, tags: ['x'] }),
    ],
    settings: { filters: [{ id: 'f1', name: 'Alta', rules: { priorities: [3] } }] },
  };
  const g = groupsFor('list:inbox', data, TODAY);
  assert.deepEqual(g.map((x) => x.id), ['today', 'someday']);
  assert.deepEqual(groupsFor('someday', data, TODAY)[0].tasks.map((t) => t.id), ['a']);
  assert.deepEqual(groupsFor('filter:f1', data, TODAY).flatMap((x) => x.tasks.map((t) => t.id)), ['b']);
  assert.equal(matchesFilter(data.tasks[1], { tags: ['y'] }, TODAY), false);
});

test('relógio de 12 horas', () => {
  setPrefs({ clock24: false });
  assert.equal(fmtTime('14:05'), '2:05 PM');
  assert.equal(fmtTime('00:30'), '12:30 AM');
  setPrefs({ clock24: true });
  assert.equal(fmtTime('14:05'), '14:05');
});
