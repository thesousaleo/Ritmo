/*
 * Sincronização offline-first com o Supabase.
 *
 * - O aparelho sempre trabalha sobre o estado local (localStorage). Nada espera a rede.
 * - Cada alteração vira uma linha numa fila persistida (pending), enviada em lote por upsert.
 * - O servidor é a fonte da verdade: um "pull" reconstrói o estado a partir do banco e
 *   reaplica por cima o que ainda está na fila, então nada que o usuário fez se perde.
 * - Outros aparelhos ficam sabendo das mudanças pelo Realtime (INSERT/UPDATE do próprio
 *   usuário) e, como reforço, ao voltar para o app e ao reconectar.
 * - Exclusões são marcas (deleted = true): sincronizam e podem ser desfeitas.
 */

import { normalizeHabit } from './habits.js';
import { normalizeTask, normalizeList, normalizeEvent } from './tasks.js';

const PENDING_KEY = 'ritmo.pending.v1';
const LINK_KEY = 'ritmo.linked-user';
const CHUNK = 500;

const nowIso = () => new Date().toISOString();

/* ---------- linhas <-> objetos do app ---------- */
export const toHabitRow = (h, userId, position) => ({
  user_id: userId,
  id: h.id,
  name: h.name,
  icon: h.icon,
  color: h.color,
  period: h.period,
  days: [...h.days].sort((a, b) => a - b),
  target: h.target,
  unit: h.unit || '',
  created_on: h.createdAt,
  position,
  deleted: !!h.deleted,
  kind: h.kind || 'build',
  freq: h.freq || 'days',
  per_week: h.perWeek || 3,
  duration_min: h.duration || 0,
  reminder: h.reminder || null,
  archived: !!h.archived,
  updated_at: nowIso(),
});

export const fromHabitRow = (r) =>
  normalizeHabit({
    id: r.id,
    name: r.name,
    icon: r.icon,
    color: r.color,
    period: r.period,
    days: (r.days || []).map(Number).sort((a, b) => a - b),
    target: Number(r.target) || 1,
    unit: r.unit || '',
    createdAt: String(r.created_on).slice(0, 10),
    kind: r.kind || 'build',
    freq: r.freq || 'days',
    perWeek: Number(r.per_week) || 3,
    duration: Number(r.duration_min) || 0,
    reminder: r.reminder || '',
    archived: !!r.archived,
  });

export const checkinRow = (userId, habitId, day, count, note = '') => ({ user_id: userId, habit_id: habitId, day, count, note: note || '', updated_at: nowIso() });
export const moodRow = (userId, day, mood) => ({ user_id: userId, day, mood: mood || 0, updated_at: nowIso() });

export const profileRow = (userId, p) => ({
  user_id: userId,
  name: p.name || '',
  breaks: (p.breaks || []).map((b) => ({ id: b.id, start: b.start, end: b.end })),
  weekly_email: !!p.weeklyEmail,
  settings: p.settings || {},
  updated_at: nowIso(),
});

export const toListRow = (l, userId) => ({
  user_id: userId,
  id: l.id,
  name: l.name,
  color: l.color,
  icon: l.icon,
  position: l.position || 0,
  sections: (l.sections || []).map((s) => ({ id: s.id, name: s.name })),
  view: l.view === 'kanban' ? 'kanban' : 'list',
  deleted: !!l.deleted,
  updated_at: nowIso(),
});
export const fromListRow = (r) =>
  normalizeList({ id: r.id, name: r.name, color: r.color, icon: r.icon, position: Number(r.position) || 0, sections: Array.isArray(r.sections) ? r.sections : [], view: r.view });

export const toTaskRow = (t, userId) => ({
  user_id: userId,
  id: t.id,
  list_id: t.listId || 'inbox',
  title: (t.title || '').slice(0, 300) || 'Sem título',
  notes: t.notes || '',
  due_date: t.date || null,
  due_time: t.time || null,
  duration_min: t.duration || 0,
  priority: t.priority || 0,
  tags: t.tags || [],
  repeat: t.repeat || '',
  reminder: t.reminder ?? -1,
  checklist: (t.checklist || []).map((c) => ({ id: c.id, text: c.text, done: !!c.done })),
  section_id: t.sectionId || '',
  position: t.position || 0,
  done: !!t.done,
  completed_at: t.completedAt || null,
  created_at: t.createdAt || nowIso(),
  deleted: !!t.deleted,
  updated_at: nowIso(),
});
export const fromTaskRow = (r) =>
  normalizeTask({
    id: r.id,
    listId: r.list_id,
    title: r.title,
    notes: r.notes || '',
    date: r.due_date ? String(r.due_date).slice(0, 10) : '',
    time: r.due_time || '',
    duration: Number(r.duration_min) || 0,
    priority: Number(r.priority) || 0,
    tags: r.tags || [],
    repeat: r.repeat || '',
    reminder: r.reminder ?? -1,
    checklist: Array.isArray(r.checklist) ? r.checklist : [],
    sectionId: r.section_id || '',
    position: Number(r.position) || 0,
    done: !!r.done,
    completedAt: r.completed_at || null,
    createdAt: r.created_at,
  });

