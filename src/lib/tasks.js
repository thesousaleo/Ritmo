/* Tarefas e listas: modelo, visões inteligentes, agrupamento, repetição e entrada rápida em português. Sem UI. */
import { keyOf, fromKey, addDays, todayDate } from './habits.js';
import { prefs, fmtTime } from './prefs.js';
import { isBusinessDay, nthBusinessDay, lastBusinessDay, previousBusinessDay } from './holidays.js';

export const PRIORITIES = [
  { value: 3, label: 'Alta', short: 'Alta', color: 'var(--p-high)' },
  { value: 2, label: 'Média', short: 'Média', color: 'var(--p-med)' },
  { value: 1, label: 'Baixa', short: 'Baixa', color: 'var(--p-low)' },
  { value: 0, label: 'Sem prioridade', short: 'Nenhuma', color: 'var(--p-none)' },
];
export const priorityOf = (v) => PRIORITIES.find((p) => p.value === v) || PRIORITIES[3];

export const LIST_ICONS = ['List', 'Inbox', 'Briefcase', 'User', 'House', 'ShoppingCart', 'GraduationCap', 'Plane', 'Heart', 'Dumbbell', 'BookOpen', 'Wallet', 'Code', 'Music', 'Star', 'Folder', 'Receipt', 'Baby', 'PawPrint', 'Car'];

export const ENERGY = [
  { value: 0, label: 'Sem energia definida', short: '', icon: 'BatteryMedium' },
  { value: 1, label: 'Leve', short: 'Leve', icon: 'BatteryLow' },
  { value: 2, label: 'Média', short: 'Média', icon: 'BatteryMedium' },
  { value: 3, label: 'Pesada', short: 'Pesada', icon: 'BatteryFull' },
];

/** Código de lembrete: "no dia útil anterior, às 9h" (contas). */
export const REMINDER_BIZ_BEFORE = 9999;

export const LIST_COVERS = ['', 'mist', 'dawn', 'dusk', 'grid', 'dots', 'waves'];

export const fmtMoney = (v) => (v === null || v === undefined || v === '' ? '' : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }));

export const INBOX_ID = 'inbox';

export const defaultLists = () => [
  { id: INBOX_ID, name: 'Entrada', color: 'cobalt', icon: 'Inbox', position: 0, sections: [], view: 'list' },
  { id: 'pessoal', name: 'Pessoal', color: 'mint', icon: 'User', position: 1, sections: [], view: 'list' },
  { id: 'trabalho', name: 'Trabalho', color: 'amber', icon: 'Briefcase', position: 2, sections: [], view: 'list' },
];

export const newId = (prefix) => prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

/* ---------- normalização ---------- */
export const normalizeList = (l) => ({ color: 'cobalt', icon: 'List', position: 0, sections: [], view: 'list', cover: '', kind: 'tasks', ownerId: null, ...l });

export const normalizeTask = (t) => ({
  listId: INBOX_ID,
  notes: '',
  date: '',
  time: '',
  duration: 0,
  priority: 0,
  tags: [],
  repeat: '',
  reminder: -1,
  checklist: [],
  sectionId: '',
  position: 0,
  done: false,
  completedAt: null,
  createdAt: new Date().toISOString(),
  deadline: '',
  someday: false,
  postponed: 0,
  energy: 0,
  amount: null,
  attachments: [],
  nag: false,
  place: '',
  assignee: null,
  ownerId: null,
  ...t,
});

export const normalizeEvent = (e) => ({
  notes: '',
  location: '',
  endDate: e.date,
  start: '',
  end: '',
  allDay: !e.start,
  color: 'cobalt',
  repeat: '',
  reminder: -1,
  countdown: false,
  ...e,
});

