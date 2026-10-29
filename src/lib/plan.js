/*
 * Planejamento do dia: horários livres, capacidade/sobrecarga, encaixe automático de tarefas,
 * reorganização de atrasadas e "o que faço agora". Sem UI.
 */
import { keyOf, fromKey, addDays } from './habits.js';
import { minutesOf, hhmm, daysBetween, sortTasks } from './tasks.js';
import { eventOccurrences } from './calendar.js';
import { isBusinessDay } from './holidays.js';

export const DEFAULT_TASK_MIN = 30;
const STEP = 15;
const ceilStep = (m) => Math.ceil(m / STEP) * STEP;

export const taskMinutes = (t) => (t.duration > 0 ? t.duration : DEFAULT_TASK_MIN);

/** Blocos ocupados do dia (eventos com horário e tarefas com hora), em minutos. */
export function busyBlocks(data, dayKey) {
  const out = [];
  for (const o of eventOccurrences(data.events, dayKey, dayKey)) {
    if (o.ev.allDay || o.date > dayKey || o.endDate < dayKey) continue;
    const s = o.date === dayKey ? minutesOf(o.ev.start) : 0;
    const e = o.endDate === dayKey ? minutesOf(o.ev.end || o.ev.start) || s + 60 : 1440;
    out.push({ start: s, end: Math.max(e, s + 15), kind: 'event', title: o.ev.title });
  }
  for (const t of data.tasks || []) {
    if (t.done || t.date !== dayKey || !t.time) continue;
    const s = minutesOf(t.time);
    out.push({ start: s, end: s + taskMinutes(t), kind: 'task', title: t.title });
  }
  return out.sort((a, b) => a.start - b.start);
}

/** Horários livres entre o início e o fim do expediente (a partir de agora, se for hoje). */
export function freeSlots(data, dayKey, settings, now = null, minLen = 15) {
  let from = minutesOf(settings.workStart || '09:00');
  const to = minutesOf(settings.workEnd || '18:00');
  if (now && keyOf(now) === dayKey) from = Math.max(from, ceilStep(now.getHours() * 60 + now.getMinutes()));
  const slots = [];
  let cur = from;
  for (const b of busyBlocks(data, dayKey)) {
    if (b.end <= cur) continue;
    if (b.start >= to) break;
    if (b.start > cur) slots.push({ start: cur, end: Math.min(b.start, to) });
    cur = Math.max(cur, b.end);
  }
  if (cur < to) slots.push({ start: cur, end: to });
  return slots.filter((s) => s.end - s.start >= minLen);
}

/** Carga do dia: minutos de tarefas + compromissos contra a capacidade. */
export function dayLoad(data, dayKey, settings) {
  const tasks = (data.tasks || []).filter((t) => !t.done && t.date === dayKey);
  const taskMin = tasks.reduce((n, t) => n + taskMinutes(t), 0);
  const ws = minutesOf(settings.workStart || '09:00');
  const we = minutesOf(settings.workEnd || '18:00');
  const eventMin = busyBlocks(data, dayKey)
    .filter((b) => b.kind === 'event')
    .reduce((n, b) => n + Math.max(0, Math.min(b.end, we) - Math.max(b.start, ws)), 0);
  const capacity = Math.min(settings.dailyCapacity || 360, Math.max(0, we - ws - eventMin));
  return { tasks: tasks.length, taskMin, eventMin, capacity, over: taskMin > capacity && tasks.length > 1, ratio: capacity ? taskMin / capacity : 0 };
}

const urgency = (t, dayKey) => {
  let s = t.priority * 10;
  if (t.date && t.date < dayKey) s += Math.min(20, daysBetween(t.date, dayKey) * 2);
  if (t.deadline) s += Math.max(0, 15 - daysBetween(dayKey, t.deadline) * 3);
  s += Math.min(6, (t.postponed || 0) * 2);
  return s;
};

/**
 * "Planejar meu dia": encaixa as tarefas sem hora de hoje (e as atrasadas) nos horários livres.
 * Mais urgentes primeiro; tarefas pesadas preferem a manhã, leves o fim do dia.
 * Devolve [{ id, time, date, title, minutes }] e as que não couberam.
 */