export const toEventRow = (e, userId) => ({
  user_id: userId,
  id: e.id,
  title: (e.title || '').slice(0, 200) || 'Evento',
  notes: e.notes || '',
  location: e.location || '',
  start_date: e.date,
  end_date: e.endDate && e.endDate >= e.date ? e.endDate : e.date,
  start_time: e.allDay ? null : e.start || null,
  end_time: e.allDay ? null : e.end || null,
  all_day: !!e.allDay,
  color: e.color || 'cobalt',
  repeat: e.repeat || '',
  reminder: e.reminder ?? -1,
  deleted: !!e.deleted,
  updated_at: nowIso(),
});
export const fromEventRow = (r) =>
  normalizeEvent({
    id: r.id,
    title: r.title,
    notes: r.notes || '',
    location: r.location || '',
    date: String(r.start_date).slice(0, 10),
    endDate: String(r.end_date).slice(0, 10),
    start: r.start_time || '',
    end: r.end_time || '',
    allDay: !!r.all_day,
    color: r.color,
    repeat: r.repeat || '',
    reminder: r.reminder ?? -1,
  });

export const toFocusRow = (f, userId) => ({
  user_id: userId,
  id: f.id,
  task_id: f.taskId || null,
  habit_id: f.habitId || null,
  started_at: f.startedAt,
  minutes: f.minutes,
  kind: f.kind || 'pomo',
  deleted: !!f.deleted,
  updated_at: nowIso(),
});
export const fromFocusRow = (r) => ({ id: r.id, taskId: r.task_id, habitId: r.habit_id, startedAt: r.started_at, minutes: Number(r.minutes), kind: r.kind });

/* ---------- tabelas ---------- */
// Ordem de envio: hábitos antes dos check-ins (chave estrangeira).
const TABLES = [
  { name: 'habits', conflict: 'user_id,id' },
  { name: 'lists', conflict: 'user_id,id' },
  { name: 'tasks', conflict: 'user_id,id' },
  { name: 'events', conflict: 'user_id,id' },
  { name: 'focus', table: 'focus_sessions', conflict: 'user_id,id' },
  { name: 'checkins', conflict: 'user_id,habit_id,day', fk: true },
  { name: 'moods', conflict: 'user_id,day' },
];
const tableOf = (name) => TABLES.find((t) => t.name === name);

export const emptyPending = () => ({ habits: {}, lists: {}, tasks: {}, events: {}, focus: {}, checkins: {}, moods: {}, profile: null });

/** Junta linhas do servidor com a fila local (a fila vence) e remove as excluídas. */
function merged(serverRows = [], pendingMap = {}) {
  const byId = new Map();
  for (const r of serverRows) byId.set(r.id, r);
  for (const r of Object.values(pendingMap)) byId.set(r.id, r);
  return [...byId.values()].filter((r) => !r.deleted);
}