/* ---------- datas ---------- */
export const minutesOf = (hhmm) => {
  if (!hhmm) return null;
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};
export const hhmm = (mins) => {
  const m = ((Math.round(mins) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};
export const daysBetween = (a, b) => Math.round((fromKey(b) - fromKey(a)) / 86400000);

const WD_LONG = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
const WD_SHORT = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

/** "Hoje", "Amanhã", "Ontem", "sex", "sex, 7 nov", "7 nov 2027". */
export function dayLabel(key, todayKey) {
  const diff = daysBetween(todayKey, key);
  if (diff === 0) return 'Hoje';
  if (diff === 1) return 'Amanhã';
  if (diff === -1) return 'Ontem';
  const d = fromKey(key);
  const t = fromKey(todayKey);
  if (diff > 1 && diff < 7) return WD_SHORT[d.getDay()];
  const base = `${d.getDate()} ${MONTHS[d.getMonth()]}`;
  return d.getFullYear() === t.getFullYear() ? `${WD_SHORT[d.getDay()]}, ${base}` : `${base} ${d.getFullYear()}`;
}

export function dueLabel(task, todayKey) {
  if (!task.date) return '';
  const day = dayLabel(task.date, todayKey);
  return task.time ? `${day}, ${fmtTime(task.time)}` : day;
}

export const isOverdue = (task, todayKey, nowMins) =>
  !task.done && !!task.date && (task.date < todayKey || (task.date === todayKey && task.time && nowMins !== undefined && minutesOf(task.time) + (task.duration || 0) < nowMins));

/* ---------- repetição ---------- */
/*
 * Regras:
 *   daily[/N]                 a cada N dias
 *   weekdays                  segunda a sexta
 *   bizdays                   dias úteis (pula feriados)
 *   weekly[:d,d][/N]          a cada N semanas, nos dias d (0 = domingo)
 *   monthly[/N]               mesmo dia do mês
 *   monthly:last              último dia do mês
 *   monthly:lastbiz           último dia útil
 *   monthly:bizN              N-ésimo dia útil (biz5 = quinto dia útil)
 *   monthly:wN-D              N-ésima ocorrência do dia D (N = 1..4 ou L para a última)
 *   yearly[/N]
 *   after:Nd | after:Nw | after:Nm   repete N dias/semanas/meses depois de concluir
 */
export function parseRule(rule) {
  if (!rule) return null;
  if (rule.startsWith('after:')) {
    const m = rule.slice(6).match(/^(\d+)([dwm])$/);
    return { freq: 'after', n: m ? Number(m[1]) : 1, unit: m ? m[2] : 'd', interval: 1, days: null, mode: '' };
  }
  const [body, every] = rule.split('/');
  const [freq, spec] = body.split(':');
  const interval = Math.max(1, Number(every) || 1);
  if (freq === 'monthly') return { freq, mode: spec || '', interval, days: null };
  return { freq, days: spec ? spec.split(',').map(Number).sort((a, b) => a - b) : null, interval, mode: '' };
}

const pad2 = (n) => String(n).padStart(2, '0');
const ymKey = (y, m, d) => `${y}-${pad2(m)}-${pad2(d)}`;

/** Ocorrência de uma regra mensal especial num mês (m = 1..12). */
function monthlyOccurrence(mode, y, m, fallbackDay) {
  const last = new Date(y, m, 0).getDate();
  if (!mode) return ymKey(y, m, Math.min(fallbackDay, last));
  if (mode === 'last') return ymKey(y, m, last);
  if (mode === 'lastbiz') return lastBusinessDay(y, m);
  if (mode.startsWith('biz')) return nthBusinessDay(y, m, Number(mode.slice(3)) || 1);
  if (mode.startsWith('w')) {
    const [n, d] = mode.slice(1).split('-');
    const wd = Number(d);
    if (n === 'L') {
      for (let day = last; day >= 1; day--) if (new Date(y, m - 1, day).getDay() === wd) return ymKey(y, m, day);
    }
    let count = 0;
    for (let day = 1; day <= last; day++) {
      if (new Date(y, m - 1, day).getDay() === wd && ++count === Number(n)) return ymKey(y, m, day);
    }
    return ymKey(y, m, last);
  }
  return ymKey(y, m, Math.min(fallbackDay, last));
}

const weekStartOf = (d) => addDays(d, -((d.getDay() - prefs.weekStart + 7) % 7));

/** A data k é uma ocorrência válida da regra (ignora a fase de intervalos > 1)? */
export function matchesRule(rule, k) {
  const r = parseRule(rule);
  if (!r) return true;
  const d = fromKey(k);
  if (r.freq === 'weekly' && r.days && r.days.length) return r.days.includes(d.getDay());
  if (r.freq === 'weekdays') return d.getDay() !== 0 && d.getDay() !== 6;
  if (r.freq === 'bizdays') return isBusinessDay(k);
  if (r.freq === 'monthly' && r.mode) return monthlyOccurrence(r.mode, d.getFullYear(), d.getMonth() + 1, d.getDate()) === k;
  return true;
}

export function nextDate(rule, fromK) {
  const r = parseRule(rule);
  if (!r) return '';
  const d = fromKey(fromK);
  switch (r.freq) {
    case 'daily':
      return keyOf(addDays(d, r.interval));
    case 'weekdays': {
      let n = addDays(d, 1);
      while (n.getDay() === 0 || n.getDay() === 6) n = addDays(n, 1);
      return keyOf(n);
    }
    case 'bizdays': {
      let n = addDays(d, 1);
      for (let i = 0; i < 30 && !isBusinessDay(keyOf(n)); i++) n = addDays(n, 1);
      return keyOf(n);
    }
    case 'weekly': {
      if (!r.days || !r.days.length) return keyOf(addDays(d, 7 * r.interval));
      // Próximo dia marcado na mesma semana; se acabou a semana, pula o intervalo
      const ws = weekStartOf(d);
      for (let i = 1; i < 7; i++) {
        const n = addDays(d, i);
        if (weekStartOf(n).getTime() !== ws.getTime()) break;
        if (r.days.includes(n.getDay())) return keyOf(n);
      }
      const nextWeek = addDays(ws, 7 * r.interval);
      for (let i = 0; i < 7; i++) {
        const n = addDays(nextWeek, i);
        if (r.days.includes(n.getDay())) return keyOf(n);
      }
      return keyOf(addDays(d, 7));
    }
    case 'monthly': {
      const y = d.getFullYear();
      const m = d.getMonth() + 1;
      if (!r.mode) {
        const target = new Date(y, m - 1 + r.interval, 1);
        return monthlyOccurrence('', target.getFullYear(), target.getMonth() + 1, d.getDate());
      }
      const same = monthlyOccurrence(r.mode, y, m, d.getDate());
      if (same > fromK) return same;
      for (let i = r.interval; i <= 48; i += r.interval) {
        const t = new Date(y, m - 1 + i, 1);
        const c = monthlyOccurrence(r.mode, t.getFullYear(), t.getMonth() + 1, d.getDate());
        if (c > fromK) return c;
      }
      return '';
    }
    case 'yearly': {
      const y = d.getFullYear() + r.interval;
      const last = new Date(y, d.getMonth() + 1, 0).getDate();
      return keyOf(new Date(y, d.getMonth(), Math.min(d.getDate(), last)));
    }
    case 'after':
      return afterDate(rule, fromK);
    default:
      return '';
  }
}

/** Data seguinte para regras "depois de concluir", a partir do dia da conclusão. */
export function afterDate(rule, doneK) {
  const r = parseRule(rule);
  const d = fromKey(doneK);
  if (r.unit === 'w') return keyOf(addDays(d, 7 * r.n));
  if (r.unit === 'm') {
    const t = new Date(d.getFullYear(), d.getMonth() + r.n, 1);
    return monthlyOccurrence('', t.getFullYear(), t.getMonth() + 1, d.getDate());
  }
  return keyOf(addDays(d, r.n));
}

/** Datas de ocorrência de uma regra a partir de startKey, dentro de [fromK, toK]. */
export function occurrences(rule, startKey, fromK, toK, limit = 400) {
  const out = [];
  if (!rule || rule.startsWith('after:')) {
    if (startKey >= fromK && startKey <= toK) out.push(startKey);
    return out;
  }
  const r = parseRule(rule);
  let k = startKey;
  if (!matchesRule(rule, k)) k = nextDate(rule, keyOf(addDays(fromKey(k), -1)));
  // Pula rápido até perto do início do intervalo nas regras diárias
  if (r.freq === 'daily' && k < fromK) {
    const jump = Math.floor(daysBetween(k, fromK) / r.interval) * r.interval;
    k = keyOf(addDays(fromKey(k), jump));
  }
  for (let i = 0; i < 4000 && k && k <= toK && out.length < limit; i++) {
    if (k >= fromK) out.push(k);
    k = nextDate(rule, k);
  }
  return out;
}

/** Primeira ocorrência a partir de uma data (inclusive). */
export const firstOccurrence = (rule, k) => (!rule || matchesRule(rule, k) ? k : nextDate(rule, keyOf(addDays(fromKey(k), -1))));

const ORD = ['', 'primeira', 'segunda', 'terceira', 'quarta'];
const WD_FULL = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];

export function repeatText(rule) {
  const r = parseRule(rule);
  if (!r) return '';
  const n = r.interval;
  switch (r.freq) {
    case 'daily':
      return n > 1 ? `A cada ${n} dias` : 'Todo dia';
    case 'weekdays':
      return 'Segunda a sexta';
    case 'bizdays':
      return 'Dias úteis';
    case 'weekly':
      if (r.days && r.days.length) {
        if (r.days.length === 7 && n === 1) return 'Todo dia';
        const list = r.days.map((d) => WD_SHORT[d]).join(', ');
        return n > 1 ? `A cada ${n} semanas: ${list}` : `Toda ${list}`;
      }
      return n > 1 ? `A cada ${n} semanas` : 'Toda semana';
    case 'monthly': {
      const every = n > 1 ? `A cada ${n} meses` : 'Todo mês';
      if (!r.mode) return every;
      if (r.mode === 'last') return `${every}, no último dia`;
      if (r.mode === 'lastbiz') return `${every}, no último dia útil`;
      if (r.mode.startsWith('biz')) return `${every}, no ${r.mode.slice(3)}º dia útil`;
      if (r.mode.startsWith('w')) {
        const [k, d] = r.mode.slice(1).split('-');
        const wd = WD_FULL[Number(d)];
        const art = Number(d) === 0 || Number(d) === 6 ? 'no' : 'na';
        const ord = k === 'L' ? (art === 'no' ? 'último' : 'última') : art === 'no' ? ORD[Number(k)].replace(/a$/, 'o') : ORD[Number(k)];
        return `${every}, ${art} ${ord} ${wd}`;
      }
      return every;
    }
    case 'yearly':
      return n > 1 ? `A cada ${n} anos` : 'Todo ano';
    case 'after': {
      const u = r.unit === 'w' ? (r.n === 1 ? 'semana' : 'semanas') : r.unit === 'm' ? (r.n === 1 ? 'mês' : 'meses') : r.n === 1 ? 'dia' : 'dias';
      return `${r.n} ${u} depois de concluir`;
    }
    default:
      return '';
  }
}

/**
 * Opções de repetição que fazem sentido para uma data (ex.: 05/11/2026 = quinta, 1ª quinta, 3º dia útil).
 * forTasks inclui as regras "depois de concluir".
 */
export function repeatChoices(dateKey, current = '', forTasks = true) {
  const opts = [{ value: '', label: 'Não repete' }, { value: 'daily', label: 'Todo dia' }, { value: 'bizdays', label: 'Dias úteis (pula feriados)' }, { value: 'weekdays', label: 'Segunda a sexta' }];
  if (dateKey) {
    const d = fromKey(dateKey);
    const wd = d.getDay();
    const y = d.getFullYear();
    const m = d.getMonth() + 1;
    opts.push({ value: `weekly:${wd}`, label: `Toda ${WD_FULL[wd]}` });
    opts.push({ value: `weekly:${wd}/2`, label: `A cada 2 semanas (${WD_FULL[wd]})` });
    opts.push({ value: 'monthly', label: `Todo mês no dia ${d.getDate()}` });
    const nth = Math.ceil(d.getDate() / 7);
    const last = new Date(y, m, 0).getDate();
    if (nth <= 4) opts.push({ value: `monthly:w${nth}-${wd}`, label: repeatText(`monthly:w${nth}-${wd}`) });
    if (d.getDate() + 7 > last) opts.push({ value: `monthly:wL-${wd}`, label: repeatText(`monthly:wL-${wd}`) });
    if (d.getDate() === last) opts.push({ value: 'monthly:last', label: 'Todo mês, no último dia' });
    if (isBusinessDay(dateKey)) {
      let n = 0;
      for (let i = 1; i <= d.getDate(); i++) if (isBusinessDay(ymKey(y, m, i))) n++;
      if (lastBusinessDay(y, m) === dateKey) opts.push({ value: 'monthly:lastbiz', label: 'Todo mês, no último dia útil' });
      if (n <= 10) opts.push({ value: `monthly:biz${n}`, label: `Todo mês, no ${n}º dia útil` });
    }
    opts.push({ value: 'yearly', label: 'Todo ano' });
  } else opts.push({ value: 'weekly', label: 'Toda semana' }, { value: 'monthly', label: 'Todo mês' }, { value: 'yearly', label: 'Todo ano' });
  if (forTasks) opts.push({ value: 'after:1d', label: '1 dia depois de concluir' }, { value: 'after:1w', label: '1 semana depois de concluir' }, { value: 'after:1m', label: '1 mês depois de concluir' });
  if (current && !opts.some((o) => o.value === current)) opts.push({ value: current, label: repeatText(current) });
  return opts;
}

export const REPEAT_OPTIONS = [
  { value: '', label: 'Não repete' },
  { value: 'daily', label: 'Todo dia' },
  { value: 'bizdays', label: 'Dias úteis (pula feriados)' },
  { value: 'weekly', label: 'Toda semana' },
  { value: 'monthly', label: 'Todo mês' },
  { value: 'yearly', label: 'Todo ano' },
];

export const reminderOptions = (hasTime) =>
  hasTime
    ? [
        { value: -1, label: 'Sem lembrete' },
        { value: 0, label: 'Na hora' },
        { value: 5, label: '5 minutos antes' },
        { value: 15, label: '15 minutos antes' },
        { value: 30, label: '30 minutos antes' },
        { value: 60, label: '1 hora antes' },
        { value: 1440, label: '1 dia antes' },
      ]
    : [
        { value: -1, label: 'Sem lembrete' },
        { value: 0, label: 'No dia, às 9h' },
        { value: 1440, label: '1 dia antes, às 9h' },
        { value: 2880, label: '2 dias antes, às 9h' },
        { value: REMINDER_BIZ_BEFORE, label: 'Dia útil anterior, às 9h' },
      ];

export const reminderText = (min, hasTime) => {
  const o = reminderOptions(hasTime).find((x) => x.value === min);
  return o && min >= 0 ? o.label : '';
};

/** Momento (Date) em que o lembrete deve tocar. */
export function reminderAt(date, time, minutesBefore) {
  if (!date || minutesBefore < 0) return null;
  if (minutesBefore === REMINDER_BIZ_BEFORE) {
    const p = fromKey(previousBusinessDay(date));
    return new Date(p.getFullYear(), p.getMonth(), p.getDate(), 9, 0);
  }
  const d = fromKey(date);
  if (time) {
    const m = minutesOf(time);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, m - minutesBefore);
  }
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - Math.round(minutesBefore / 1440), 9, 0);
}

