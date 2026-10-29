/* Domínio do Ritmo: datas, regras de hábitos, sequências, estatísticas e dados de exemplo. Sem dependências de UI. */

export const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];
export const WEEKDAY_LETTER = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
export const WEEKDAY_SHORT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

export const PERIODS = [
  { id: 'morning', label: 'Manhã' },
  { id: 'afternoon', label: 'Tarde' },
  { id: 'evening', label: 'Noite' },
  { id: 'any', label: 'Qualquer horário' },
];
export const PERIOD_SHORT = { morning: 'Manhã', afternoon: 'Tarde', evening: 'Noite', any: 'Livre' };

export const COLORS = [
  { id: 'cobalt', name: 'Cobalto', value: '#4C6EF5', on: '#FFFFFF' },
  { id: 'mint', name: 'Menta', value: '#1FAA78', on: '#FFFFFF' },
  { id: 'amber', name: 'Âmbar', value: '#E39A2A', on: '#1B1408' },
  { id: 'rose', name: 'Rosa', value: '#E0507F', on: '#FFFFFF' },
  { id: 'violet', name: 'Violeta', value: '#8A6BEF', on: '#FFFFFF' },
  { id: 'sky', name: 'Céu', value: '#2A9FD6', on: '#FFFFFF' },
];
export const colorOf = (id) => COLORS.find((c) => c.id === id) || COLORS[0];

export const ICON_CHOICES = [
  'GlassWater', 'Leaf', 'Dumbbell', 'Footprints', 'BookOpen', 'Moon',
  'Sun', 'Coffee', 'Apple', 'Bike', 'Brain', 'Heart',
  'Music', 'PenLine', 'Sprout', 'Bed', 'Salad', 'Wallet',
  'Smartphone', 'Cigarette', 'Wine', 'Candy', 'Tv', 'ShieldCheck',
];

export const MOODS = [
  { value: 1, label: 'Muito ruim', icon: 'Angry' },
  { value: 2, label: 'Ruim', icon: 'Frown' },
  { value: 3, label: 'Neutro', icon: 'Meh' },
  { value: 4, label: 'Bom', icon: 'Smile' },
  { value: 5, label: 'Ótimo', icon: 'Laugh' },
];

export const MILESTONES_DAYS = [7, 30, 100, 365];
export const MILESTONES_WEEKS = [4, 12, 26, 52];

/* ---------- datas locais, chave YYYY-MM-DD ---------- */
const pad = (n) => String(n).padStart(2, '0');
export const keyOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const fromKey = (k) => {
  const [y, m, d] = k.split('-').map(Number);
  return new Date(y, m - 1, d);
};
export const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
export const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
export const todayDate = () => startOfDay(new Date());
export const weekStart = (d) => addDays(d, -d.getDay());

export const fmtLong = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
export const fmtShort = new Intl.DateTimeFormat('pt-BR', { weekday: 'short', day: 'numeric', month: 'short' });
export const fmtDayMonth = new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'short' });
export const fmtMonth = new Intl.DateTimeFormat('pt-BR', { month: 'short' });
export const shortDate = (k) => fmtDayMonth.format(fromKey(k)).replace(/\./g, '');

export function greetingFor(date) {
  const h = date.getHours();
  if (h < 12) return 'Bom dia';
  if (h < 18) return 'Boa tarde';
  return 'Boa noite';
}

/* ---------- normalização (dados antigos ganham os campos novos) ---------- */
export function normalizeHabit(h) {
  const out = {
    kind: 'build',
    freq: 'days',
    perWeek: 3,
    duration: 0,
    reminder: '',
    archived: false,
    minimum: '',
    unit: '',
    target: 1,
    period: 'any',
    ...h,
  };
  out.days = Array.isArray(out.days) && out.days.length ? out.days : ALL_DAYS;
  if (out.kind === 'avoid' || out.duration > 0) out.target = 1;
  return out;
}