/** Estado do app a partir do servidor + fila local por cima. Função pura (testada em test/sync.test.mjs). */
export function buildSnapshot(server, pending) {
  const { checkinRows = [], moodRows = [], profileRow: prof = null } = server;
  const habitRowsAll = new Map();
  for (const r of server.habitRows || []) habitRowsAll.set(r.id, r);
  for (const r of Object.values(pending.habits || {})) habitRowsAll.set(r.id, r);
  const rows = [...habitRowsAll.values()].sort((a, b) => (a.position ?? 0) - (b.position ?? 0) || a.id.localeCompare(b.id));
  const habits = rows.filter((r) => !r.deleted).map(fromHabitRow);
  const visible = new Set(habits.map((h) => h.id));

  const log = {};
  const notes = {};
  const put = (r) => {
    if (!visible.has(r.habit_id)) return;
    const day = String(r.day).slice(0, 10);
    const count = Number(r.count) || 0;
    const note = r.note || '';
    if (count > 0) (log[day] = log[day] || {})[r.habit_id] = count;
    else if (log[day]) {
      delete log[day][r.habit_id];
      if (!Object.keys(log[day]).length) delete log[day];
    }
    if (note) (notes[day] = notes[day] || {})[r.habit_id] = note;
    else if (notes[day]) {
      delete notes[day][r.habit_id];
      if (!Object.keys(notes[day]).length) delete notes[day];
    }
  };
  checkinRows.forEach(put);
  Object.values(pending.checkins || {}).forEach(put);

  const moods = {};
  const putMood = (r) => {
    const day = String(r.day).slice(0, 10);
    if (r.mood > 0) moods[day] = Number(r.mood);
    else delete moods[day];
  };
  moodRows.forEach(putMood);
  Object.values(pending.moods || {}).forEach(putMood);

  const lists = merged(server.listRows, pending.lists).map(fromListRow).sort((a, b) => a.position - b.position || a.id.localeCompare(b.id));
  const tasks = merged(server.taskRows, pending.tasks).map(fromTaskRow);
  const events = merged(server.eventRows, pending.events).map(fromEventRow);
  const focus = merged(server.focusRows, pending.focus).map(fromFocusRow);

  const p = pending.profile || prof;
  return {
    habits,
    log,
    notes,
    moods,
    lists,
    tasks,
    events,
    focus,
    name: p ? p.name : null,
    breaks: p && Array.isArray(p.breaks) ? p.breaks : null,
    weeklyEmail: p ? !!p.weekly_email : null,
    settings: p && p.settings && typeof p.settings === 'object' ? p.settings : null,
  };
}

/** Linhas para subir os dados deste aparelho para uma conta nova. */
export function uploadRows(data, userId) {
  const habits = {};
  data.habits.forEach((h, i) => {
    habits[h.id] = toHabitRow(h, userId, i);
  });
  const checkins = {};
  const days = new Set([...Object.keys(data.log || {}), ...Object.keys(data.notes || {})]);
  for (const day of days) {
    const ids = new Set([...Object.keys((data.log || {})[day] || {}), ...Object.keys((data.notes || {})[day] || {})]);
    for (const habitId of ids) {
      if (!habits[habitId]) continue;
      const count = ((data.log || {})[day] || {})[habitId] || 0;
      const note = ((data.notes || {})[day] || {})[habitId] || '';
      if (count > 0 || note) checkins[`${habitId}|${day}`] = checkinRow(userId, habitId, day, count, note);
    }
  }
  const moods = {};
  for (const [day, mood] of Object.entries(data.moods || {})) if (mood > 0) moods[day] = moodRow(userId, day, mood);
  const byId = (list, fn) => Object.fromEntries((list || []).map((x) => [x.id, fn(x, userId)]));
  return {
    habits,
    checkins,
    moods,
    lists: byId(data.lists, toListRow),
    tasks: byId(data.tasks, toTaskRow),
    events: byId(data.events, toEventRow),
    focus: byId(data.focus, toFocusRow),
  };
}

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (e) {
    return fallback;
  }
}
function write(key, value) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    /* sem storage: a fila vive só em memória */
  }
}

const isNetworkError = (e) => {
  const msg = (e && (e.message || String(e))) || '';
  return (typeof navigator !== 'undefined' && navigator.onLine === false) || /fetch|network|load failed|timeout/i.test(msg);
};

