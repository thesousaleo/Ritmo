/* Domínio do Ritmo: datas, regras de hábitos, sequências e dados de exemplo. Sem dependências de UI. */

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
];

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

export const fmtLong = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
export const fmtShort = new Intl.DateTimeFormat('pt-BR', { weekday: 'short', day: 'numeric', month: 'short' });
export const fmtMonth = new Intl.DateTimeFormat('pt-BR', { month: 'short' });

export function greetingFor(date) {
  const h = date.getHours();
  if (h < 12) return 'Bom dia';
  if (h < 18) return 'Boa tarde';
  return 'Boa noite';
}

/* ---------- regras ---------- */
export const isScheduled = (h, date) => keyOf(date) >= h.createdAt && h.days.includes(date.getDay());
export const countOf = (log, key, id) => (log[key] && log[key][id]) || 0;
export const isDone = (h, log, key) => countOf(log, key, h.id) >= h.target;

/** Sequência atual: dias programados seguidos concluídos. Hoje pendente não quebra. */
export function currentStreak(h, log, today) {
  let streak = 0;
  let d = today;
  for (let i = 0; i < 2000; i++) {
    const k = keyOf(d);
    if (k < h.createdAt) break;
    if (h.days.includes(d.getDay())) {
      if (isDone(h, log, k)) streak++;
      else if (i > 0) break;
    }
    d = addDays(d, -1);
  }
  return streak;
}

/** Maior sequência desde a criação do hábito. */
export function bestStreak(h, log, today) {
  let best = 0;
  let run = 0;
  const todayKey = keyOf(today);
  for (let d = fromKey(h.createdAt); d <= today; d = addDays(d, 1)) {
    if (!h.days.includes(d.getDay())) continue;
    const k = keyOf(d);
    if (isDone(h, log, k)) {
      run++;
      best = Math.max(best, run);
    } else if (k !== todayKey) {
      run = 0;
    }
  }
  return best;
}

/** Resumo de um dia: programados, concluídos, fração inteira e parcial. */
export function daySummary(habits, log, date) {
  const key = keyOf(date);
  const scheduled = habits.filter((h) => isScheduled(h, date));
  let done = 0;
  let partial = 0;
  for (const h of scheduled) {
    const c = countOf(log, key, h.id);
    if (c >= h.target) done++;
    partial += Math.min(c / h.target, 1);
  }
  return {
    total: scheduled.length,
    done,
    ratio: scheduled.length ? done / scheduled.length : null,
    partial: scheduled.length ? partial / scheduled.length : 0,
  };
}

export const newHabitId = () => 'h' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

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
    { id: 'meditar', name: 'Meditar', icon: 'Leaf', color: 'mint', period: 'morning', days: ALL_DAYS, target: 1, unit: '10 minutos', createdAt },
    { id: 'treino', name: 'Treino de força', icon: 'Dumbbell', color: 'amber', period: 'morning', days: [1, 3, 5], target: 1, unit: '45 minutos', createdAt },
    { id: 'caminhar', name: 'Caminhar', icon: 'Footprints', color: 'rose', period: 'afternoon', days: ALL_DAYS, target: 1, unit: '8 mil passos', createdAt },
    { id: 'ler', name: 'Ler', icon: 'BookOpen', color: 'violet', period: 'evening', days: ALL_DAYS, target: 1, unit: '20 páginas', createdAt },
  ];
  const prob = { agua: 0.8, meditar: 0.7, treino: 0.82, caminhar: 0.6, ler: 0.76 };
  const forcedRecent = { ler: 13, meditar: 8, treino: 5, agua: 4 };
  const rand = mulberry32(20261028);
  const log = {};

  for (let i = SPAN; i >= 1; i--) {
    const date = addDays(today, -i);
    const key = keyOf(date);
    const ramp = 0.72 + 0.28 * (1 - i / SPAN);
    for (const h of habits) {
      if (!h.days.includes(date.getDay())) continue;
      const forced = forcedRecent[h.id] && i <= forcedRecent[h.id] * (h.days.length === 7 ? 1 : 7 / h.days.length);
      const done = forced || rand() < prob[h.id] * ramp;
      if (done) {
        (log[key] = log[key] || {})[h.id] = h.target;
      } else if (h.target > 1) {
        const part = Math.floor(rand() * h.target * 0.75);
        if (part > 0) (log[key] = log[key] || {})[h.id] = part;
      }
    }
  }
  log[keyOf(today)] = { meditar: 1, agua: 3 };
  return { version: 2, name: '', habits, log, sample: true };
}

/* ---------- persistência local ---------- */
const STORAGE_KEY = 'ritmo.v2';
const LEGACY_KEY = 'ritmo.v1';

export function loadLocal() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY) || localStorage.getItem(LEGACY_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.habits) && parsed.log) return { name: '', ...parsed, version: 2 };
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