export function normalizeData(d) {
  return {
    version: 3,
    name: '',
    sample: false,
    notes: {},
    moods: {},
    breaks: [],
    weeklyEmail: false,
    ...d,
    habits: (d.habits || []).map(normalizeHabit),
    log: d.log || {},
    minimal: d.minimal || {},
    days: d.days || {},
  };
}

/* ---------- regras ---------- */
export const isWeekly = (h) => h.freq === 'weekly';
export const isAvoid = (h) => h.kind === 'avoid';
export const activeHabits = (data) => data.habits.filter((h) => !h.archived);
export const countOf = (log, key, id) => (log[key] && log[key][id]) || 0;
export const isDone = (h, log, key) => countOf(log, key, h.id) >= h.target;
export const noteOf = (data, key, id) => (data.notes && data.notes[key] && data.notes[key][id]) || '';

/**
 * Pausas: sem habitIds valem para todos os hábitos (férias); com habitIds, só para aqueles (modo viagem por hábito).
 * Sem hábito informado, só as pausas gerais contam.
 */
export const breakOn = (data, key, h) =>
  (data.breaks || []).find((b) => key >= b.start && key <= b.end && (!b.habitIds || !b.habitIds.length || (h && b.habitIds.includes(h.id)))) || null;
export const inBreak = (data, key, h) => !!breakOn(data, key, h);
/** Dia difícil: o dia não cobra nada e não quebra sequências. */
export const isHardDay = (data, key) => !!(data.days && data.days[key] && data.days[key].hard);
const skipDay = (data, key, h) => inBreak(data, key, h) || isHardDay(data, key);
export const isMinimal = (data, key, id) => !!(data.minimal && data.minimal[key] && data.minimal[key][id]);
const weekHasBreak = (data, ws, h) => {
  for (let i = 0; i < 7; i++) if (inBreak(data, keyOf(addDays(ws, i)), h)) return true;
  return false;
};

/** O hábito aparece na lista deste dia. Semanais aparecem todos os dias. */
export function isListed(h, date) {
  if (h.archived || keyOf(date) < h.createdAt) return false;
  return isWeekly(h) || h.days.includes(date.getDay());
}

/** O dia conta como obrigatório (anel, mapa, sequência). Semanais e dias de pausa não contam. */
export function isScheduled(h, date, data) {
  return isListed(h, date) && !isWeekly(h) && !skipDay(data, keyOf(date), h);
}

/** Quantas vezes o hábito semanal foi cumprido na semana que começa em ws. */
export function weekCount(h, log, ws) {
  let n = 0;
  for (let i = 0; i < 7; i++) if (isDone(h, log, keyOf(addDays(ws, i)))) n++;
  return n;
}

export const streakUnit = (h, n) => (isWeekly(h) ? (n === 1 ? 'semana' : 'semanas') : n === 1 ? 'dia' : 'dias');
export const streakShort = (h) => (isWeekly(h) ? 'sem' : 'd');
export const milestonesOf = (h) => (isWeekly(h) ? MILESTONES_WEEKS : MILESTONES_DAYS);

/** Sequência atual. Diários: dias programados seguidos (hoje pendente não quebra, pausas são puladas).
 *  Semanais: semanas seguidas com a meta cumprida (semana atual em andamento não quebra). */
export function currentStreak(h, data, today) {
  const { log } = data;
  let streak = 0;
  if (isWeekly(h)) {
    const created = weekStart(fromKey(h.createdAt));
    let ws = weekStart(today);
    for (let i = 0; i < 520 && ws >= created; i++, ws = addDays(ws, -7)) {
      if (weekHasBreak(data, ws, h)) continue;
      if (weekCount(h, log, ws) >= h.perWeek) streak++;
      else if (i > 0) break;
    }
    return streak;
  }
  let d = today;
  for (let i = 0; i < 3000; i++, d = addDays(d, -1)) {
    const k = keyOf(d);
    if (k < h.createdAt) break;
    if (!h.days.includes(d.getDay())) continue;
    if (isDone(h, log, k)) streak++;
    else if (skipDay(data, k, h)) continue;
    else if (i > 0) break;
  }
  return streak;
}

