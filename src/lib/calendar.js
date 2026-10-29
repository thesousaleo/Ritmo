/* Agenda: grade do mês, semanas, ocorrências de eventos repetidos e disposição de blocos sobrepostos. Sem UI. */
import { keyOf, fromKey, addDays } from './habits.js';
import { occurrences, daysBetween, minutesOf } from './tasks.js';

export const MONTHS_LONG = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
export const monthTitle = (d) => `${MONTHS_LONG[d.getMonth()]} de ${d.getFullYear()}`;

/** 6 semanas a partir do domingo anterior ao dia 1. */
export function monthGrid(year, month) {
  const first = new Date(year, month, 1);
  const start = addDays(first, -first.getDay());
  const days = [];
  for (let i = 0; i < 42; i++) {
    const d = addDays(start, i);
    days.push({ key: keyOf(d), date: d, inMonth: d.getMonth() === month });
  }
  return days;
}

export function rangeDays(startKey, count) {
  const out = [];
  for (let i = 0; i < count; i++) out.push(keyOf(addDays(fromKey(startKey), i)));
  return out;
}

/** Ocorrências de eventos que tocam o intervalo [fromK, toK]. Cada uma: { ev, date, endDate, id } */
export function eventOccurrences(events, fromK, toK) {
  const out = [];
  for (const ev of events || []) {
    const span = Math.max(0, daysBetween(ev.date, ev.endDate || ev.date));
    // Começa a procurar "span" dias antes para pegar eventos de vários dias que começam antes do intervalo
    const searchFrom = keyOf(addDays(fromKey(fromK), -span));
    for (const d of occurrences(ev.repeat, ev.date, searchFrom, toK)) {
      const end = keyOf(addDays(fromKey(d), span));
      if (end < fromK) continue;
      out.push({ ev, date: d, endDate: end, id: `${ev.id}@${d}` });
    }
  }
  return out;
}

/** Tudo o que acontece num dia: eventos (inclusive os de vários dias) e tarefas com data. */
export function dayItems(data, key, occs) {
  const events = (occs || eventOccurrences(data.events, key, key)).filter((o) => o.date <= key && o.endDate >= key);
  const tasks = (data.tasks || []).filter((t) => t.date === key);
  return { events, tasks };
}

export function itemsByDay(data, fromK, toK) {
  const occs = eventOccurrences(data.events, fromK, toK);
  const map = new Map();
  for (let k = fromK; k <= toK; k = keyOf(addDays(fromKey(k), 1))) map.set(k, { events: [], tasks: [] });
  for (const o of occs) {
    for (let k = o.date < fromK ? fromK : o.date; k <= o.endDate && k <= toK; k = keyOf(addDays(fromKey(k), 1))) {
      if (map.has(k)) map.get(k).events.push(o);
    }
  }
  for (const t of data.tasks || []) if (t.date && map.has(t.date)) map.get(t.date).tasks.push(t);
  for (const v of map.values()) {
    v.events.sort((a, b) => (a.ev.allDay ? -1 : minutesOf(a.ev.start)) - (b.ev.allDay ? -1 : minutesOf(b.ev.start)));
    v.tasks.sort((a, b) => Number(a.done) - Number(b.done) || (a.time ? minutesOf(a.time) : 9999) - (b.time ? minutesOf(b.time) : 9999) || b.priority - a.priority);
  }
  return map;
}

/** Bloco de horário de um evento ou tarefa naquele dia, em minutos [start, end). */
export function blockRange(item, key) {
  if (item.kind === 'event') {
    const { ev, date, endDate } = item.occ;
    if (ev.allDay) return null;
    const s = date === key ? minutesOf(ev.start) : 0;
    const e = endDate === key ? minutesOf(ev.end || ev.start) : 1440;
    return [s, Math.max(e, s + 15)];
  }
  const t = item.task;
  if (!t.time) return null;
  const s = minutesOf(t.time);
  return [s, Math.min(1440, s + Math.max(t.duration || 30, 15))];
}

/**
 * Distribui blocos sobrepostos em colunas lado a lado.
 * Entrada: [{ id, start, end, ... }]. Saída: mesmos itens com col e cols.
 */
export function layoutBlocks(blocks) {
  const sorted = [...blocks].sort((a, b) => a.start - b.start || b.end - a.end);
  const out = [];
  let cluster = [];
  let clusterEnd = -1;
  const flush = () => {
    const cols = [];
    for (const b of cluster) {
      let c = cols.findIndex((end) => end <= b.start);
      if (c === -1) {
        c = cols.length;
        cols.push(b.end);
      } else cols[c] = b.end;
      b.col = c;
    }
    for (const b of cluster) b.cols = cols.length;
    out.push(...cluster);
    cluster = [];
  };
  for (const b of sorted) {
    const item = { ...b };
    if (cluster.length && item.start >= clusterEnd) flush();
    cluster.push(item);
    clusterEnd = Math.max(clusterEnd, item.end);
  }
  if (cluster.length) flush();
  return out;
}

export const SNAP = 15;
export const snap = (mins) => Math.max(0, Math.min(1440 - SNAP, Math.round(mins / SNAP) * SNAP));
