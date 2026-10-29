/* Tarefas e listas: modelo, visões inteligentes, agrupamento, repetição e entrada rápida em português. Sem UI. */
import { keyOf, fromKey, addDays, todayDate } from './habits.js';

export const PRIORITIES = [
  { value: 3, label: 'Alta', short: 'Alta', color: 'var(--p-high)' },
  { value: 2, label: 'Média', short: 'Média', color: 'var(--p-med)' },
  { value: 1, label: 'Baixa', short: 'Baixa', color: 'var(--p-low)' },
  { value: 0, label: 'Sem prioridade', short: 'Nenhuma', color: 'var(--p-none)' },
];
export const priorityOf = (v) => PRIORITIES.find((p) => p.value === v) || PRIORITIES[3];

export const LIST_ICONS = ['List', 'Inbox', 'Briefcase', 'User', 'House', 'ShoppingCart', 'GraduationCap', 'Plane', 'Heart', 'Dumbbell', 'BookOpen', 'Wallet', 'Code', 'Music', 'Star', 'Folder'];

export const INBOX_ID = 'inbox';

export const defaultLists = () => [
  { id: INBOX_ID, name: 'Entrada', color: 'cobalt', icon: 'Inbox', position: 0, sections: [], view: 'list' },
  { id: 'pessoal', name: 'Pessoal', color: 'mint', icon: 'User', position: 1, sections: [], view: 'list' },
  { id: 'trabalho', name: 'Trabalho', color: 'amber', icon: 'Briefcase', position: 2, sections: [], view: 'list' },
];

export const newId = (prefix) => prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

/* ---------- normalização ---------- */
export const normalizeList = (l) => ({ color: 'cobalt', icon: 'List', position: 0, sections: [], view: 'list', ...l });

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
  return task.time ? `${day}, ${task.time}` : day;
}

export const isOverdue = (task, todayKey, nowMins) =>
  !task.done && !!task.date && (task.date < todayKey || (task.date === todayKey && task.time && nowMins !== undefined && minutesOf(task.time) + (task.duration || 0) < nowMins));

/* ---------- repetição ---------- */
// Formato: daily | weekdays | weekly | weekly:1,3,5 | monthly | yearly, com intervalo opcional "/N" (daily/2).
export function parseRule(rule) {
  if (!rule) return null;
  const [body, every] = rule.split('/');
  const [freq, days] = body.split(':');
  return { freq, days: days ? days.split(',').map(Number).sort((a, b) => a - b) : null, interval: Math.max(1, Number(every) || 1) };
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
    case 'weekly': {
      if (!r.days || !r.days.length) return keyOf(addDays(d, 7 * r.interval));
      for (let i = 1; i <= 7; i++) {
        const n = addDays(d, i);
        if (r.days.includes(n.getDay())) return keyOf(n);
      }
      return keyOf(addDays(d, 7));
    }
    case 'monthly': {
      const day = d.getDate();
      const target = new Date(d.getFullYear(), d.getMonth() + r.interval, 1);
      const last = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
      return keyOf(new Date(target.getFullYear(), target.getMonth(), Math.min(day, last)));
    }
    case 'yearly': {
      const y = d.getFullYear() + r.interval;
      const last = new Date(y, d.getMonth() + 1, 0).getDate();
      return keyOf(new Date(y, d.getMonth(), Math.min(d.getDate(), last)));
    }
    default:
      return '';
  }
}

/** Datas de ocorrência de uma regra a partir de startKey, dentro de [fromK, toK]. */
export function occurrences(rule, startKey, fromK, toK, limit = 400) {
  const out = [];
  if (!rule) {
    if (startKey >= fromK && startKey <= toK) out.push(startKey);
    return out;
  }
  const r = parseRule(rule);
  let k = startKey;
  // Primeira ocorrência válida para regras por dia da semana
  if (r.freq === 'weekly' && r.days && r.days.length && !r.days.includes(fromKey(k).getDay())) k = nextDate(rule, k);
  if (r.freq === 'weekdays' && [0, 6].includes(fromKey(k).getDay())) k = nextDate(rule, k);
  // Pula rápido até perto do início do intervalo nas regras diárias
  if (r.freq === 'daily' && k < fromK) {
    const jump = Math.floor(daysBetween(k, fromK) / r.interval) * r.interval;
    k = keyOf(addDays(fromKey(k), jump));
  }
  for (let i = 0; i < 4000 && k <= toK && out.length < limit; i++) {
    if (k >= fromK) out.push(k);
    k = nextDate(rule, k);
  }
  return out;
}