/* ---------- visões ---------- */
export const SMART_VIEWS = [
  { id: 'today', label: 'Hoje', icon: 'Sun' },
  { id: 'tomorrow', label: 'Amanhã', icon: 'Sunrise' },
  { id: 'next7', label: 'Próximos 7 dias', icon: 'CalendarRange' },
  { id: `list:${INBOX_ID}`, label: 'Entrada', icon: 'Inbox' },
];

export const activeTasks = (data) => (data.tasks || []).filter((t) => !t.done);
export const allTags = (data) => [...new Set((data.tasks || []).flatMap((t) => t.tags || []))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
export const listById = (data, id) => (data.lists || []).find((l) => l.id === id);

/* ---------- filtros inteligentes ---------- */
/*
 * Filtro salvo em settings.filters: { id, name, icon, rules: { lists: [], tags: [], priorities: [], energy: [], due: '', text: '' } }.
 * due: '' (qualquer) | 'overdue' | 'today' | 'week' | 'nodate' | 'deadline' | 'someday'
 */
export const FILTER_DUE = [
  { value: '', label: 'Qualquer data' },
  { value: 'overdue', label: 'Atrasadas' },
  { value: 'today', label: 'Até hoje' },
  { value: 'week', label: 'Próximos 7 dias' },
  { value: 'nodate', label: 'Sem data' },
  { value: 'deadline', label: 'Com prazo final' },
  { value: 'someday', label: 'Algum dia' },
];
export const filtersOf = (data) => ((data.settings && data.settings.filters) || []).filter((f) => f && f.id);
export const filterById = (data, id) => filtersOf(data).find((f) => f.id === id);

export function matchesFilter(task, rules, todayKey) {
  const r = rules || {};
  if (r.lists && r.lists.length && !r.lists.includes(task.listId)) return false;
  if (r.tags && r.tags.length && !(task.tags || []).some((t) => r.tags.includes(t))) return false;
  if (r.priorities && r.priorities.length && !r.priorities.includes(task.priority)) return false;
  if (r.energy && r.energy.length && !r.energy.includes(task.energy || 0)) return false;
  if (r.text && !fold([task.title, task.notes].join(' ')).includes(fold(r.text))) return false;
  const week = keyOf(addDays(fromKey(todayKey), 6));
  switch (r.due) {
    case 'overdue':
      return !!task.date && task.date < todayKey;
    case 'today':
      return !!task.date && task.date <= todayKey;
    case 'week':
      return !!task.date && task.date <= week;
    case 'nodate':
      return !task.date;
    case 'deadline':
      return !!task.deadline;
    case 'someday':
      return !!task.someday;
    default:
      return true;
  }
}

export function viewMeta(view, data) {
  if (view.startsWith('filter:')) {
    const f = filterById(data, view.slice(7));
    return { title: f ? f.name : 'Filtro', icon: (f && f.icon) || 'Filter', kind: 'filter', filter: f || null };
  }
  if (view === 'someday') return { title: 'Algum dia', icon: 'Cloud', kind: 'someday' };
  if (view.startsWith('list:')) {
    const l = listById(data, view.slice(5));
    return { title: l ? l.name : 'Lista', icon: l ? l.icon : 'List', list: l || null, kind: 'list' };
  }
  if (view.startsWith('tag:')) return { title: `#${view.slice(4)}`, icon: 'Hash', kind: 'tag' };
  const s = SMART_VIEWS.find((v) => v.id === view);
  if (s) return { title: s.label, icon: s.icon, kind: view };
  if (view === 'all') return { title: 'Todas', icon: 'Layers', kind: 'all' };
  if (view === 'done') return { title: 'Concluídas', icon: 'CircleCheck', kind: 'done' };
  return { title: 'Tarefas', icon: 'ListTodo', kind: 'all' };
}

/** Valores padrão de uma tarefa criada dentro de uma visão. */
export function viewDefaults(view, todayKey) {
  if (view === 'today') return { date: todayKey };
  if (view === 'tomorrow') return { date: keyOf(addDays(fromKey(todayKey), 1)) };
  if (view === 'next7') return { date: todayKey };
  if (view.startsWith('list:')) return { listId: view.slice(5) };
  if (view.startsWith('tag:')) return { tags: [view.slice(4)] };
  if (view === 'someday') return { someday: true };
  return {};
}

export function sortTasks(list) {
  return [...list].sort((a, b) => {
    if (a.date !== b.date) return (a.date || '9999') < (b.date || '9999') ? -1 : 1;
    const ta = a.time ? minutesOf(a.time) : 9999;
    const tb = b.time ? minutesOf(b.time) : 9999;
    if (ta !== tb) return ta - tb;
    if (a.priority !== b.priority) return b.priority - a.priority;
    if (a.position !== b.position) return a.position - b.position;
    return (a.createdAt || '').localeCompare(b.createdAt || '');
  });
}

function bucketOf(task, todayKey) {
  if (!task.date) return 'nodate';
  const diff = daysBetween(todayKey, task.date);
  if (diff < 0) return 'overdue';
  if (diff === 0) return 'today';
  if (diff === 1) return 'tomorrow';
  if (diff < 7) return 'week';
  return 'later';
}
const BUCKETS = [
  ['overdue', 'Atrasadas'],
  ['today', 'Hoje'],
  ['tomorrow', 'Amanhã'],
  ['week', 'Próximos 7 dias'],
  ['later', 'Mais tarde'],
  ['nodate', 'Sem data'],
];

/** Grupos de tarefas para uma visão. Cada grupo: { id, title, tasks, tone?, collapsible? } */
export function groupsFor(view, data, todayKey) {
  const tasks = data.tasks || [];
  const undone = tasks.filter((t) => !t.done);
  const done = tasks.filter((t) => t.done);
  const tomorrowKey = keyOf(addDays(fromKey(todayKey), 1));
  const groups = [];
  const doneGroup = (list) => {
    const sorted = [...list].sort((a, b) => (b.completedAt || '').localeCompare(a.completedAt || ''));
    if (sorted.length) groups.push({ id: 'done', title: 'Concluídas', tasks: sorted, collapsible: true, done: true });
  };
  const byBuckets = (list) => {
    const active = list.filter((t) => !t.someday || t.date);
    for (const [id, title] of BUCKETS) {
      const items = sortTasks(active.filter((t) => bucketOf(t, todayKey) === id));
      if (items.length) groups.push({ id, title, tasks: items, tone: id === 'overdue' ? 'danger' : undefined });
    }
    const later = sortTasks(list.filter((t) => t.someday && !t.date));
    if (later.length) groups.push({ id: 'someday', title: 'Algum dia', tasks: later, collapsible: true, soft: true });
  };

  if (view === 'today') {
    const overdue = sortTasks(undone.filter((t) => t.date && t.date < todayKey));
    if (overdue.length) groups.push({ id: 'overdue', title: 'Atrasadas', tasks: overdue, tone: 'danger' });
    groups.push({ id: 'today', title: 'Hoje', tasks: sortTasks(undone.filter((t) => t.date === todayKey)) });
    doneGroup(done.filter((t) => t.date === todayKey || (t.completedAt && keyOf(new Date(t.completedAt)) === todayKey)));
  } else if (view === 'tomorrow') {
    groups.push({ id: 'tomorrow', title: 'Amanhã', tasks: sortTasks(undone.filter((t) => t.date === tomorrowKey)) });
    doneGroup(done.filter((t) => t.date === tomorrowKey));
  } else if (view === 'next7') {
    const overdue = sortTasks(undone.filter((t) => t.date && t.date < todayKey));
    if (overdue.length) groups.push({ id: 'overdue', title: 'Atrasadas', tasks: overdue, tone: 'danger' });
    for (let i = 0; i < 7; i++) {
      const k = keyOf(addDays(fromKey(todayKey), i));
      groups.push({ id: `d:${k}`, title: dayLabel(k, todayKey), date: k, tasks: sortTasks(undone.filter((t) => t.date === k)), compact: true });
    }
  } else if (view.startsWith('list:')) {
    const id = view.slice(5);
    byBuckets(undone.filter((t) => t.listId === id));
    doneGroup(done.filter((t) => t.listId === id));
  } else if (view.startsWith('tag:')) {
    const tag = view.slice(4);
    byBuckets(undone.filter((t) => (t.tags || []).includes(tag)));
    doneGroup(done.filter((t) => (t.tags || []).includes(tag)));
  } else if (view === 'someday') {
    groups.push({ id: 'someday', title: 'Algum dia', tasks: sortTasks(undone.filter((t) => t.someday && !t.date)) });
  } else if (view.startsWith('filter:')) {
    const f = filterById(data, view.slice(7));
    const rules = f ? f.rules : {};
    byBuckets(undone.filter((t) => matchesFilter(t, rules, todayKey)));
  } else if (view === 'all') {
    for (const l of data.lists || []) {
      const items = sortTasks(undone.filter((t) => t.listId === l.id && !(t.someday && !t.date)));
      if (items.length) groups.push({ id: `l:${l.id}`, title: l.name, tasks: items, color: l.color });
    }
    const known = new Set((data.lists || []).map((l) => l.id));
    const orphan = sortTasks(undone.filter((t) => !known.has(t.listId) && !(t.someday && !t.date)));
    if (orphan.length) groups.push({ id: 'l:?', title: 'Outras', tasks: orphan });
  } else if (view === 'done') {
    const sorted = [...done].sort((a, b) => (b.completedAt || '').localeCompare(a.completedAt || ''));
    const byDay = new Map();
    for (const t of sorted) {
      const k = t.completedAt ? keyOf(new Date(t.completedAt)) : t.date || todayKey;
      if (!byDay.has(k)) byDay.set(k, []);
      byDay.get(k).push(t);
    }
    for (const [k, items] of byDay) groups.push({ id: `c:${k}`, title: dayLabel(k, todayKey), tasks: items, done: true });
  }
  return groups;
}

export function viewCount(view, data, todayKey) {
  return groupsFor(view, data, todayKey)
    .filter((g) => !g.done && !g.soft)
    .reduce((n, g) => n + g.tasks.length, 0);
}

/* ---------- matriz de Eisenhower ---------- */
export const QUADRANTS = [
  { id: 'q1', priority: 3, title: 'Urgente e importante', hint: 'Faça agora', tone: 'var(--p-high)' },
  { id: 'q2', priority: 2, title: 'Importante, não urgente', hint: 'Planeje', tone: 'var(--p-med)' },
  { id: 'q3', priority: 1, title: 'Urgente, não importante', hint: 'Delegue ou agilize', tone: 'var(--p-low)' },
  { id: 'q4', priority: 0, title: 'Nem urgente nem importante', hint: 'Deixe para depois', tone: 'var(--p-none)' },
];

export function matrixTasks(data, todayKey, scope = 'all') {
  const limit = scope === 'week' ? keyOf(addDays(fromKey(todayKey), 6)) : null;
  const list = activeTasks(data).filter((t) => !limit || (t.date && t.date <= limit));
  return QUADRANTS.map((q) => ({ ...q, tasks: sortTasks(list.filter((t) => t.priority === q.priority)) }));
}

/* ---------- Kanban ---------- */
export function kanbanColumns(list, data) {
  const tasks = activeTasks(data).filter((t) => t.listId === list.id);
  const sections = list.sections || [];
  const ids = new Set(sections.map((s) => s.id));
  const byPos = (a, b) => a.position - b.position || (a.createdAt || '').localeCompare(b.createdAt || '');
  const cols = [];
  const loose = tasks.filter((t) => !t.sectionId || !ids.has(t.sectionId)).sort(byPos);
  if (loose.length || !sections.length) cols.push({ id: '', name: sections.length ? 'Sem seção' : 'Tarefas', tasks: loose, fixed: true });
  for (const s of sections) cols.push({ id: s.id, name: s.name, tasks: tasks.filter((t) => t.sectionId === s.id).sort(byPos) });
  return cols;
}

/** Posição entre vizinhos para reordenar sem renumerar a lista inteira. */
export function positionBetween(before, after) {
  if (before === undefined && after === undefined) return 0;
  if (before === undefined) return after - 1;
  if (after === undefined) return before + 1;
  return (before + after) / 2;
}

/* ---------- busca ---------- */
const fold = (s) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function searchAll(data, query) {
  const q = fold(query.trim());
  if (!q) return { tasks: [], events: [], habits: [] };
  const hit = (...fields) => fields.some((f) => fold(Array.isArray(f) ? f.join(' ') : f).includes(q));
  return {
    tasks: (data.tasks || []).filter((t) => hit(t.title, t.notes, t.tags, (t.checklist || []).map((c) => c.text))).slice(0, 40),
    events: (data.events || []).filter((e) => hit(e.title, e.notes, e.location)).slice(0, 20),
    habits: (data.habits || []).filter((h) => hit(h.name, h.unit)).slice(0, 10),
  };
}

/* ---------- entrada rápida ---------- */
const WEEKDAY_RE = 'domingo|segunda(?:-feira)?|ter[çc]a(?:-feira)?|quarta(?:-feira)?|quinta(?:-feira)?|sexta(?:-feira)?|s[áa]bado';
const wdIndex = (w) => {
  const f = fold(w).replace('-feira', '');
  return ['domingo', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado'].indexOf(f);
};
const L = '[\\p{L}\\p{N}]';
const PRE = '(^|[\\s,.;(])';
const POST = `(?!${L})`;

function nextWeekday(todayK, wd, allowToday = false) {
  const d = fromKey(todayK);
  for (let i = allowToday ? 0 : 1; i <= 7; i++) {
    const n = addDays(d, i);
    if (n.getDay() === wd) return keyOf(n);
  }
  return todayK;
}

const ORD_WORDS = { primeiro: 1, segundo: 2, terceiro: 3, quarto: 4, quinto: 5, sexto: 6, setimo: 7, oitavo: 8, nono: 9, decimo: 10 };
const ORD_RE = 'primeir[oa]|segund[oa]|terceir[oa]|quart[oa]|quint[oa]|sext[oa]|s[ée]tim[oa]|oitav[oa]|non[oa]|d[ée]cim[oa]';
const ordValue = (w) => {
  const f = fold(w);
  if (/^\d/.test(f)) return Number(f.replace(/\D+$/, '')) || 0;
  return ORD_WORDS[f.replace(/a$/, 'o')] || 0;
};

/** Converte uma expressão curta de data ("sexta", "amanhã", "15/11", "dia 20") numa data a partir de hoje. */
export function dateFromWord(word, todayK) {
  const w = fold(word.trim()).replace(/^(?:o |a |na |no )/, '');
  const t = fromKey(todayK);
  if (w === 'hoje') return todayK;
  if (w === 'amanha') return keyOf(addDays(t, 1));
  if (w === 'depois de amanha') return keyOf(addDays(t, 2));
  if (/^fim do mes$/.test(w)) return keyOf(new Date(t.getFullYear(), t.getMonth() + 1, 0));
  if (/^fim da semana$|^fim de semana$/.test(w)) return nextWeekday(todayK, 6, true);
  const wd = wdIndex(w);
  if (wd >= 0) return nextWeekday(todayK, wd, true);
  let m = w.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/);
  if (m) {
    const day = Number(m[1]);
    const mon = Number(m[2]) - 1;
    const y = m[3] ? Number(m[3].length === 2 ? `20${m[3]}` : m[3]) : t.getFullYear();
    let d = new Date(y, mon, day);
    if (!m[3] && keyOf(d) < todayK) d = new Date(y + 1, mon, day);
    return d.getMonth() === mon ? keyOf(d) : '';
  }
  m = w.match(/^dia (\d{1,2})$/);
  if (m) {
    const day = Number(m[1]);
    for (let i = 0; i < 3; i++) {
      const d = new Date(t.getFullYear(), t.getMonth() + i, day);
      if (d.getDate() === day && keyOf(d) >= todayK) return keyOf(d);
    }
  }
  return '';
}

/**
 * Lê uma frase como "Reunião amanhã às 15h #trabalho !1 ^Pessoal" e devolve os campos.
 * Tokens: datas (hoje, amanhã, segunda, dia 15, 15/11, em 3 dias, próxima semana), horas (15h, 9h30, 14:00),
 * prioridade (!1 alta, !2 média, !3 baixa, ou !alta), etiquetas (#tag), lista (^lista) e repetição (todo dia, toda segunda…).
 * Extras: prazo final ("até sexta"), energia (~leve, ~média, ~pesada), estimativa (~30min, ~1h), "algum dia",
 * valor (R$ 120,50), @agenda (vira compromisso) e repetições como "todo quinto dia útil", "toda última sexta",
 * "a cada 2 semanas na terça" e "3 dias depois de concluir".
 */
export function parseQuickAdd(text, todayK, lists = []) {
  const found = [];
  const res = { date: '', time: '', priority: null, tags: [], listId: null, repeat: '', deadline: '', energy: 0, someday: false, asEvent: false, amount: null, duration: 0 };
  const claim = (start, end) => !found.some((f) => start < f.end && end > f.start);
  const scan = (pattern, type, handler) => {
    const re = new RegExp(pattern, 'giu');
    let m;
    while ((m = re.exec(text))) {
      const start = m.index + m[1].length;
      const end = m.index + m[0].length;
      if (end === start) {
        re.lastIndex++;
        continue;
      }
      if (!claim(start, end)) continue;
      const label = handler(m);
      if (label !== false) found.push({ start, end, type, label: label || m[0].slice(m[1].length) });
    }
  };

  const DATE_WORD = `hoje|amanh[ãa]|depois de amanh[ãa]|(?:o )?fim do m[êe]s|(?:o )?fim (?:da|de) semana|(?:a |o )?(?:${WEEKDAY_RE})|\\d{1,2}/\\d{1,2}(?:/\\d{2,4})?|dia \\d{1,2}`;
  const monthlyRule = (mode, every) => {
    res.repeat = `monthly:${mode}`;
    if (!res.date) res.date = firstOccurrence(res.repeat, todayK);
    return repeatText(res.repeat);
  };
  const oneOff = (mode) => {
    const t = fromKey(todayK);
    const here = nextDate(`monthly:${mode}`, keyOf(addDays(t, -1)));
    return here;
  };

  // Prazo final: "até sexta", "prazo 15/11"
  scan(`${PRE}(?:at[ée]|prazo(?: final)?:?) (${DATE_WORD})${POST}`, 'deadline', (m) => {
    const k = dateFromWord(m[2], todayK);
    if (!k) return false;
    res.deadline = k;
    return `Prazo ${dayLabel(k, todayK).toLowerCase()}`;
  });

  // Depois de concluir
  scan(`${PRE}(\\d{1,2}) (dias?|semanas?|m[êe]s(?:es)?) (?:depois|ap[óo]s) (?:de )?conclu[íi]r?(?:da|do)?${POST}`, 'repeat', (m) => {
    const u = fold(m[3]);
    res.repeat = `after:${Number(m[2])}${u.startsWith('dia') ? 'd' : u.startsWith('sem') ? 'w' : 'm'}`;
    return repeatText(res.repeat);
  });

  // Dias úteis do mês
  scan(`${PRE}(?:(tod[oa]s?(?: m[êe]s)?(?: n?o)?) )?(?:n?o )?(${ORD_RE}|\\d{1,2}[ºo°]?) dia [úu]til(?: do m[êe]s)?${POST}`, 'repeat', (m) => {
    const n = ordValue(m[3]);
    if (!n || n > 23) return false;
    if (m[2]) return monthlyRule(`biz${n}`);
    res.date = oneOff(`biz${n}`);
    return `${n}º dia útil`;
  });
  scan(`${PRE}(?:(tod[oa]s?(?: m[êe]s)?(?: n?o)?) )?(?:n?o )?[úu]ltimo dia [úu]til(?: do m[êe]s)?${POST}`, 'repeat', (m) => {
    if (m[2]) return monthlyRule('lastbiz');
    res.date = oneOff('lastbiz');
    return 'Último dia útil';
  });
  scan(`${PRE}(?:(tod[oa]s?(?: m[êe]s)?(?: n?o)?) )?(?:n?o )?[úu]ltimo dia do m[êe]s${POST}`, 'repeat', (m) => {
    if (m[2]) return monthlyRule('last');
    res.date = oneOff('last');
    return 'Último dia do mês';
  });
  // Toda primeira segunda do mês, toda última sexta
  scan(`${PRE}tod[ao]s? (?:as? |os? )?(primeir[oa]|segund[oa]|terceir[oa]|quart[oa]|[úu]ltim[oa])s? (${WEEKDAY_RE})s?(?: do m[êe]s)?${POST}`, 'repeat', (m) => {
    const wd = wdIndex(m[3].replace(/s$/, ''));
    if (wd < 0) return false;
    const which = /^[úu]ltim/i.test(m[2]) ? 'L' : ordValue(m[2]);
    return monthlyRule(`w${which}-${wd}`);
  });
  // A cada 2 semanas na terça (e quinta)
  scan(`${PRE}a cada (\\d{1,2}) semanas?,? (?:n[ao]s?|[àa]s|aos|em) ((?:${WEEKDAY_RE})s?(?:(?:,| e) (?:${WEEKDAY_RE})s?)*)${POST}`, 'repeat', (m) => {
    const n = Number(m[2]);
    const days = m[3].split(/,| e /).map((x) => wdIndex(x.trim().replace(/s$/, ''))).filter((d) => d >= 0);
    if (!days.length) return false;
    res.repeat = `weekly:${[...new Set(days)].sort((a, b) => a - b).join(',')}${n > 1 ? `/${n}` : ''}`;
    res.date = days.map((d) => nextWeekday(todayK, d, true)).sort()[0];
    return repeatText(res.repeat);
  });

  // Repetição (antes das datas para "toda segunda" não virar só "segunda")
  scan(`${PRE}(todo dia [úu]til|dias [úu]teis)${POST}`, 'repeat', () => {
    res.repeat = 'bizdays';
    return 'Dias úteis';
  });
  scan(`${PRE}(segunda a sexta|de segunda a sexta)${POST}`, 'repeat', () => {
    res.repeat = 'weekdays';
    return 'Segunda a sexta';
  });
  scan(`${PRE}(todos? os dias|todo dia|diariamente)${POST}`, 'repeat', () => {
    res.repeat = 'daily';
    return 'Todo dia';
  });
  scan(`${PRE}(?:tod[ao]s? (?:as? |os? )?)((?:${WEEKDAY_RE})(?:s)?(?:(?:,| e) (?:${WEEKDAY_RE})s?)*)${POST}`, 'repeat', (m) => {
    const days = m[2].split(/,| e /).map((s) => wdIndex(s.trim().replace(/s$/, ''))).filter((d) => d >= 0);
    if (!days.length) return false;
    res.repeat = `weekly:${[...new Set(days)].sort((a, b) => a - b).join(',')}`;
    res.date = days.map((d) => nextWeekday(todayK, d, true)).sort()[0];
    return repeatText(res.repeat);
  });
  scan(`${PRE}(toda semana|semanalmente)${POST}`, 'repeat', () => {
    res.repeat = 'weekly';
    return 'Toda semana';
  });
  scan(`${PRE}(todo m[êe]s|mensalmente)${POST}`, 'repeat', () => {
    res.repeat = 'monthly';
    return 'Todo mês';
  });
  scan(`${PRE}(todo ano|anualmente)${POST}`, 'repeat', () => {
    res.repeat = 'yearly';
    return 'Todo ano';
  });
  scan(`${PRE}a cada (\\d{1,2}) (dias?|semanas?|m[êe]s(?:es)?)${POST}`, 'repeat', (m) => {
    const n = Number(m[2]);
    const unit = fold(m[3]);
    res.repeat = `${unit.startsWith('dia') ? 'daily' : unit.startsWith('sem') ? 'weekly' : 'monthly'}${n > 1 ? `/${n}` : ''}`;
    return repeatText(res.repeat);
  });

  // Datas
  const setDate = (k) => {
    res.date = k;
    return dayLabel(k, todayK);
  };
  scan(`${PRE}(depois de amanh[ãa])${POST}`, 'date', () => setDate(keyOf(addDays(fromKey(todayK), 2))));
  scan(`${PRE}(hoje)${POST}`, 'date', () => setDate(todayK));
  scan(`${PRE}(amanh[ãa])${POST}`, 'date', () => setDate(keyOf(addDays(fromKey(todayK), 1))));
  scan(`${PRE}(pr[óo]xima semana)${POST}`, 'date', () => setDate(nextWeekday(todayK, 1)));
  scan(`${PRE}(fim de semana)${POST}`, 'date', () => setDate(nextWeekday(todayK, 6, true)));
  scan(`${PRE}(?:em|daqui a) (\\d{1,3}) (dias?|semanas?)${POST}`, 'date', (m) => {
    const n = Number(m[2]) * (fold(m[3]).startsWith('sem') ? 7 : 1);
    return setDate(keyOf(addDays(fromKey(todayK), n)));
  });
  scan(`${PRE}(?:(?:na|no|nessa|nesse|pr[óo]xim[ao]) )?(${WEEKDAY_RE})${POST}`, 'date', (m) => {
    const wd = wdIndex(m[2]);
    if (wd < 0) return false;
    return setDate(nextWeekday(todayK, wd));
  });
  scan(`${PRE}(\\d{1,2})/(\\d{1,2})(?:/(\\d{2,4}))?${POST}`, 'date', (m) => {
    const day = Number(m[2]);
    const mon = Number(m[3]) - 1;
    if (day < 1 || day > 31 || mon < 0 || mon > 11) return false;
    const t = fromKey(todayK);
    let y = m[4] ? Number(m[4].length === 2 ? `20${m[4]}` : m[4]) : t.getFullYear();
    let d = new Date(y, mon, day);
    if (!m[4] && keyOf(d) < todayK) d = new Date(y + 1, mon, day);
    if (d.getMonth() !== mon) return false;
    return setDate(keyOf(d));
  });
  scan(`${PRE}dia (\\d{1,2})${POST}`, 'date', (m) => {
    const day = Number(m[2]);
    if (day < 1 || day > 31) return false;
    const t = fromKey(todayK);
    for (let i = 0; i < 3; i++) {
      const d = new Date(t.getFullYear(), t.getMonth() + i, day);
      if (d.getDate() === day && keyOf(d) >= todayK) return setDate(keyOf(d));
    }
    return false;
  });

  // Horas
  const setTime = (h, mm) => {
    if (h > 23 || mm > 59) return false;
    res.time = `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
    return res.time;
  };
  scan(`${PRE}(?:(?:[àa]s|ao|a partir d[ao]s?) )?(meio-dia|meia-noite)${POST}`, 'time', (m) => setTime(fold(m[2]) === 'meio-dia' ? 12 : 0, 0));
  scan(`${PRE}(?:(?:[àa]s|a partir das) )?([01]?\\d|2[0-3])(?:h([0-5]\\d)?|:([0-5]\\d))${POST}`, 'time', (m) => setTime(Number(m[2]), Number(m[3] || m[4] || 0)));
  scan(`${PRE}[àÀ]s ([01]?\\d|2[0-3])${POST}`, 'time', (m) => setTime(Number(m[2]), 0));

  // Algum dia, compromisso, valor, energia e estimativa
  scan(`${PRE}(algum dia|um dia desses|sem pressa)${POST}`, 'someday', () => {
    res.someday = true;
    return 'Algum dia';
  });
  scan(`${PRE}@(agenda|evento|compromisso)${POST}`, 'event', () => {
    res.asEvent = true;
    return 'Compromisso';
  });
  scan(`${PRE}R\\$ ?(\\d{1,3}(?:\\.\\d{3})+(?:,\\d{1,2})?|\\d+(?:,\\d{1,2})?)${POST}`, 'amount', (m) => {
    res.amount = Number(m[2].replace(/\./g, '').replace(',', '.'));
    return fmtMoney(res.amount);
  });
  scan(`${PRE}~(leve|m[ée]dia|pesada)${POST}`, 'energy', (m) => {
    const v = fold(m[2]);
    res.energy = v === 'leve' ? 1 : v === 'media' ? 2 : 3;
    return `Energia ${ENERGY[res.energy].short.toLowerCase()}`;
  });
  scan(`${PRE}~(\\d{1,3}) ?(min|m|h)${POST}`, 'estimate', (m) => {
    const n = Number(m[2]) * (m[3] === 'h' ? 60 : 1);
    if (!n || n > 720) return false;
    res.duration = n;
    return n >= 60 ? `~${Math.floor(n / 60)}h${n % 60 ? `${n % 60}` : ''}` : `~${n}min`;
  });

  // Prioridade, etiquetas e lista
  scan(`${PRE}!(1|2|3|alta|m[ée]dia|baixa)${POST}`, 'priority', (m) => {
    const v = fold(m[2]);
    res.priority = v === '1' || v === 'alta' ? 3 : v === '2' || v === 'media' ? 2 : 1;
    return `Prioridade ${priorityOf(res.priority).short.toLowerCase()}`;
  });
  scan(`${PRE}#([\\p{L}\\p{N}_-]+)`, 'tag', (m) => {
    const tag = m[2].toLowerCase();
    if (!res.tags.includes(tag)) res.tags.push(tag);
    return `#${tag}`;
  });
  scan(`${PRE}\\^([\\p{L}\\p{N}_-]+)`, 'list', (m) => {
    const q = fold(m[2]);
    const l = lists.find((x) => fold(x.name) === q) || lists.find((x) => fold(x.name).startsWith(q));
    if (!l) return false;
    res.listId = l.id;
    return l.name;
  });

  if (res.repeat && !res.date) res.date = res.repeat.startsWith('after:') ? todayK : firstOccurrence(res.repeat, todayK);
  if (res.someday && res.date && !res.repeat) res.someday = false;
  if (res.time && !res.date) res.date = todayK;

  // Título: texto sem os trechos reconhecidos
  const sorted = [...found].sort((a, b) => a.start - b.start);
  let title = '';
  let pos = 0;
  for (const f of sorted) {
    title += text.slice(pos, f.start);
    pos = f.end;
  }
  title += text.slice(pos);
  title = title.replace(/\s+/g, ' ').replace(/\s+([,.;])/g, '$1').trim();
  return { ...res, title, tokens: sorted };
}

/* ---------- conclusão (com repetição) ---------- */
/**
 * Concluir uma tarefa repetida cria uma cópia concluída e move a original para a próxima data.
 * Devolve { updated, created } para o chamador gravar e sincronizar.
 */
export function completeTask(task, nowIso = new Date().toISOString()) {
  if (task.repeat && (task.date || task.repeat.startsWith('after:'))) {
    // "Depois de concluir" conta a partir do dia em que foi concluída, não da data marcada
    const next = task.repeat.startsWith('after:') ? afterDate(task.repeat, keyOf(new Date(nowIso))) : nextDate(task.repeat, task.date);
    const created = { ...task, id: newId('t'), repeat: '', done: true, completedAt: nowIso, reminder: -1 };
    const updated = { ...task, date: next, done: false, completedAt: null, postponed: 0, checklist: (task.checklist || []).map((c) => ({ ...c, done: false })) };
    return { updated, created };
  }
  return { updated: { ...task, done: true, completedAt: nowIso }, created: null };
}

export const todayKeyNow = () => keyOf(todayDate());