/** Maior sequência desde a criação do hábito. */
export function bestStreak(h, data, today) {
  const { log } = data;
  let best = 0;
  let run = 0;
  if (isWeekly(h)) {
    const current = weekStart(today);
    for (let ws = weekStart(fromKey(h.createdAt)); ws <= current; ws = addDays(ws, 7)) {
      if (weekHasBreak(data, ws, h)) continue;
      if (weekCount(h, log, ws) >= h.perWeek) best = Math.max(best, ++run);
      else if (ws < current) run = 0;
    }
    return best;
  }
  const todayKey = keyOf(today);
  for (let d = fromKey(h.createdAt); d <= today; d = addDays(d, 1)) {
    const k = keyOf(d);
    if (!h.days.includes(d.getDay())) continue;
    if (isDone(h, log, k)) best = Math.max(best, ++run);
    else if (skipDay(data, k, h)) continue;
    else if (k !== todayKey) run = 0;
  }
  return best;
}

/** Resumo de um dia. Semanais só entram quando cumpridos naquele dia (somam, nunca cobram). */
export function daySummary(data, date) {
  const key = keyOf(date);
  let total = 0;
  let done = 0;
  let partial = 0;
  const paused = inBreak(data, key);
  const hard = isHardDay(data, key);
  for (const h of data.habits) {
    if (!isListed(h, date) || paused || inBreak(data, key, h)) continue;
    const c = countOf(data.log, key, h.id);
    if (isWeekly(h)) {
      if (c >= h.target) {
        total++;
        done++;
        partial++;
      }
      continue;
    }
    if (hard && c < h.target) continue; // dia difícil: o que não foi feito não cobra
    total++;
    if (c >= h.target) done++;
    partial += Math.min(c / h.target, 1);
  }
  return { total, done, ratio: total ? done / total : null, partial: total ? partial / total : 0, paused, hard };
}

/** Taxa de conclusão recente: diários nos últimos 30 dias; semanais nas últimas 4 semanas. */
export function habitRate(h, data, today) {
  let done = 0;
  let total = 0;
  if (isWeekly(h)) {
    const current = weekStart(today);
    const created = weekStart(fromKey(h.createdAt));
    for (let i = 0; i < 5; i++) {
      const ws = addDays(current, -7 * i);
      if (ws < created || weekHasBreak(data, ws, h)) continue;
      const complete = weekCount(h, data.log, ws) >= h.perWeek;
      if (i === 0 && !complete) continue;
      total++;
      if (complete) done++;
      if (total === 4) break;
    }
  } else {
    for (let i = 0; i < 30; i++) {
      const d = addDays(today, -i);
      if (!isScheduled(h, d, data)) continue;
      const ok = isDone(h, data.log, keyOf(d));
      if (i === 0 && !ok) continue;
      total++;
      if (ok) done++;
    }
  }
  return { rate: total ? done / total : 0, done, total };
}

export function totalCompletions(h, data) {
  let n = 0;
  for (const day of Object.keys(data.log)) if (isDone(h, data.log, day)) n++;
  return n;
}

/** Taxa por dia da semana (últimas `weeks` semanas). null onde não há dias programados. */
export function weekdayRates(h, data, today, weeks = 12) {
  const done = Array(7).fill(0);
  const total = Array(7).fill(0);
  for (let i = 1; i <= weeks * 7; i++) {
    const d = addDays(today, -i);
    const k = keyOf(d);
    if (k < h.createdAt) break;
    if (inBreak(data, k, h)) continue;
    if (isWeekly(h)) {
      total[d.getDay()]++;
      if (isDone(h, data.log, k)) done[d.getDay()]++;
    } else if (isScheduled(h, d, data)) {
      total[d.getDay()]++;
      if (isDone(h, data.log, k)) done[d.getDay()]++;
    }
  }
  return done.map((n, i) => (total[i] ? n / total[i] : null));
}