export function repeatText(rule) {
  const r = parseRule(rule);
  if (!r) return '';
  const n = r.interval;
  switch (r.freq) {
    case 'daily':
      return n > 1 ? `A cada ${n} dias` : 'Todo dia';
    case 'weekdays':
      return 'Dias úteis';
    case 'weekly':
      if (r.days && r.days.length) {
        if (r.days.length === 7) return 'Todo dia';
        return `Toda ${r.days.map((d) => WD_SHORT[d]).join(', ')}`;
      }
      return n > 1 ? `A cada ${n} semanas` : 'Toda semana';
    case 'monthly':
      return n > 1 ? `A cada ${n} meses` : 'Todo mês';
    case 'yearly':
      return 'Todo ano';
    default:
      return '';
  }
}

export const REPEAT_OPTIONS = [
  { value: '', label: 'Não repete' },
  { value: 'daily', label: 'Todo dia' },
  { value: 'weekdays', label: 'Dias úteis (seg a sex)' },
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
      ];

export const reminderText = (min, hasTime) => {
  const o = reminderOptions(hasTime).find((x) => x.value === min);
  return o && min >= 0 ? o.label : '';
};

/** Momento (Date) em que o lembrete deve tocar. */
export function reminderAt(date, time, minutesBefore) {
  if (!date || minutesBefore < 0) return null;
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

export function viewMeta(view, data) {
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
    for (const [id, title] of BUCKETS) {
      const items = sortTasks(list.filter((t) => bucketOf(t, todayKey) === id));
      if (items.length) groups.push({ id, title, tasks: items, tone: id === 'overdue' ? 'danger' : undefined });
    }
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
  } else if (view === 'all') {
    for (const l of data.lists || []) {
      const items = sortTasks(undone.filter((t) => t.listId === l.id));
      if (items.length) groups.push({ id: `l:${l.id}`, title: l.name, tasks: items, color: l.color });
    }
    const known = new Set((data.lists || []).map((l) => l.id));
    const orphan = sortTasks(undone.filter((t) => !known.has(t.listId)));
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
    .filter((g) => !g.done)
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

/**
 * Lê uma frase como "Reunião amanhã às 15h #trabalho !1 ^Pessoal" e devolve os campos.
 * Tokens: datas (hoje, amanhã, segunda, dia 15, 15/11, em 3 dias, próxima semana), horas (15h, 9h30, 14:00),
 * prioridade (!1 alta, !2 média, !3 baixa, ou !alta), etiquetas (#tag), lista (^lista) e repetição (todo dia, toda segunda…).
 */
export function parseQuickAdd(text, todayK, lists = []) {
  const found = [];
  const res = { date: '', time: '', priority: null, tags: [], listId: null, repeat: '' };
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

  // Repetição (antes das datas para "toda segunda" não virar só "segunda")
  scan(`${PRE}(todo dia [úu]til|dias [úu]teis)${POST}`, 'repeat', () => {
    res.repeat = 'weekdays';
    return 'Dias úteis';
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

  if (res.repeat && !res.date) res.date = occurrences(res.repeat, todayK, todayK, keyOf(addDays(fromKey(todayK), 400)), 1)[0] || todayK;
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
  if (task.repeat && task.date) {
    const next = nextDate(task.repeat, task.date);
    const created = { ...task, id: newId('t'), repeat: '', done: true, completedAt: nowIso, reminder: -1 };
    const updated = { ...task, date: next, done: false, completedAt: null, checklist: (task.checklist || []).map((c) => ({ ...c, done: false })) };
    return { updated, created };
  }
  return { updated: { ...task, done: true, completedAt: nowIso }, created: null };
}

export const todayKeyNow = () => keyOf(todayDate());
