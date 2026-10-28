/*
 * Sincronização offline-first com o Supabase.
 *
 * - O aparelho sempre trabalha sobre o estado local (localStorage). Nada espera a rede.
 * - Cada alteração vira uma linha numa fila persistida (pending), enviada em lote por upsert.
 * - O servidor é a fonte da verdade: um "pull" reconstrói o estado a partir do banco e
 *   reaplica por cima o que ainda está na fila, então nada que o usuário fez se perde.
 * - Outros aparelhos ficam sabendo das mudanças pelo Realtime (INSERT/UPDATE do próprio
 *   usuário) e, como reforço, ao voltar para o app e ao reconectar.
 * - Hábitos excluídos são marcados (deleted = true) para que a exclusão também sincronize.
 */

const PENDING_KEY = 'ritmo.pending.v1';
const LINK_KEY = 'ritmo.linked-user';
const CHUNK = 500;

export const emptyPending = () => ({ habits: {}, checkins: {}, profile: null });

const nowIso = () => new Date().toISOString();

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
  updated_at: nowIso(),
});

export const fromHabitRow = (r) => ({
  id: r.id,
  name: r.name,
  icon: r.icon,
  color: r.color,
  period: r.period,
  days: (r.days || []).map(Number).sort((a, b) => a - b),
  target: Number(r.target) || 1,
  unit: r.unit || '',
  createdAt: String(r.created_on).slice(0, 10),
});

export const checkinRow = (userId, habitId, day, count) => ({
  user_id: userId,
  habit_id: habitId,
  day,
  count,
  updated_at: nowIso(),
});

/** Estado do app a partir do servidor + fila local por cima. Função pura (testada em test/sync.test.mjs). */
export function buildSnapshot(habitRows, checkinRows, profileRow, pending) {
  const byId = new Map();
  for (const r of habitRows) byId.set(r.id, r);
  for (const r of Object.values(pending.habits)) byId.set(r.id, r);
  const rows = [...byId.values()].sort((a, b) => (a.position ?? 0) - (b.position ?? 0) || a.id.localeCompare(b.id));
  const habits = rows.filter((r) => !r.deleted).map(fromHabitRow);
  const visible = new Set(habits.map((h) => h.id));

  const log = {};
  const put = (r) => {
    if (!visible.has(r.habit_id)) return;
    const day = String(r.day).slice(0, 10);
    const count = Number(r.count) || 0;
    if (count > 0) {
      (log[day] = log[day] || {})[r.habit_id] = count;
    } else if (log[day]) {
      delete log[day][r.habit_id];
      if (!Object.keys(log[day]).length) delete log[day];
    }
  };
  checkinRows.forEach(put);
  Object.values(pending.checkins).forEach(put);

  const name = pending.profile ? pending.profile.name : profileRow ? profileRow.name : null;
  return { habits, log, name };
}

/** Linhas para subir os dados deste aparelho para uma conta nova. */
export function uploadRows(data, userId) {
  const habits = {};
  data.habits.forEach((h, i) => {
    habits[h.id] = toHabitRow(h, userId, i);
  });
  const checkins = {};
  for (const [day, entries] of Object.entries(data.log)) {
    for (const [habitId, count] of Object.entries(entries)) {
      if (count > 0 && habits[habitId]) checkins[`${habitId}|${day}`] = checkinRow(userId, habitId, day, count);
    }
  }
  return { habits, checkins };
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
  const hasPending = () =>
    Object.keys(pending.habits).length > 0 || Object.keys(pending.checkins).length > 0 || !!pending.profile;

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
    const batch = { habits: { ...pending.habits }, checkins: { ...pending.checkins }, profile: pending.profile };
    try {
      await upsertChunks('habits', Object.values(batch.habits), 'user_id,id');
      try {
        await upsertChunks('checkins', Object.values(batch.checkins), 'user_id,habit_id,day');
      } catch (e) {
        // Check-in de um hábito que não existe no servidor: descarta em vez de travar a fila
        if (e && e.code === '23503') {
          for (const k of Object.keys(batch.checkins)) if (pending.checkins[k] === batch.checkins[k]) delete pending.checkins[k];
          batch.checkins = {};
        } else throw e;
      }
      if (batch.profile) {
        const { error } = await client.from('profiles').upsert(batch.profile, { onConflict: 'user_id' });
        if (error) throw error;
      }
      if (gen !== generation) return;
      // Remove só o que não mudou enquanto o envio acontecia
      for (const [k, r] of Object.entries(batch.habits)) if (pending.habits[k] === r) delete pending.habits[k];
      for (const [k, r] of Object.entries(batch.checkins)) if (pending.checkins[k] === r) delete pending.checkins[k];
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

  async function fetchAll() {
    const [h, p] = await Promise.all([
      client.from('habits').select('*'),
      client.from('profiles').select('*').maybeSingle(),
    ]);
    if (h.error) throw h.error;
    if (p.error) throw p.error;
    const checkins = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await client
        .from('checkins')
        .select('habit_id,day,count')
        .gt('count', 0)
        .order('day', { ascending: true })
        .order('habit_id', { ascending: true })
        .range(from, from + 999);
      if (error) throw error;
      checkins.push(...data);
      if (data.length < 1000) break;
    }
    return { habitRows: h.data || [], checkinRows: checkins, profileRow: p.data };
  }

  async function pull() {
    if (!userId) return;
    const gen = generation;
    if (!hasPending()) setStatus('syncing');
    try {
      const s = await fetchAll();
      if (gen !== generation) return;
      onSnapshot(buildSnapshot(s.habitRows, s.checkinRows, s.profileRow, pending));
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
    for (const table of ['habits', 'checkins', 'profiles']) {
      for (const event of ['INSERT', 'UPDATE']) {
        channel.on('postgres_changes', { event, schema: 'public', table, filter }, () => schedulePull(700));
      }
    }
    channel.subscribe();
  }

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
      if (!s.habitRows.length && !s.profileRow) {
        const up = uploadRows(localData, uid);
        pending.habits = { ...up.habits, ...pending.habits };
        pending.checkins = { ...up.checkins, ...pending.checkins };
        pending.profile = { user_id: uid, name: localData.name || '', updated_at: nowIso() };
        persist();
        result = 'uploaded';
        await flush();
      } else {
        onSnapshot(buildSnapshot(s.habitRows, s.checkinRows, s.profileRow, pending), { replaced: true });
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
    hasPending,
    queueHabit(h, position) {
      if (!userId) return;
      pending.habits[h.id] = toHabitRow(h, userId, position);
      persist();
      scheduleFlush();
    },
    queueCheckin(habitId, day, count) {
      if (!userId) return;
      pending.checkins[`${habitId}|${day}`] = checkinRow(userId, habitId, day, count);
      persist();
      scheduleFlush();
    },
    queueProfile(name) {
      if (!userId) return;
      pending.profile = { user_id: userId, name, updated_at: nowIso() };
      persist();
      scheduleFlush();
    },
    /** Apaga o histórico na conta. Precisa de conexão. */
    async resetHistory(habits, todayKey, name) {
      if (!userId) return;
      pending.checkins = {};
      habits.forEach((h, i) => {
        pending.habits[h.id] = toHabitRow({ ...h, createdAt: todayKey }, userId, i);
      });
      persist();
      const { error } = await client.from('checkins').delete().eq('user_id', userId);
      if (error) throw error;
      pending.profile = { user_id: userId, name, reset_at: nowIso(), updated_at: nowIso() };
      persist();
      await flush();
    },
  };
}
