/* Textos e cores das notificações (tarefas, eventos e hábitos). Sem Capacitor: dá para testar no Node. */
import { colorOf, fromKey, keyOf, WEEKDAY_SHORT } from './habits.js';
import { fmtTime } from './prefs.js';
import { listById, fmtMoney } from './tasks.js';

const DEFAULT_COLOR = '#3450E6';
const WEEKDAY_FULL = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];

const dayDiff = (fromK, toK) => Math.round((fromKey(toK) - fromKey(fromK)) / 86400000);
const ddmm = (k) => `${k.slice(8, 10)}/${k.slice(5, 7)}`;
const minutesOf = (hhmm) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};
const hexOf = (id) => {
  const c = id ? colorOf(id).value : '';
  return /^#[0-9a-f]{6}$/i.test(c) ? c : DEFAULT_COLOR;
};
const clip = (s, n) => {
  const t = String(s || '').replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t;
};
const fmtGap = (mins) => {
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
};

/** Quando é, visto do momento em que o lembrete toca: "Agora · 15:02", "Em 15 min · às 15:02", "Amanhã às 9:00", "Para hoje". */
export function whenText(date, time, at) {
  const atK = keyOf(at);
  const days = dayDiff(atK, date);
  if (time) {
    const hh = fmtTime(time);
    const d = fromKey(date);
    const due = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, minutesOf(time));
    const mins = Math.round((due - at) / 60000);
    if (mins <= 0) return days < 0 ? `Era ${WEEKDAY_FULL[d.getDay()]} às ${hh}` : `Agora · ${hh}`;
    if (days === 0) return `Em ${fmtGap(mins)} · às ${hh}`;
    if (days === 1) return `Amanhã às ${hh}`;
    return `${WEEKDAY_SHORT[d.getDay()]}, ${ddmm(date)} às ${hh}`;
  }
  if (days <= 0) return 'Para hoje';
  if (days === 1) return 'Para amanhã';
  return `Para ${WEEKDAY_FULL[fromKey(date).getDay()]}, ${ddmm(date)}`;
}

/**
 * Conteúdo da notificação de uma tarefa.
 * kind: 'remind' (lembrete), 'nag' (insistente, ainda pendente) ou 'snooze' (adiada pelo botão).
 */
export function taskNotice(task, data, at, kind = 'remind') {
  const list = listById(data, task.listId);
  const due = task.time ? `às ${fmtTime(task.time)}` : '';
  const first =
    kind === 'nag' ? (due ? `Ainda pendente · era ${due}` : 'Ainda pendente')
    : kind === 'snooze' ? (due ? `Adiada · era ${due}` : 'Adiada')
    : whenText(task.date, task.time, at);
  const extras = [];
  if (task.priority === 3) extras.push('Prioridade alta');
  if (task.amount !== null && task.amount !== undefined && task.amount !== '') extras.push(fmtMoney(task.amount));
  const body = [first, ...extras].join(' · ');

  const lines = [body];
  const steps = task.checklist || [];
  if (steps.length) {
    const done = steps.filter((c) => c.done).length;
    const next = steps.find((c) => !c.done);
    lines.push(`${done} de ${steps.length} subtarefas${next ? ` · próxima: ${clip(next.text, 60)}` : ''}`);
  }
  if (task.notes) lines.push(clip(task.notes, 240));

  return {
    title: task.title,
    body,
    largeBody: lines.join('\n'),
    summaryText: list ? list.name : 'Tarefa',
    iconColor: hexOf(list && list.color),
  };
}

/** Conteúdo do lembrete de um evento (uma ocorrência). */
export function eventNotice(ev, date, at) {
  const where = ev.location ? clip(ev.location, 60) : '';
  let first;
  if (ev.allDay) {
    const days = dayDiff(keyOf(at), date);
    first = days <= 0 ? 'Hoje, dia inteiro' : days === 1 ? 'Amanhã, dia inteiro' : `${WEEKDAY_SHORT[fromKey(date).getDay()]}, ${ddmm(date)} · dia inteiro`;
  } else {
    first = whenText(date, ev.start, at);
    if (ev.end && ev.end !== ev.start) first += `–${fmtTime(ev.end)}`;
  }
  const body = where ? `${first} · ${where}` : first;
  const lines = [body];
  if (ev.notes) lines.push(clip(ev.notes, 240));
  return { title: ev.title, body, largeBody: lines.join('\n'), summaryText: 'Agenda', iconColor: hexOf(ev.color) };
}

/** Conteúdo do lembrete de um hábito. */
export function habitNotice(h) {
  let body;
  if (h.kind === 'avoid') body = 'Segure firme hoje.';
  else if (h.target > 1) body = `Meta de hoje: ${h.target}${h.unit ? ` ${h.unit.toLowerCase()}` : ' vezes'}`;
  else if (h.unit) body = `Hoje: ${h.unit.toLowerCase()}`;
  else if (h.duration > 0) body = `Hoje: ${h.duration} minutos`;
  else body = 'Hora do seu hábito.';
  return {
    title: h.kind === 'avoid' ? `Lembrete: ${h.name}` : h.name,
    body,
    largeBody: body,
    summaryText: 'Hábito',
    iconColor: hexOf(h.color),
  };
}
