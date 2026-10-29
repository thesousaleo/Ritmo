/* Foco: estado do Pomodoro/cronômetro (por aparelho) e estatísticas das sessões (sincronizadas). Sem UI. */
import { keyOf, addDays, todayDate } from './habits.js';

export const DEFAULT_FOCUS = { focus: 25, short: 5, long: 15, longEvery: 4, autoBreak: false };
export const focusSettings = (data) => ({ ...DEFAULT_FOCUS, ...((data.settings && data.settings.focus) || {}) });

export const PHASE_LABEL = { focus: 'Foco', short: 'Pausa curta', long: 'Pausa longa', stopwatch: 'Cronômetro' };

const STORE_KEY = 'ritmo.focus.v1';
export function loadFocusState() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}
export function saveFocusState(s) {
  try {
    if (s) localStorage.setItem(STORE_KEY, JSON.stringify(s));
    else localStorage.removeItem(STORE_KEY);
  } catch (e) {
    /* sem storage */
  }
}

/** Estado inicial (parado) de uma fase. */
export function idleState(phase, settings, prev = {}) {
  const mins = phase === 'stopwatch' ? 0 : settings[phase];
  return {
    phase,
    durationMs: mins * 60000,
    remainingMs: mins * 60000,
    elapsedMs: 0,
    endAt: null,
    runningSince: null,
    focusStartedAt: null,
    taskId: prev.taskId || null,
    habitId: prev.habitId || null,
    cycle: prev.cycle || 0,
  };
}

export const isRunning = (s) => !!(s && (s.endAt || s.runningSince));

export function remaining(s, now = Date.now()) {
  if (!s) return 0;
  if (s.phase === 'stopwatch') return 0;
  return s.endAt ? Math.max(0, s.endAt - now) : s.remainingMs;
}
export function elapsed(s, now = Date.now()) {
  if (!s) return 0;
  if (s.phase === 'stopwatch') return s.elapsedMs + (s.runningSince ? now - s.runningSince : 0);
  return s.durationMs - remaining(s, now);
}

export function start(s, now = Date.now()) {
  if (s.phase === 'stopwatch') return { ...s, runningSince: now, focusStartedAt: s.focusStartedAt || new Date(now).toISOString() };
  return {
    ...s,
    endAt: now + s.remainingMs,
    focusStartedAt: s.phase === 'focus' ? s.focusStartedAt || new Date(now).toISOString() : null,
  };
}
export function pause(s, now = Date.now()) {
  if (s.phase === 'stopwatch') return { ...s, elapsedMs: elapsed(s, now), runningSince: null };
  return { ...s, remainingMs: remaining(s, now), endAt: null };
}

/** Sessão a registrar quando o foco termina ou é interrompido (mínimo 1 minuto). */
export function sessionFrom(s, now = Date.now()) {
  if (!(s.phase === 'focus' || s.phase === 'stopwatch')) return null;
  const mins = Math.round(elapsed(s, now) / 60000);
  if (mins < 1) return null;
  return {
    startedAt: s.focusStartedAt || new Date(now - mins * 60000).toISOString(),
    minutes: Math.min(600, mins),
    kind: s.phase === 'stopwatch' ? 'stopwatch' : 'pomo',
    taskId: s.taskId || null,
    habitId: s.habitId || null,
  };
}

/** Próxima fase depois de terminar a atual. */
export function nextPhase(s, settings) {
  if (s.phase === 'focus') {
    const cycle = s.cycle + 1;
    const phase = cycle % settings.longEvery === 0 ? 'long' : 'short';
    return idleState(phase, settings, { ...s, cycle });
  }
  return idleState('focus', settings, s);
}

/* ---------- estatísticas ---------- */
const dayOf = (iso) => keyOf(new Date(iso));

export function focusStats(data, today = todayDate()) {
  const sessions = (data.focus || []).filter((f) => !f.deleted);
  const todayKey = keyOf(today);
  const todaySessions = sessions.filter((f) => dayOf(f.startedAt) === todayKey).sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  const week = [];
  for (let i = 6; i >= 0; i--) {
    const k = keyOf(addDays(today, -i));
    week.push({ key: k, minutes: sessions.filter((f) => dayOf(f.startedAt) === k).reduce((n, f) => n + f.minutes, 0) });
  }
  const byTask = new Map();
  for (const f of sessions) {
    if (dayOf(f.startedAt) < keyOf(addDays(today, -29))) continue;
    const k = f.taskId ? `t:${f.taskId}` : f.habitId ? `h:${f.habitId}` : 'none';
    byTask.set(k, (byTask.get(k) || 0) + f.minutes);
  }
  return {
    todayMinutes: todaySessions.reduce((n, f) => n + f.minutes, 0),
    todayPomos: todaySessions.filter((f) => f.kind === 'pomo').length,
    totalMinutes: sessions.reduce((n, f) => n + f.minutes, 0),
    totalPomos: sessions.filter((f) => f.kind === 'pomo').length,
    todaySessions,
    week,
    byTask: [...byTask.entries()].map(([k, minutes]) => ({ k, minutes })).sort((a, b) => b.minutes - a.minutes).slice(0, 6),
  };
}

export const fmtClock = (ms) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(sec).padStart(2, '0');
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
};
export const fmtMinutes = (m) => (m >= 60 ? `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}min` : ''}` : `${m}min`);
