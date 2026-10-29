/*
 * Dados dos widgets da tela inicial (Android). Puro: o app monta este pacote e o plugin nativo
 * guarda e desenha cada widget a partir dele, mesmo com o app fechado.
 */
import { keyOf, fromKey, addDays, activeHabits, isListed, countOf, colorOf, isWeekly, currentStreak, PERIODS, fmtLong } from './habits.js';
import { sortTasks, groupsFor, INBOX_ID, dayLabel, priorityOf } from './tasks.js';
import { eventOccurrences } from './calendar.js';
import { countdowns } from './insights.js';
import { fmtTime } from './prefs.js';

const MAX_TASKS = 12;
const PRIORITY_HEX = { 3: '#D6453D', 2: '#D98A1C', 1: '#3F63E8', 0: '#A3ADA6' };

export const WIDGETS = [
  { id: 'tasks', name: 'Tarefas', icon: 'SquareCheckBig', size: '3 × 2', desc: 'Lista de tarefas com check. Escolha Hoje, Próximos 7 dias, Entrada ou qualquer lista.' },
  { id: 'habits', name: 'Hábitos', icon: 'Sprout', size: '3 × 2', desc: 'Hábitos do dia: toque no círculo para marcar sem abrir o app. Todos ou só um período.' },
  { id: 'progress', name: 'Progresso do dia', icon: 'CircleDashed', size: '2 × 2', desc: 'Anel com o quanto do dia já foi feito: hábitos, tarefas ou os dois.' },
  { id: 'agenda', name: 'Agenda', icon: 'CalendarDays', size: '3 × 2', desc: 'Próximos compromissos de hoje e amanhã ou da semana.' },
  { id: 'countdown', name: 'Contagem regressiva', icon: 'Hourglass', size: '2 × 1', desc: 'Dias até um evento marcado como contagem regressiva.' },
  { id: 'quick', name: 'Atalhos', icon: 'Zap', size: '4 × 1', desc: 'Botões para nova tarefa, foco, hábitos e agenda.' },
];

const taskRow = (t, todayKey) => {
  const meta = [];
  if (t.time) meta.push(fmtTime(t.time));
  else if (t.date && t.date !== todayKey) meta.push(dayLabel(t.date, todayKey));
  return {
    id: t.id,
    title: t.title,
    meta: meta.join(' · '),
    late: !!(t.date && t.date < todayKey),
    color: PRIORITY_HEX[t.priority] || PRIORITY_HEX[0],
    priority: priorityOf(t.priority).short,
  };
};

/** Fontes de tarefas que o widget pode mostrar: Hoje, Próximos 7 dias, Entrada e cada lista. */
export function taskSources(data, todayKey) {
  const undone = (data.tasks || []).filter((t) => !t.done);
  const pick = (list) => sortTasks(list).slice(0, MAX_TASKS).map((t) => taskRow(t, todayKey));
  const week = keyOf(addDays(fromKey(todayKey), 6));
  const sources = [
    { id: 'today', name: 'Hoje', color: '', tasks: pick(undone.filter((t) => t.date && t.date <= todayKey)), count: undone.filter((t) => t.date && t.date <= todayKey).length },
    { id: 'next7', name: 'Próximos 7 dias', color: '', tasks: pick(undone.filter((t) => t.date && t.date <= week)), count: undone.filter((t) => t.date && t.date <= week).length },
  ];
  for (const l of data.lists || []) {
    const items = undone.filter((t) => t.listId === l.id && !(t.someday && !t.date));
    sources.push({ id: `list:${l.id}`, name: l.id === INBOX_ID ? 'Entrada' : l.name, color: colorOf(l.color).value, tasks: pick(items), count: items.length });
  }
  return sources;
}

