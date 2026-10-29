/*
 * Insights: melhores horários, radar de procrastinação, estimado x real, correlações,
 * mapa do ano, jardim dos hábitos, contas e contagens regressivas. Sem UI.
 */
import { keyOf, fromKey, addDays, activeHabits, isDone, isListed, isWeekly, currentStreak, habitRate, countOf } from './habits.js';
import { daysBetween } from './tasks.js';
import { eventOccurrences } from './calendar.js';

const hourOf = (iso) => new Date(iso).getHours();

/** Horas do dia em que você mais conclui tarefas e faz foco (últimos 60 dias). */
export function productiveHours(data, today) {
  const since = keyOf(addDays(today, -60));
  const score = Array(24).fill(0);
  for (const t of data.tasks || []) if (t.done && t.completedAt && keyOf(new Date(t.completedAt)) >= since) score[hourOf(t.completedAt)] += 1;
  for (const f of data.focus || []) if (f.startedAt && keyOf(new Date(f.startedAt)) >= since) score[hourOf(f.startedAt)] += f.minutes / 25;
  const total = score.reduce((a, b) => a + b, 0);
  if (total < 8) return { score, total, window: null };
  // Melhor janela de 2 horas
  let best = 0;
  for (let h = 1; h < 23; h++) if (score[h] + score[h + 1] > score[best] + score[best + 1]) best = h;
  return { score, total, window: [best, best + 2] };
}

/** Tarefas que você vem empurrando: adiadas 3+ vezes ou atrasadas há mais de uma semana. */
export function procrastinationRadar(data, todayKey) {
  return (data.tasks || [])
    .filter((t) => !t.done && ((t.postponed || 0) >= 3 || (t.date && daysBetween(t.date, todayKey) > 7)))
    .map((t) => ({ t, postponed: t.postponed || 0, late: t.date ? Math.max(0, daysBetween(t.date, todayKey)) : 0 }))
    .sort((a, b) => b.postponed - a.postponed || b.late - a.late)
    .slice(0, 6);
}

/** Tempo real (sessões de foco) contra a estimativa de cada tarefa concluída. */
export function estimateAccuracy(data) {
  const byTask = new Map();
  for (const f of data.focus || []) if (f.taskId) byTask.set(f.taskId, (byTask.get(f.taskId) || 0) + f.minutes);
  const pairs = [];
  for (const t of data.tasks || []) {
    const real = byTask.get(t.id);
    if (t.duration > 0 && real) pairs.push({ t, estimate: t.duration, real });
  }
  if (pairs.length < 3) return { pairs, ratio: null };
  const ratio = pairs.reduce((n, p) => n + p.real, 0) / pairs.reduce((n, p) => n + p.estimate, 0);
  return { pairs, ratio };
}

/** Minutos de foco já feitos numa tarefa. */
export const focusOnTask = (data, id) => (data.focus || []).filter((f) => f.taskId === id).reduce((n, f) => n + f.minutes, 0);

/** Dias com o hábito feito rendem mais tarefas concluídas? (últimos 90 dias) */
export function habitTaskCorrelation(data, today) {
  const doneByDay = new Map();
  for (const t of data.tasks || []) if (t.done && t.completedAt) {
    const k = keyOf(new Date(t.completedAt));
    doneByDay.set(k, (doneByDay.get(k) || 0) + 1);
  }
  const out = [];
  for (const h of activeHabits(data)) {
    const withH = [];
    const without = [];
    for (let i = 1; i <= 90; i++) {
      const d = addDays(today, -i);
      const k = keyOf(d);
      if (k < h.createdAt) break;
      if (!isListed(h, d) && !isWeekly(h)) continue;
      (isDone(h, data.log, k) ? withH : without).push(doneByDay.get(k) || 0);
    }
    if (withH.length >= 5 && without.length >= 5) {
      const avg = (a) => a.reduce((x, y) => x + y, 0) / a.length;
      const a = avg(withH);
      const b = avg(without);
      if (b > 0 && a / b >= 1.25) out.push({ h, ratio: a / b, withAvg: a, withoutAvg: b });
    }
  }
  return out.sort((x, y) => y.ratio - x.ratio).slice(0, 3);
}

/** Intensidade de cada dia do ano (tarefas + hábitos + foco) para o mapa anual. */
export function yearActivity(data, year) {
  const map = new Map();
  const add = (k, v) => k.startsWith(String(year)) && map.set(k, (map.get(k) || 0) + v);
  for (const t of data.tasks || []) if (t.done && t.completedAt) add(keyOf(new Date(t.completedAt)), 1);
  for (const [k, day] of Object.entries(data.log || {})) add(k, Object.keys(day).length);
  for (const f of data.focus || []) if (f.startedAt) add(keyOf(new Date(f.startedAt)), f.minutes / 25);
  const max = Math.max(1, ...map.values());
  return { map, max };
}

/*
 * Jardim: cada hábito é uma planta. Cresce com a sequência e a constância; murcha quando a constância cai.
 * stage: 0 semente · 1 broto · 2 muda · 3 planta · 4 florida
 */