/** Estado de cada dia do hábito para o mapa individual. */
export function habitDayState(h, data, date, todayKey) {
  const k = keyOf(date);
  if (k > todayKey) return 'future';
  if (k < h.createdAt) return 'before';
  if (isDone(h, data.log, k)) return isMinimal(data, k, h.id) ? 'minimal' : 'done';
  if (inBreak(data, k, h)) return 'break';
  if (isHardDay(data, k) && isListed(h, date) && !isWeekly(h) && k !== todayKey) return 'rest';
  if (!isListed(h, date) || isWeekly(h)) return 'off';
  if (k === todayKey) return 'today';
  return countOf(data.log, k, h.id) > 0 ? 'partial' : 'miss';
}

/** Humor médio nos dias em que o hábito foi feito vs. não feito (últimos 120 dias). */
export function moodInsights(data, today) {
  const out = [];
  for (const h of activeHabits(data)) {
    const withM = [];
    const withoutM = [];
    for (let i = 0; i < 120; i++) {
      const d = addDays(today, -i);
      const k = keyOf(d);
      const m = data.moods && data.moods[k];
      if (!m) continue;
      if (isDone(h, data.log, k)) withM.push(m);
      else if (isScheduled(h, d, data) || (isWeekly(h) && isListed(h, d))) withoutM.push(m);
    }
    if (withM.length >= 3 && withoutM.length >= 3) {
      const avg = (a) => a.reduce((s, v) => s + v, 0) / a.length;
      const a = avg(withM);
      const b = avg(withoutM);
      out.push({ h, withAvg: a, withoutAvg: b, diff: a - b, n: withM.length + withoutM.length });
    }
  }
  return out.sort((x, y) => Math.abs(y.diff) - Math.abs(x.diff));
}

/** Marcos atingidos por hábito, a partir da maior sequência. */
export function milestoneGallery(data, today) {
  return activeHabits(data).map((h) => {
    const best = bestStreak(h, data, today);
    return { h, best, marks: milestonesOf(h).map((v) => ({ value: v, reached: best >= v })) };
  });
}

/** Texto curto da frequência: "Todos os dias", "Seg, Qua, Sex", "3× por semana". */
export function frequencyText(h) {
  if (isWeekly(h)) return `${h.perWeek}× por semana`;
  if (h.days.length === 7) return 'Todos os dias';
  if (h.days.length === 5 && [1, 2, 3, 4, 5].every((d) => h.days.includes(d))) return 'Dias úteis';
  return h.days.map((d) => WEEKDAY_SHORT[d]).join(', ');
}

export const newHabitId = () => 'h' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
export const newBreakId = () => 'b' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);