export function autoSchedule(data, dayKey, settings, now = null) {
  const candidates = (data.tasks || []).filter((t) => !t.done && !t.time && t.date && t.date <= dayKey);
  const ordered = [...candidates].sort((a, b) => urgency(b, dayKey) - urgency(a, dayKey) || (b.energy || 0) - (a.energy || 0));
  const slots = freeSlots(data, dayKey, settings, now).map((s) => ({ ...s }));
  const placed = [];
  const left = [];
  const mid = (minutesOf(settings.workStart || '09:00') + minutesOf(settings.workEnd || '18:00')) / 2;
  for (const t of ordered) {
    const need = taskMinutes(t);
    let options = slots.filter((s) => s.end - s.start >= need);
    if (t.energy === 3) options = options.sort((a, b) => a.start - b.start);
    else if (t.energy === 1) options = options.sort((a, b) => Math.abs(b.start - mid * 1.2) - Math.abs(a.start - mid * 1.2)).reverse();
    const slot = options[0];
    if (!slot) {
      left.push(t);
      continue;
    }
    placed.push({ id: t.id, title: t.title, date: dayKey, time: hhmm(slot.start), minutes: need });
    slot.start = ceilStep(slot.start + need);
  }
  placed.sort((a, b) => a.time.localeCompare(b.time));
  return { placed, left };
}

/**
 * Reorganizar atrasadas: espalha as tarefas vencidas a partir de hoje, nos próximos dias úteis,
 * sem passar da capacidade diária. Mais urgentes ficam mais cedo.
 */
export function reorganizeOverdue(data, todayKey, settings, maxDays = 10) {
  const overdue = sortTasks((data.tasks || []).filter((t) => !t.done && t.date && t.date < todayKey)).sort((a, b) => urgency(b, todayKey) - urgency(a, todayKey));
  const changes = [];
  if (!overdue.length) return changes;
  const load = new Map();
  let i = 0;
  let day = fromKey(todayKey);
  for (const t of overdue) {
    for (let guard = 0; guard < 60; guard++) {
      const k = keyOf(day);
      const bizOk = i === 0 || isBusinessDay(k);
      if (!load.has(k)) load.set(k, dayLoad(data, k, settings).taskMin);
      const cap = (settings.dailyCapacity || 360) * (i === 0 ? 0.8 : 1);
      if (bizOk && load.get(k) + taskMinutes(t) <= cap) {
        load.set(k, load.get(k) + taskMinutes(t));
        changes.push({ id: t.id, date: k, time: '' });
        break;
      }
      day = addDays(day, 1);
      i++;
      if (i > maxDays) {
        changes.push({ id: t.id, date: keyOf(day), time: '' });
        break;
      }
    }
  }
  return changes;
}

/**
 * "O que faço agora?": a melhor tarefa para o tempo livre até o próximo compromisso,
 * considerando urgência, energia pela hora do dia e o que cabe no intervalo.
 */
export function whatNow(data, now, settings, skip = []) {
  const k = keyOf(now);
  const mins = now.getHours() * 60 + now.getMinutes();
  const next = busyBlocks(data, k).find((b) => b.start > mins && b.kind === 'event');
  const gap = next ? next.start - mins : Math.max(30, minutesOf(settings.workEnd || '18:00') - mins);
  const hour = now.getHours();
  const preferEnergy = hour < 12 ? 3 : hour < 16 ? 2 : 1;
  const pool = (data.tasks || []).filter((t) => !t.done && !skip.includes(t.id) && ((t.date && t.date <= k) || (!t.date && !t.someday)));
  if (!pool.length) return null;
  const scored = pool.map((t) => {
    let s = urgency(t, k) + (t.date && t.date <= k ? 8 : 0);
    if (t.energy) s += t.energy === preferEnergy ? 6 : -Math.abs(t.energy - preferEnergy) * 2;
    const fits = taskMinutes(t) <= gap;
    s += fits ? 5 : -8;
    if (t.time && minutesOf(t.time) > mins + 60) s -= 10;
    return { t, s, fits };
  });
  scored.sort((a, b) => b.s - a.s || a.t.position - b.t.position);
  const best = scored[0];
  const reasons = [];
  if (best.t.date && best.t.date < k) reasons.push('está atrasada');
  else if (best.t.deadline && daysBetween(k, best.t.deadline) <= 2) reasons.push('o prazo está chegando');
  else if (best.t.priority === 3) reasons.push('é prioridade alta');
  if (best.fits && next) reasons.push(`cabe antes de “${next.title}”`);
  else if (best.t.energy && best.t.energy === preferEnergy) reasons.push(hour < 12 ? 'combina com a energia da manhã' : 'combina com este horário');
  return { task: best.t, gap, next: next || null, reason: reasons.join(' e ') };
}
