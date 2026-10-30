import test from 'node:test';
import assert from 'node:assert/strict';
import { createSyncEngine } from '../src/lib/sync.js';

// Cliente falso: guarda as chamadas de apagar e responde vazio às leituras
function fakeClient() {
  const calls = [];
  const builder = (table) => {
    const q = { table, op: 'select', filters: [] };
    const api = {
      select: () => api,
      order: () => api,
      range: () => api,
      limit: () => api,
      upsert: (rows) => {
        calls.push({ table, op: 'upsert', rows });
        return Promise.resolve({ error: null });
      },
      insert: () => Promise.resolve({ error: null }),
      delete: () => {
        q.op = 'delete';
        return api;
      },
      eq: (c, v) => {
        q.filters.push(['eq', c, v]);
        return api;
      },
      in: (c, v) => {
        q.filters.push(['in', c, v]);
        return api;
      },
      maybeSingle: () => Promise.resolve({ data: null, error: null }),
      then: (res, rej) => {
        if (q.op === 'delete') calls.push({ table, op: 'delete', filters: q.filters });
        return Promise.resolve({ data: [], error: null }).then(res, rej);
      },
    };
    return api;
  };
  return {
    calls,
    from: builder,
    rpc: () => Promise.resolve({ data: [], error: null }),
    channel: () => ({ on() { return this; }, subscribe() { return this; } }),
    removeChannel() {},
  };
}

globalThis.localStorage = { _s: {}, getItem(k) { return this._s[k] ?? null; }, setItem(k, v) { this._s[k] = v; }, removeItem(k) { delete this._s[k]; } };

const blank = { habits: [], log: {}, notes: {}, moods: {}, lists: [], tasks: [], events: [], focus: [], name: '', breaks: [], settings: {} };

test('apagar exemplos na conta: filhos antes dos pais, só os ids pedidos', async () => {
  const client = fakeClient();
  const e = createSyncEngine({ client, onSnapshot() {}, onStatus() {} });
  await e.link('me', blank);
  client.calls.length = 0;
  await e.purge({ habits: ['agua'], tasks: ['ex-1', 'ex-2'], events: [], focus: ['ex-f'], lists: ['compras'], moods: ['2026-06-01'] });
  const del = client.calls.filter((c) => c.op === 'delete');
  assert.deepEqual(del.map((c) => c.table), ['tasks', 'focus_sessions', 'moods', 'habits', 'lists']);
  for (const c of del) assert.deepEqual(c.filters[0], ['eq', 'user_id', 'me']);
  assert.deepEqual(del.find((c) => c.table === 'moods').filters[1], ['in', 'day', ['2026-06-01']]);
  assert.deepEqual(del.find((c) => c.table === 'tasks').filters[1], ['in', 'id', ['ex-1', 'ex-2']]);
  e.unlink();
});

test('zerar a conta: apaga todas as tabelas do dono e regrava o perfil', async () => {
  const client = fakeClient();
  const e = createSyncEngine({ client, onSnapshot() {}, onStatus() {} });
  await e.link('me', blank);
  client.calls.length = 0;
  e.queueTask({ id: 't1', title: 'x', listId: 'inbox' });
  await e.wipe({ name: 'Leo', breaks: [], weeklyEmail: false, settings: {} });
  const del = client.calls.filter((c) => c.op === 'delete').map((c) => c.table);
  assert.deepEqual(del, ['checkins', 'moods', 'focus_sessions', 'tasks', 'events', 'habits', 'lists']);
  // A tarefa que estava na fila não sobe de novo; só o perfil
  const ups = client.calls.filter((c) => c.op === 'upsert').map((c) => c.table);
  assert.deepEqual(ups, ['profiles']);
  e.unlink();
});