/* ---------- exportação ---------- */
const csvCell = (v) => {
  const s = v === null || v === undefined ? '' : String(v);
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** CSV com ponto e vírgula (abre direto no Excel em português). */
export function exportCsv(data) {
  const rows = [['data', 'hábito', 'tipo', 'contagem', 'meta', 'concluído', 'nota', 'humor do dia']];
  const byId = new Map(data.habits.map((h) => [h.id, h]));
  const days = new Set([...Object.keys(data.log), ...Object.keys(data.notes || {}), ...Object.keys(data.moods || {})]);
  for (const day of [...days].sort()) {
    const mood = (data.moods && data.moods[day]) || '';
    const ids = new Set([...Object.keys(data.log[day] || {}), ...Object.keys((data.notes || {})[day] || {})]);
    if (!ids.size) rows.push([day, '', '', '', '', '', '', mood]);
    for (const id of ids) {
      const h = byId.get(id);
      if (!h) continue;
      const c = countOf(data.log, day, id);
      rows.push([day, h.name, isAvoid(h) ? 'evitar' : 'construir', c, h.target, c >= h.target ? 'sim' : 'não', noteOf(data, day, id), mood]);
    }
  }
  return '﻿' + rows.map((r) => r.map(csvCell).join(';')).join('\r\n');
}

/* ---------- dados de exemplo (determinísticos) ---------- */
function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function buildSeed(today = todayDate()) {
  const SPAN = 130;
  const createdAt = keyOf(addDays(today, -SPAN));
  const habits = [
    { id: 'agua', name: 'Beber água', icon: 'GlassWater', color: 'sky', period: 'any', days: ALL_DAYS, target: 8, unit: 'copos', createdAt },
    { id: 'meditar', name: 'Meditar', icon: 'Leaf', color: 'mint', period: 'morning', days: ALL_DAYS, target: 1, unit: '10 minutos', duration: 10, reminder: '07:00', createdAt },
    { id: 'treino', name: 'Treino de força', icon: 'Dumbbell', color: 'amber', period: 'morning', days: [1, 3, 5], target: 1, unit: '45 minutos', createdAt },
    { id: 'caminhar', name: 'Caminhar', icon: 'Footprints', color: 'rose', period: 'afternoon', freq: 'weekly', perWeek: 4, days: ALL_DAYS, target: 1, unit: '8 mil passos', createdAt },
    { id: 'ler', name: 'Ler', icon: 'BookOpen', color: 'violet', period: 'evening', days: ALL_DAYS, target: 1, unit: '20 páginas', reminder: '21:30', createdAt },
    { id: 'tela', name: 'Sem celular depois das 23h', icon: 'Smartphone', color: 'cobalt', period: 'evening', kind: 'avoid', days: ALL_DAYS, target: 1, unit: '', createdAt },
  ].map(normalizeHabit);
  const prob = { agua: 0.8, meditar: 0.7, treino: 0.82, caminhar: 0.58, ler: 0.76, tela: 0.66 };
  const forcedRecent = { ler: 13, meditar: 8, treino: 5, agua: 4, tela: 6 };
  const rand = mulberry32(20261028);
  const log = {};
  const moods = {};
  const notes = {};
  const readingNotes = ['Terminei o capítulo 4', 'Li no ônibus', 'Releitura das anotações', 'Comecei um livro novo'];

  for (let i = SPAN; i >= 1; i--) {
    const date = addDays(today, -i);
    const key = keyOf(date);
    const ramp = 0.72 + 0.28 * (1 - i / SPAN);
    let good = 0;
    for (const h of habits) {
      if (!isWeekly(h) && !h.days.includes(date.getDay())) continue;
      const forced = forcedRecent[h.id] && i <= forcedRecent[h.id] * (h.days.length === 7 ? 1 : 7 / h.days.length);
      const done = forced || rand() < prob[h.id] * ramp;
      if (done) {
        (log[key] = log[key] || {})[h.id] = h.target;
        if (h.id === 'treino' || h.id === 'meditar') good++;
      } else if (h.target > 1) {
        const part = Math.floor(rand() * h.target * 0.75);
        if (part > 0) (log[key] = log[key] || {})[h.id] = part;
      }
    }
    if (i <= 75 && rand() < 0.8) moods[key] = Math.max(1, Math.min(5, Math.round(2.4 + good * 0.9 + rand() * 1.4)));
    if (log[key] && log[key].ler && i <= 40 && rand() < 0.2) {
      (notes[key] = notes[key] || {}).ler = readingNotes[Math.floor(rand() * readingNotes.length)];
    }
  }
  log[keyOf(today)] = { meditar: 1, agua: 3 };
  return normalizeData({ version: 3, name: '', habits, log, notes, moods, breaks: [], weeklyEmail: false, sample: true });
}

/* ---------- persistência local ---------- */
const STORAGE_KEY = 'ritmo.v2';
const LEGACY_KEY = 'ritmo.v1';

export function loadLocal() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY) || localStorage.getItem(LEGACY_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.habits) && parsed.log) return normalizeData(parsed);
    }
  } catch (e) {
    /* storage indisponível */
  }
  return buildSeed();
}

export function saveLocal(data) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (e) {
    /* modo privado ou storage cheio */
  }
}