/** Pacote completo para os widgets. style vem dos ajustes do aparelho; theme/accent do app. */
export function buildWidgetPayload(data, todayKey, { now = new Date(), style = {}, theme = 'light', accent = '' } = {}) {
  const day = fromKey(todayKey);
  const today = day;
  const habitsToday = activeHabits(data).filter((h) => isListed(h, day));
  const habits = habitsToday.map((h) => {
    const count = countOf(data.log, todayKey, h.id);
    const period = PERIODS.find((p) => p.id === h.period);
    return {
      id: h.id,
      name: h.name,
      color: colorOf(h.color).value,
      count,
      target: h.target,
      done: count >= h.target,
      period: h.period,
      periodLabel: period ? period.label : '',
      streak: currentStreak(h, data, today),
      weekly: isWeekly(h),
      avoid: h.kind === 'avoid',
      timed: h.duration > 0,
    };
  });
  const required = habits.filter((h) => !h.weekly);
  const todayGroups = groupsFor('today', data, todayKey);
  const doneToday = (data.tasks || []).filter((t) => t.done && t.completedAt && keyOf(new Date(t.completedAt)) === todayKey).length;
  const openToday = todayGroups.filter((g) => !g.done).reduce((n, g) => n + g.tasks.length, 0);

  const until = keyOf(addDays(day, 6));
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const events = eventOccurrences(data.events, todayKey, until)
    .filter((o) => !(o.endDate === todayKey && !o.ev.allDay && o.ev.end && Number(o.ev.end.slice(0, 2)) * 60 + Number(o.ev.end.slice(3)) < nowMin))
    .sort((a, b) => a.date.localeCompare(b.date) || (a.ev.allDay ? -1 : b.ev.allDay ? 1 : (a.ev.start || '').localeCompare(b.ev.start || '')))
    .slice(0, 12)
    .map((o) => ({
      id: o.ev.id,
      title: o.ev.title,
      date: o.date,
      day: o.date <= todayKey ? 'Hoje' : dayLabel(o.date, todayKey),
      time: o.ev.allDay ? 'Dia todo' : `${fmtTime(o.ev.start)}${o.ev.end ? `–${fmtTime(o.ev.end)}` : ''}`,
      color: colorOf(o.ev.color).value,
      location: o.ev.location || '',
    }));

  return {
    v: 2,
    date: todayKey,
    dateLabel: fmtLong.format(day).replace(/^./, (c) => c.toUpperCase()),
    theme,
    accent: style.accent ? colorOf(style.accent).value : accent || '',
    opacity: Math.max(20, Math.min(100, style.opacity ?? 100)),
    textScale: style.textScale === 'large' ? 1.15 : 1,
    sources: taskSources(data, todayKey),
    habits,
    habitsDone: required.filter((h) => h.done).length,
    habitsTotal: required.length,
    tasksOpen: openToday,
    tasksDone: doneToday,
    events,
    countdowns: countdowns(data, todayKey, 12).map((c) => ({ id: c.ev.id, title: c.ev.title, days: c.days, date: c.date, color: colorOf(c.ev.color).value })),
    periods: PERIODS.map((p) => ({ id: p.id, name: p.label })),
  };
}

/** Endereço ritmo:// aberto por um widget → { kind, id, query }. */
export function parseRitmoUrl(url) {
  const m = /^ritmo:\/\/([^/?#]+)\/?([^?#]*)(?:\?([^#]*))?/.exec(String(url || ''));
  if (!m) return null;
  const query = {};
  for (const part of (m[3] || '').split('&')) {
    if (!part) continue;
    const [k, v = ''] = part.split('=');
    query[decodeURIComponent(k)] = decodeURIComponent(v.replace(/\+/g, ' '));
  }
  return { kind: m[1], id: m[2] ? decodeURIComponent(m[2]) : '', query };
}

/** Junta a fila: tarefas concluem uma vez; para cada hábito e dia vale o último toque. */
export function collapseWidgetActions(actions) {
  const out = [];
  const seen = new Map();
  for (const a of actions || []) {
    if (!a || !a.type || !a.id) continue;
    const key = a.type === 'habit' ? `h|${a.id}|${a.date || ''}` : `t|${a.id}`;
    if (seen.has(key)) out[seen.get(key)] = a;
    else {
      seen.set(key, out.length);
      out.push(a);
    }
  }
  return out;
}

/** Aplica no app uma ação feita no widget (fila guardada pelo Android). */
export function applyWidgetAction(store, action, todayKey) {
  if (!action || !action.type) return;
  const s = store;
  if (action.type === 'task-done') {
    const t = s.data.tasks.find((x) => x.id === action.id);
    if (t && !t.done) s.tasks.toggle(t.id);
  } else if (action.type === 'habit') {
    const h = s.data.habits.find((x) => x.id === action.id);
    if (!h) return;
    const day = action.date || todayKey;
    const count = Math.max(0, Math.min(h.target, Number(action.count) || 0));
    if (countOf(s.data.log, day, h.id) !== count) s.habits.setCount(h, day, count);
  }
}