export function createSyncEngine({ client, onSnapshot, onStatus }) {
  let userId = null;
  let pending = { ...emptyPending(), ...read(PENDING_KEY, {}) };
  let channel = null;
  let flushTimer = null;
  let pullTimer = null;
  let retryTimer = null;
  let flushing = false;
  let generation = 0;
  let status = 'local';

  const setStatus = (s) => {
    status = s;
    onStatus(s);
  };
  const persist = () => write(PENDING_KEY, pending);
  const hasPending = () => TABLES.some((t) => Object.keys(pending[t.name] || {}).length > 0) || !!pending.profile;

  function scheduleFlush(delay = 400) {
    clearTimeout(flushTimer);
    flushTimer = setTimeout(flush, delay);
  }
  function schedulePull(delay = 600) {
    clearTimeout(pullTimer);
    pullTimer = setTimeout(pull, delay);
  }

  async function upsertChunks(table, rows, onConflict) {
    for (let i = 0; i < rows.length; i += CHUNK) {
      const { error } = await client.from(table).upsert(rows.slice(i, i + CHUNK), { onConflict });
      if (error) throw error;
    }
  }

  async function flush() {
    if (!userId || flushing || !hasPending()) {
      if (userId && !flushing && !hasPending() && status === 'syncing') setStatus('synced');
      return;
    }
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      setStatus('offline');
      return;
    }
    flushing = true;
    setStatus('syncing');
    const gen = generation;
    const batch = {};
    for (const t of TABLES) batch[t.name] = { ...(pending[t.name] || {}) };
    batch.profile = pending.profile;
    try {
      for (const t of TABLES) {
        const rows = Object.values(batch[t.name]);
        if (!rows.length) continue;
        try {
          await upsertChunks(t.table || t.name, rows, t.conflict);
        } catch (e) {
          // Check-in de um hábito que não existe no servidor: descarta em vez de travar a fila
          if (t.fk && e && e.code === '23503') {
            for (const k of Object.keys(batch[t.name])) if (pending[t.name][k] === batch[t.name][k]) delete pending[t.name][k];
            batch[t.name] = {};
          } else throw e;
        }
      }
      if (batch.profile) {
        const { error } = await client.from('profiles').upsert(batch.profile, { onConflict: 'user_id' });
        if (error) throw error;
      }
      if (gen !== generation) return;
      // Remove só o que não mudou enquanto o envio acontecia
      for (const t of TABLES) for (const [k, r] of Object.entries(batch[t.name])) if (pending[t.name][k] === r) delete pending[t.name][k];
      if (pending.profile === batch.profile) pending.profile = null;
      persist();
      if (hasPending()) scheduleFlush(50);
      else setStatus('synced');
    } catch (e) {
      if (gen !== generation) return;
      console.warn('[ritmo] envio falhou', e);
      setStatus(isNetworkError(e) ? 'offline' : 'error');
      clearTimeout(retryTimer);
      retryTimer = setTimeout(() => scheduleFlush(0), 15000);
    } finally {
      flushing = false;
    }
  }

  async function fetchPaged(table, columns, orderCols) {
    const rows = [];
    for (let from = 0; ; from += 1000) {
      let q = client.from(table).select(columns);
      for (const c of orderCols) q = q.order(c, { ascending: true });
      const { data, error } = await q.range(from, from + 999);
      if (error) throw error;
      rows.push(...data);
      if (data.length < 1000) break;
    }
    return rows;
  }

  async function fetchAll() {
    const [h, p] = await Promise.all([client.from('habits').select('*'), client.from('profiles').select('*').maybeSingle()]);
    if (h.error) throw h.error;
    if (p.error) throw p.error;
    const [checkinRows, moodRows, listRows, taskRows, eventRows, focusRows] = await Promise.all([
      fetchPaged('checkins', 'habit_id,day,count,note', ['day', 'habit_id']),
      fetchPaged('moods', 'day,mood', ['day']),
      fetchPaged('lists', '*', ['id']),
      fetchPaged('tasks', '*', ['id']),
      fetchPaged('events', '*', ['id']),
      fetchPaged('focus_sessions', '*', ['id']),
    ]);
    return { habitRows: h.data || [], checkinRows, moodRows, listRows, taskRows, eventRows, focusRows, profileRow: p.data };
  }

  async function pull() {
    if (!userId) return;
    const gen = generation;
    if (!hasPending()) setStatus('syncing');
    try {
      const s = await fetchAll();
      if (gen !== generation) return;
      onSnapshot(buildSnapshot(s, pending), { serverHasLists: s.listRows.length > 0 });
      if (!hasPending()) setStatus('synced');
      else scheduleFlush(0);
    } catch (e) {
      if (gen !== generation) return;
      console.warn('[ritmo] leitura falhou', e);
      setStatus(isNetworkError(e) ? 'offline' : 'error');
    }
  }

  function subscribe() {
    if (channel) client.removeChannel(channel);
    const filter = `user_id=eq.${userId}`;
    channel = client.channel(`ritmo-${userId}`);
    for (const table of ['habits', 'checkins', 'moods', 'profiles', 'lists', 'tasks', 'events', 'focus_sessions']) {
      for (const event of ['INSERT', 'UPDATE']) {
        channel.on('postgres_changes', { event, schema: 'public', table, filter }, () => schedulePull(700));
      }
    }
    channel.subscribe();
  }

  const queue = (name, key, row) => {
    if (!userId) return;
    pending[name][key] = row;
    persist();
    scheduleFlush();
  };

  /**
   * Liga o aparelho a uma conta. Conta nova (sem nada no servidor): sobe os dados deste aparelho.
   * Conta existente: o servidor substitui o que está aqui.
   */
  async function link(uid, localData) {
    generation++;
    const gen = generation;
    userId = uid;
    if (read(LINK_KEY, null) !== uid) {
      pending = emptyPending();
      persist();
      write(LINK_KEY, uid);
    }
    setStatus('syncing');
    let result = 'replaced';
    try {
      const s = await fetchAll();
      if (gen !== generation) return 'stale';
      if (!s.habitRows.length && !s.profileRow && !s.taskRows.length && !s.listRows.length) {
        const up = uploadRows(localData, uid);
        for (const t of TABLES) pending[t.name] = { ...(up[t.name] || {}), ...(pending[t.name] || {}) };
        pending.profile = profileRow(uid, localData);
        persist();
        result = 'uploaded';
        await flush();
      } else {
        onSnapshot(buildSnapshot(s, pending), { replaced: true, serverHasLists: s.listRows.length > 0 });
        if (hasPending()) scheduleFlush(0);
        else setStatus('synced');
      }
    } catch (e) {
      if (gen !== generation) return 'stale';
      console.warn('[ritmo] conexão inicial falhou', e);
      setStatus(isNetworkError(e) ? 'offline' : 'error');
      result = 'failed';
      clearTimeout(retryTimer);
      retryTimer = setTimeout(() => {
        if (userId === uid) link(uid, localData);
      }, 20000);
    }
    subscribe();
    return result;
  }

  function unlink() {
    generation++;
    userId = null;
    clearTimeout(flushTimer);
    clearTimeout(pullTimer);
    clearTimeout(retryTimer);
    if (channel) client.removeChannel(channel);
    channel = null;
    pending = emptyPending();
    persist();
    write(LINK_KEY, null);
    setStatus('local');
  }

  return {
    link,
    unlink,
    pull: () => schedulePull(0),
    flushNow: () => scheduleFlush(0),
    get status() {
      return status;
    },
    get linked() {
      return !!userId;
    },
    get userId() {
      return userId;
    },
    hasPending,
    queueHabit: (h, position) => queue('habits', h.id, toHabitRow(h, userId, position)),
    queueHabits(list) {
      if (!userId) return;
      list.forEach((h, i) => {
        pending.habits[h.id] = toHabitRow(h, userId, i);
      });
      persist();
      scheduleFlush();
    },
    queueCheckin: (habitId, day, count, note) => queue('checkins', `${habitId}|${day}`, checkinRow(userId, habitId, day, count, note)),
    queueMood: (day, mood) => queue('moods', day, moodRow(userId, day, mood)),
    queueProfile: (p) => {
      if (!userId) return;
      pending.profile = profileRow(userId, p);
      persist();
      scheduleFlush();
    },
    queueList: (l) => queue('lists', l.id, toListRow(l, userId)),
    queueTask: (t) => queue('tasks', t.id, toTaskRow(t, userId)),
    queueTasks(list) {
      if (!userId) return;
      for (const t of list) pending.tasks[t.id] = toTaskRow(t, userId);
      persist();
      scheduleFlush();
    },
    queueEvent: (e) => queue('events', e.id, toEventRow(e, userId)),
    queueFocus: (f) => queue('focus', f.id, toFocusRow(f, userId)),
    /** Apaga o histórico (check-ins, humor, foco, tarefas e eventos) na conta. Precisa de conexão. */
    async resetHistory(habits, todayKey, profile) {
      if (!userId) return;
      for (const k of ['checkins', 'moods', 'focus', 'tasks', 'events']) pending[k] = {};
      habits.forEach((h, i) => {
        pending.habits[h.id] = toHabitRow({ ...h, createdAt: todayKey }, userId, i);
      });
      persist();
      for (const table of ['checkins', 'moods', 'focus_sessions', 'tasks', 'events']) {
        const r = await client.from(table).delete().eq('user_id', userId);
        if (r.error) throw r.error;
      }
      pending.profile = profileRow(userId, profile);
      persist();
      await flush();
    },
  };
}

export { tableOf };