export function gardenOf(data, today) {
  return activeHabits(data).map((h) => {
    const streak = currentStreak(h, data, today);
    const { rate, total } = habitRate(h, data, today);
    const unit = isWeekly(h) ? 4 : 1;
    const s = streak * (isWeekly(h) ? 7 : 1);
    const stage = s >= 30 ? 4 : s >= 14 ? 3 : s >= 4 * unit ? 2 : s >= 1 ? 1 : 0;
    const wilted = total >= 5 && rate < 0.4;
    return { h, streak, rate, stage, wilted };
  });
}

/** Contas do mês numa lista de contas: total, pago e a pagar. */
export function billsSummary(data, list, monthKey) {
  const inMonth = (t) => (t.date || '').slice(0, 7) === monthKey || (t.completedAt && keyOf(new Date(t.completedAt)).slice(0, 7) === monthKey && t.done);
  const items = (data.tasks || []).filter((t) => t.listId === list.id && t.amount !== null && t.amount !== undefined && inMonth(t));
  const sum = (a) => a.reduce((n, t) => n + Number(t.amount || 0), 0);
  const paid = items.filter((t) => t.done);
  const open = items.filter((t) => !t.done);
  return { total: sum(items), paid: sum(paid), open: sum(open), count: open.length };
}

/** Eventos marcados como contagem regressiva, do mais próximo ao mais distante. */
export function countdowns(data, todayKey, limit = 3) {
  const out = [];
  const horizon = keyOf(addDays(fromKey(todayKey), 730));
  for (const ev of (data.events || []).filter((e) => e.countdown)) {
    const occ = eventOccurrences([ev], todayKey, horizon)[0];
    if (occ) out.push({ ev, date: occ.date, days: daysBetween(todayKey, occ.date) });
  }
  return out.sort((a, b) => a.days - b.days).slice(0, limit);
}

/** Resumo da semana para a revisão semanal. */
export function weekReview(data, today) {
  const from = keyOf(addDays(today, -6));
  const to = keyOf(today);
  const done = (data.tasks || []).filter((t) => t.done && t.completedAt && keyOf(new Date(t.completedAt)) >= from && keyOf(new Date(t.completedAt)) <= to);
  const focusMin = (data.focus || []).filter((f) => f.startedAt && keyOf(new Date(f.startedAt)) >= from).reduce((n, f) => n + f.minutes, 0);
  let hDone = 0;
  let hTotal = 0;
  for (let i = 0; i < 7; i++) {
    const d = addDays(today, -i);
    const k = keyOf(d);
    for (const h of activeHabits(data)) {
      if (!isListed(h, d) || isWeekly(h)) continue;
      hTotal++;
      if (countOf(data.log, k, h.id) >= h.target) hDone++;
    }
  }
  const nextFrom = keyOf(addDays(today, 1));
  const nextTo = keyOf(addDays(today, 7));
  const upcoming = (data.tasks || []).filter((t) => !t.done && t.date >= nextFrom && t.date <= nextTo);
  const inbox = (data.tasks || []).filter((t) => !t.done && t.listId === 'inbox' && !t.date);
  const overdue = (data.tasks || []).filter((t) => !t.done && t.date && t.date < to);
  const journal = Object.entries(data.days || {})
    .filter(([k, v]) => k >= from && k <= to && v.journal)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([k, v]) => ({ day: k, text: v.journal }));
  return { done, focusMin, habitRate: hTotal ? hDone / hTotal : null, upcoming, inbox, overdue, journal };
}

/** "Neste dia, um ano atrás": diário, tarefas concluídas e hábitos daquele dia. */
export function onThisDay(data, todayKey) {
  const t = fromKey(todayKey);
  const k = keyOf(new Date(t.getFullYear() - 1, t.getMonth(), t.getDate()));
  const journal = (data.days && data.days[k] && data.days[k].journal) || '';
  const tasks = (data.tasks || []).filter((x) => x.done && x.completedAt && keyOf(new Date(x.completedAt)) === k);
  const habits = Object.keys((data.log || {})[k] || {}).length;
  if (!journal && !tasks.length && !habits) return null;
  return { day: k, journal, tasks, habits };
}

/** Retrospectiva do período: números para o cartão compartilhável. */
export function retrospective(data, today, days = 365) {
  const from = keyOf(addDays(today, -days + 1));
  const done = (data.tasks || []).filter((t) => t.done && t.completedAt && keyOf(new Date(t.completedAt)) >= from).length;
  const focusMin = (data.focus || []).filter((f) => f.startedAt && keyOf(new Date(f.startedAt)) >= from).reduce((n, f) => n + f.minutes, 0);
  let checkins = 0;
  for (const [k, day] of Object.entries(data.log || {})) if (k >= from) checkins += Object.keys(day).length;
  const best = activeHabits(data)
    .map((h) => ({ h, s: currentStreak(h, data, today) }))
    .sort((a, b) => b.s - a.s)[0];
  const { map } = yearActivity(data, today.getFullYear());
  return { done, focusMin, checkins, best: best || null, activeDays: map.size };
}
