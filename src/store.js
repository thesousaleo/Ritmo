/* Estado e ações do Ritmo: dados locais + sincronização + hábitos, tarefas, listas, agenda e foco. */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  countOf, keyOf, addDays, newHabitId, newBreakId, todayDate, normalizeHabit, currentStreak, milestonesOf, exportCsv, noteOf,
} from './lib/habits.js';
import { normalizeAll, buildFullSeed, loadLocal, saveLocal } from './lib/data.js';
import { normalizeTask, normalizeList, normalizeEvent, completeTask, newId, INBOX_ID } from './lib/tasks.js';
import * as F from './lib/focus.js';
import { supabase } from './lib/supabase.js';
import { createSyncEngine } from './lib/sync.js';
import { syncReminders, scheduleTimerDone, cancelTimerDone, scheduleFocusEnd, cancelFocusEnd, saveTextFile } from './lib/native.js';

const TIMER_KEY = 'ritmo.timer';

export function haptic(ms) {
  try {
    if (navigator.vibrate) navigator.vibrate(ms);
  } catch (e) {
    /* iOS Safari não expõe vibração */
  }
}

function loadJson(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}
function saveJson(key, v) {
  try {
    if (v) localStorage.setItem(key, JSON.stringify(v));
    else localStorage.removeItem(key);
  } catch (e) {
    /* sem storage */
  }
}

export function useRitmoStore() {
  const [data, setData] = useState(loadLocal);
  const dataRef = useRef(data);
  const [today, setToday] = useState(todayDate);
  const [user, setUser] = useState(null);
  const [recovery, setRecovery] = useState(false);
  const [syncStatus, setSyncStatus] = useState('local');
  const [toast, setToast] = useState(null);
  const [celebration, setCelebration] = useState(null);
  const [timer, setTimer] = useState(() => loadJson(TIMER_KEY));
  const [focus, setFocusState] = useState(() => F.loadFocusState() || F.idleState('focus', F.focusSettings(dataRef.current)));
  const focusRef = useRef(focus);

  /** Toda alteração passa por aqui: a ref muda na hora (toques rápidos leem o valor certo). */
  const commit = useCallback((next) => {
    dataRef.current = next;
    setData(next);
  }, []);
  const setFocus = useCallback((s) => {
    focusRef.current = s;
    setFocusState(s);
  }, []);

  useEffect(() => saveLocal(data), [data]);
  useEffect(() => saveJson(TIMER_KEY, timer), [timer]);
  useEffect(() => F.saveFocusState(focus), [focus]);

  /* ---------- avisos e desfazer ---------- */
  const undoRef = useRef(null);
  const showToast = useCallback((text, undo) => {
    undoRef.current = undo || null;
    setToast({ id: Date.now() + Math.random(), text, actionLabel: undo ? 'Desfazer' : null });
  }, []);
  const dismissToast = useCallback(() => setToast(null), []);
  const runUndo = useCallback(() => {
    const fn = undoRef.current;
    undoRef.current = null;
    setToast(null);
    if (fn) fn();
  }, []);
  const dismissCelebration = useCallback(() => setCelebration(null), []);

  /* ---------- sincronização ---------- */
  const profileOf = (d) => ({ name: d.name || '', breaks: d.breaks || [], weeklyEmail: !!d.weeklyEmail, settings: d.settings || {} });
  const engineRef = useRef(null);
  const engine = useMemo(() => {
    const e = createSyncEngine({
      client: supabase,
      onStatus: setSyncStatus,
      onSnapshot: (snap, opts = {}) => {
        const prev = dataRef.current;
        const next = normalizeAll({
          ...prev,
          habits: snap.habits,
          log: snap.log,
          notes: snap.notes,
          moods: snap.moods,
          lists: snap.lists,
          tasks: snap.tasks,
          events: snap.events,
          focus: snap.focus,
          name: snap.name ?? prev.name,
          breaks: snap.breaks ?? prev.breaks,
          weeklyEmail: snap.weeklyEmail ?? prev.weeklyEmail,
          settings: snap.settings ?? prev.settings,
          sample: opts.replaced ? false : prev.sample,
        });
        commit(next);
        // Conta antiga (só hábitos): cria as listas padrão também no servidor
        if (!opts.serverHasLists && engineRef.current) next.lists.forEach((l) => engineRef.current.queueList(l));
      },
    });
    engineRef.current = e;
    return e;
  }, [commit]);

  const userIdRef = useRef(null);
  useEffect(() => {
    const handleUser = (u) => {
      const id = u ? u.id : null;
      setUser(u);
      if (id === userIdRef.current) return;
      const had = userIdRef.current;
      userIdRef.current = id;
      if (id) engine.link(id, dataRef.current);
      else if (had) {
        engine.unlink();
        commit(buildFullSeed());
      }
    };
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') setRecovery(true);
      // Fora do callback: chamadas ao Supabase dentro dele podem travar o cliente
      setTimeout(() => handleUser(session ? session.user : null), 0);
    });
    return () => sub.subscription.unsubscribe();
  }, [engine, commit]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible' && engine.linked) engine.pull();
    };
    const onOnline = () => {
      if (engine.linked) {
        engine.flushNow();
        engine.pull();
      }
    };
    const onOffline = () => {
      if (engine.linked) setSyncStatus('offline');
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, [engine]);

  /* ---------- virada do dia ---------- */
  useEffect(() => {
    const tick = () => {
      const t = todayDate();
      if (keyOf(t) !== keyOf(today)) setToday(t);
    };
    const id = setInterval(tick, 60000);
    document.addEventListener('visibilitychange', tick);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [today]);

  /* ---------- lembretes (hábitos, tarefas e eventos) ---------- */
  const reminderSig = JSON.stringify([
    data.habits.map((h) => [h.id, h.name, h.reminder, h.days, h.freq, h.archived, h.kind, h.unit]),
    data.breaks,
    (data.tasks || []).filter((t) => t.reminder >= 0 && !t.done && t.date).map((t) => [t.id, t.title, t.date, t.time, t.reminder]),
    (data.events || []).filter((e) => e.reminder >= 0).map((e) => [e.id, e.title, e.date, e.start, e.allDay, e.repeat, e.reminder, e.location]),
    keyOf(today),
  ]);
  useEffect(() => {
    const id = setTimeout(() => syncReminders(dataRef.current), 800);
    return () => clearTimeout(id);
  }, [reminderSig]);

  const updateProfile = useCallback(
    (patch) => {
      const nd = { ...dataRef.current, ...patch };
      commit(nd);
      engine.queueProfile(profileOf(nd));
      return nd;
    },
    [commit, engine]
  );

  /* =================================================================== */
  /* Hábitos                                                             */
  /* =================================================================== */
  const setCount = useCallback(
    (h, day, next) => {
      const d = dataRef.current;
      const before = currentStreak(h, d, todayDate());
      const dayLog = { ...(d.log[day] || {}) };
      if (next === 0) delete dayLog[h.id];
      else dayLog[h.id] = next;
      const nd = { ...d, log: { ...d.log, [day]: dayLog } };
      commit(nd);
      engine.queueCheckin(h.id, day, next, noteOf(nd, day, h.id));
      if (next >= h.target) {
        const after = currentStreak(h, nd, todayDate());
        if (after > before && milestonesOf(h).includes(after)) {
          setTimeout(() => setCelebration({ habit: h, value: after }), 420);
          haptic([12, 60, 20]);
        } else haptic(14);
      } else haptic(6);
    },
    [commit, engine]
  );

  const completeTimer = useCallback(
    (t) => {
      const h = dataRef.current.habits.find((x) => x.id === t.habitId);
      setTimer(null);
      cancelTimerDone();
      if (h && countOf(dataRef.current.log, t.day, h.id) < h.target) setCount(h, t.day, h.target);
    },
    [setCount]
  );

  useEffect(() => {
    if (!timer || !timer.endAt) return undefined;
    const check = () => {
      if (Date.now() >= timer.endAt) completeTimer(timer);
    };
    check();
    const id = setInterval(check, 500);
    document.addEventListener('visibilitychange', check);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', check);
    };
  }, [timer, completeTimer]);

  const habits = {
    setCount,
    /** Toque no círculo do hábito. Devolve 'timer' quando abre o temporizador. */
    toggle(h, day) {
      const d = dataRef.current;
      const c = countOf(d.log, day, h.id);
      if (c < h.target && h.duration > 0) {
        if (!(timer && timer.habitId === h.id && timer.day === day)) {
          const ms = h.duration * 60000;
          const t = { habitId: h.id, day, durationMs: ms, remainingMs: ms, endAt: Date.now() + ms };
          if (timer) cancelTimerDone();
          setTimer(t);
          scheduleTimerDone(h.name, t.endAt);
          haptic(8);
        }
        return 'timer';
      }
      const next = c >= h.target ? 0 : c + 1;
      setCount(h, day, next);
      if (next === 0 && h.target > 1) showToast(`${h.name}: contador zerado`, () => setCount(h, day, c));
      return 'count';
    },
    timer,
    pauseTimer() {
      setTimer((t) => t && { ...t, remainingMs: Math.max(0, t.endAt - Date.now()), endAt: null });
      cancelTimerDone();
    },
    resumeTimer(name) {
      setTimer((t) => {
        if (!t) return t;
        const endAt = Date.now() + t.remainingMs;
        scheduleTimerDone(name, endAt);
        return { ...t, endAt };
      });
    },
    cancelTimer() {
      setTimer(null);
      cancelTimerDone();
    },
    finishTimer: () => timer && completeTimer(timer),
    save(habit) {
      const d = dataRef.current;
      let saved = normalizeHabit(habit);
      let list;
      if (habit.id) list = d.habits.map((h) => (h.id === habit.id ? saved : h));
      else {
        saved = { ...saved, id: newHabitId(), createdAt: keyOf(todayDate()) };
        list = [...d.habits, saved];
      }
      const nd = { ...d, habits: list };
      commit(nd);
      engine.queueHabit(saved, list.findIndex((x) => x.id === saved.id));
      if (saved.reminder) syncReminders(nd, { ask: true });
      showToast(habit.id ? 'Alterações salvas' : `“${saved.name}” criado`);
    },
    remove(id) {
      const d = dataRef.current;
      const index = d.habits.findIndex((h) => h.id === id);
      const target = d.habits[index];
      if (!target) return;
      const log = {};
      for (const [k, v] of Object.entries(d.log)) {
        const rest = { ...v };
        delete rest[id];
        if (Object.keys(rest).length) log[k] = rest;
      }
      commit({ ...d, habits: d.habits.filter((h) => h.id !== id), log });
      engine.queueHabit({ ...target, deleted: true }, index);
      if (timer && timer.habitId === id) {
        setTimer(null);
        cancelTimerDone();
      }
      showToast(`“${target.name}” excluído`, () => {
        const cur = dataRef.current;
        const list = [...cur.habits];
        list.splice(Math.min(index, list.length), 0, target);
        const mergedLog = { ...cur.log };
        for (const [k, v] of Object.entries(d.log)) if (v[id]) mergedLog[k] = { ...(mergedLog[k] || {}), [id]: v[id] };
        commit({ ...cur, habits: list, log: mergedLog });
        engine.queueHabit({ ...target, deleted: false }, index);
      });
    },
    setArchived(h, archived, withToast = true) {
      const d = dataRef.current;
      const updated = { ...h, archived };
      const list = d.habits.map((x) => (x.id === h.id ? updated : x));
      commit({ ...d, habits: list });
      engine.queueHabit(updated, list.findIndex((x) => x.id === h.id));
      if (withToast)
        showToast(archived ? `“${h.name}” arquivado` : `“${h.name}” voltou para a lista`, archived ? () => habits.setArchived(h, false, false) : undefined);
    },
    reorder(ids) {
      const d = dataRef.current;
      const byId = new Map(d.habits.map((h) => [h.id, h]));
      const ordered = ids.map((id) => byId.get(id)).filter(Boolean);
      const list = [...ordered, ...d.habits.filter((h) => !ids.includes(h.id))];
      if (list.every((h, i) => h.id === d.habits[i].id)) return;
      commit({ ...d, habits: list });
      engine.queueHabits(list);
    },
    saveNote(h, day, text) {
      const d = dataRef.current;
      const dayNotes = { ...((d.notes || {})[day] || {}) };
      if (text) dayNotes[h.id] = text;
      else delete dayNotes[h.id];
      const notes = { ...(d.notes || {}), [day]: dayNotes };
      if (!Object.keys(dayNotes).length) delete notes[day];
      commit({ ...d, notes });
      engine.queueCheckin(h.id, day, countOf(d.log, day, h.id), text);
    },
    setMood(day, mood) {
      const d = dataRef.current;
      const moods = { ...(d.moods || {}) };
      if (mood) moods[day] = mood;
      else delete moods[day];
      commit({ ...d, moods });
      engine.queueMood(day, mood);
      haptic(6);
    },
    addBreak(start, end) {
      updateProfile({ breaks: [...(dataRef.current.breaks || []), { id: newBreakId(), start, end }] });
      showToast(`Pausa de ${start.split('-').reverse().slice(0, 2).join('/')} a ${end.split('-').reverse().slice(0, 2).join('/')} criada`);
    },
    removeBreak(b) {
      const prev = dataRef.current.breaks || [];
      updateProfile({ breaks: prev.filter((x) => x.id !== b.id) });
      showToast('Pausa removida', () => updateProfile({ breaks: prev }));
    },
    endBreak(b) {
      const t = keyOf(todayDate());
      const prev = dataRef.current.breaks || [];
      const yesterday = keyOf(addDays(todayDate(), -1));
      updateProfile({ breaks: b.start >= t ? prev.filter((x) => x.id !== b.id) : prev.map((x) => (x.id === b.id ? { ...x, end: yesterday } : x)) });
      showToast('Pausa encerrada', () => updateProfile({ breaks: prev }));
    },
  };

  /* =================================================================== */
  /* Tarefas                                                             */
  /* =================================================================== */
  const putTask = (t, extra = {}) => {
    const d = dataRef.current;
    const exists = d.tasks.some((x) => x.id === t.id);
    const list = exists ? d.tasks.map((x) => (x.id === t.id ? t : x)) : [...d.tasks, t];
    commit({ ...d, ...extra, tasks: list });
    engine.queueTask(t);
  };
  const findTask = (id) => dataRef.current.tasks.find((t) => t.id === id);

  const tasks = {
    add(fields) {
      const d = dataRef.current;
      const maxPos = d.tasks.reduce((m, t) => Math.max(m, t.position || 0), 0);
      const t = normalizeTask({ id: newId('t'), title: 'Nova tarefa', listId: INBOX_ID, position: maxPos + 1, createdAt: new Date().toISOString(), ...fields });
      putTask(t);
      haptic(6);
      return t;
    },
    update(id, patch) {
      const t = findTask(id);
      if (!t) return;
      putTask({ ...t, ...patch });
    },
    toggle(id) {
      const t = findTask(id);
      if (!t) return;
      if (t.done) {
        putTask({ ...t, done: false, completedAt: null });
        haptic(6);
        return;
      }
      const { updated, created } = completeTask(t);
      const d = dataRef.current;
      const list = d.tasks.map((x) => (x.id === t.id ? updated : x));
      if (created) list.push(created);
      commit({ ...d, tasks: list });
      engine.queueTask(updated);
      if (created) engine.queueTask(created);
      haptic(14);
      showToast(created ? `Concluída. Próxima: ${updated.date.split('-').reverse().slice(0, 2).join('/')}` : 'Tarefa concluída', () => {
        const cur = dataRef.current;
        const back = cur.tasks.filter((x) => !created || x.id !== created.id).map((x) => (x.id === t.id ? t : x));
        commit({ ...cur, tasks: back });
        engine.queueTask(t);
        if (created) engine.queueTask({ ...created, deleted: true });
      });
    },
    remove(id) {
      const t = findTask(id);
      if (!t) return;
      const d = dataRef.current;
      commit({ ...d, tasks: d.tasks.filter((x) => x.id !== id) });
      engine.queueTask({ ...t, deleted: true });
      showToast(`“${t.title}” excluída`, () => putTask(t));
    },
    duplicate(id) {
      const t = findTask(id);
      if (!t) return null;
      const copy = { ...t, id: newId('t'), title: `${t.title} (cópia)`, done: false, completedAt: null, createdAt: new Date().toISOString(), position: (t.position || 0) + 0.01 };
      putTask(copy);
      showToast('Tarefa duplicada');
      return copy;
    },
    /** Grava várias de uma vez (Kanban, matriz, arrastar na agenda). */
    updateMany(changes) {
      const d = dataRef.current;
      const map = new Map(changes.map((c) => [c.id, c]));
      const list = d.tasks.map((t) => (map.has(t.id) ? { ...t, ...map.get(t.id) } : t));
      commit({ ...d, tasks: list });
      engine.queueTasks(list.filter((t) => map.has(t.id)));
    },
  };

  /* =================================================================== */
  /* Listas e seções                                                     */
  /* =================================================================== */
  const putList = (l) => {
    const d = dataRef.current;
    const exists = d.lists.some((x) => x.id === l.id);
    commit({ ...d, lists: exists ? d.lists.map((x) => (x.id === l.id ? l : x)) : [...d.lists, l] });
    engine.queueList(l);
  };
  const lists = {
    add(fields) {
      const d = dataRef.current;
      const l = normalizeList({ id: newId('l'), position: d.lists.reduce((m, x) => Math.max(m, x.position || 0), 0) + 1, ...fields });
      putList(l);
      showToast(`Lista “${l.name}” criada`);
      return l;
    },
    update(id, patch) {
      const l = dataRef.current.lists.find((x) => x.id === id);
      if (l) putList({ ...l, ...patch });
    },
    remove(id) {
      if (id === INBOX_ID) return;
      const d = dataRef.current;
      const l = d.lists.find((x) => x.id === id);
      if (!l) return;
      const gone = d.tasks.filter((t) => t.listId === id);
      commit({ ...d, lists: d.lists.filter((x) => x.id !== id), tasks: d.tasks.filter((t) => t.listId !== id) });
      engine.queueList({ ...l, deleted: true });
      engine.queueTasks(gone.map((t) => ({ ...t, deleted: true })));
      showToast(`Lista “${l.name}” excluída${gone.length ? ` com ${gone.length} tarefa${gone.length > 1 ? 's' : ''}` : ''}`, () => {
        const cur = dataRef.current;
        commit({ ...cur, lists: [...cur.lists, l].sort((a, b) => a.position - b.position), tasks: [...cur.tasks, ...gone] });
        engine.queueList(l);
        engine.queueTasks(gone);
      });
    },
    addSection(listId, name) {
      const l = dataRef.current.lists.find((x) => x.id === listId);
      if (!l) return;
      putList({ ...l, sections: [...(l.sections || []), { id: newId('s'), name }] });
    },
    renameSection(listId, sectionId, name) {
      const l = dataRef.current.lists.find((x) => x.id === listId);
      if (l) putList({ ...l, sections: l.sections.map((s) => (s.id === sectionId ? { ...s, name } : s)) });
    },
    removeSection(listId, sectionId) {
      const d = dataRef.current;
      const l = d.lists.find((x) => x.id === listId);
      if (!l) return;
      const moved = d.tasks.filter((t) => t.listId === listId && t.sectionId === sectionId).map((t) => ({ ...t, sectionId: '' }));
      putList({ ...l, sections: l.sections.filter((s) => s.id !== sectionId) });
      if (moved.length) tasks.updateMany(moved);
    },
  };

  /* =================================================================== */
  /* Agenda                                                              */
  /* =================================================================== */
  const putEvent = (e) => {
    const d = dataRef.current;
    const exists = d.events.some((x) => x.id === e.id);
    commit({ ...d, events: exists ? d.events.map((x) => (x.id === e.id ? e : x)) : [...d.events, e] });
    engine.queueEvent(e);
  };
  const events = {
    save(ev) {
      const e = normalizeEvent({ ...ev, id: ev.id || newId('e') });
      if (!e.endDate || e.endDate < e.date) e.endDate = e.date;
      putEvent(e);
      if (e.reminder >= 0) syncReminders({ ...dataRef.current }, { ask: true });
      showToast(ev.id ? 'Evento atualizado' : 'Evento criado');
      return e;
    },
    remove(id) {
      const d = dataRef.current;
      const e = d.events.find((x) => x.id === id);
      if (!e) return;
      commit({ ...d, events: d.events.filter((x) => x.id !== id) });
      engine.queueEvent({ ...e, deleted: true });
      showToast(`“${e.title}” excluído`, () => putEvent(e));
    },
    /** Move um evento para outro dia/horário mantendo a duração. */
    move(id, date, start) {
      const e = dataRef.current.events.find((x) => x.id === id);
      if (!e) return;
      const span = Math.round((new Date(`${e.endDate}T12:00`) - new Date(`${e.date}T12:00`)) / 86400000);
      const endDate = keyOf(addDays(new Date(`${date}T12:00`), span));
      let patch = { date, endDate };
      if (start !== undefined && !e.allDay) {
        const toM = (s) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3));
        const dur = e.end ? toM(e.end) - toM(e.start) + span * 1440 : 60;
        const endM = toM(start) + Math.max(15, dur);
        const pad = (n) => String(n).padStart(2, '0');
        patch = { ...patch, start, end: endM >= 1440 ? '23:59' : `${pad(Math.floor(endM / 60))}:${pad(endM % 60)}` };
      }
      putEvent({ ...e, ...patch });
    },
  };

  /* =================================================================== */
  /* Foco                                                                */
  /* =================================================================== */
  const settings = F.focusSettings(data);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  const logFocus = useCallback(
    (session) => {
      if (!session) return null;
      const f = { id: newId('f'), ...session };
      const d = dataRef.current;
      commit({ ...d, focus: [...(d.focus || []), f] });
      engine.queueFocus(f);
      return f;
    },
    [commit, engine]
  );

  const notifyFocus = (s) => {
    if (!s.endAt) return;
    const label = s.phase === 'focus' ? 'Foco concluído' : 'Pausa encerrada';
    const body = s.phase === 'focus' ? 'Hora de uma pausa.' : 'Pronto para o próximo foco?';
    scheduleFocusEnd(label, body, s.endAt);
  };

  // Fim de fase: registra a sessão e passa para a próxima (com o app aberto ou ao voltar para ele)
  useEffect(() => {
    if (!focus.endAt) return undefined;
    const check = () => {
      const s = focusRef.current;
      if (!s.endAt || Date.now() < s.endAt) return;
      const st = settingsRef.current;
      if (s.phase === 'focus') {
        logFocus(F.sessionFrom({ ...s, endAt: s.endAt }, s.endAt));
        haptic([20, 80, 20]);
        showToast('Foco concluído. Hora de uma pausa.');
      } else {
        haptic(14);
        showToast('Pausa encerrada.');
      }
      let next = F.nextPhase(s, st);
      if (st.autoBreak && s.phase === 'focus') {
        next = F.start(next);
        notifyFocus(next);
      }
      setFocus(next);
    };
    check();
    const id = setInterval(check, 500);
    document.addEventListener('visibilitychange', check);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', check);
    };
  }, [focus.endAt, logFocus, setFocus, showToast]); // eslint-disable-line react-hooks/exhaustive-deps

  const focusActions = {
    state: focus,
    settings,
    start(target) {
      let s = focusRef.current;
      if (target) s = { ...s, taskId: target.taskId || null, habitId: target.habitId || null };
      s = F.start(s);
      setFocus(s);
      notifyFocus(s);
      haptic(8);
    },
    pause() {
      setFocus(F.pause(focusRef.current));
      cancelFocusEnd();
    },
    /** Encerra: registra o tempo de foco já feito e volta ao início. */
    stop() {
      const s = focusRef.current;
      const sess = F.sessionFrom(s);
      if (sess) logFocus(sess);
      cancelFocusEnd();
      setFocus(F.idleState(s.phase === 'stopwatch' ? 'stopwatch' : 'focus', settingsRef.current, { ...s, cycle: s.phase === 'stopwatch' ? 0 : s.cycle }));
      if (sess) showToast(`${sess.minutes} min de foco registrados`);
    },
    skip() {
      const s = focusRef.current;
      if (s.phase === 'focus') {
        const sess = F.sessionFrom(s);
        if (sess) logFocus(sess);
      }
      cancelFocusEnd();
      setFocus(F.nextPhase(s, settingsRef.current));
    },
    setMode(mode) {
      const s = focusRef.current;
      if (F.isRunning(s)) return;
      setFocus(F.idleState(mode === 'stopwatch' ? 'stopwatch' : 'focus', settingsRef.current, { ...s, cycle: 0 }));
    },
    setTarget(target) {
      setFocus({ ...focusRef.current, taskId: target ? target.taskId || null : null, habitId: target ? target.habitId || null : null });
    },
    updateSettings(patch) {
      const cur = F.focusSettings(dataRef.current);
      const nextSettings = { ...cur, ...patch };
      updateProfile({ settings: { ...(dataRef.current.settings || {}), focus: nextSettings } });
      const s = focusRef.current;
      if (!F.isRunning(s) && s.phase !== 'stopwatch' && s.remainingMs === s.durationMs) setFocus(F.idleState(s.phase, nextSettings, s));
    },
    removeSession(id) {
      const d = dataRef.current;
      const f = (d.focus || []).find((x) => x.id === id);
      if (!f) return;
      commit({ ...d, focus: d.focus.filter((x) => x.id !== id) });
      engine.queueFocus({ ...f, deleted: true });
      showToast('Sessão removida', () => {
        const cur = dataRef.current;
        commit({ ...cur, focus: [...cur.focus, f] });
        engine.queueFocus(f);
      });
    },
  };

  /* =================================================================== */
  /* Conta e dados                                                       */
  /* =================================================================== */
  const account = {
    rename: (name) => updateProfile({ name }),
    setLocalName: (name) => commit({ ...dataRef.current, name }),
    setWeeklyEmail: (weeklyEmail) => updateProfile({ weeklyEmail }),
    syncNow() {
      engine.flushNow();
      engine.pull();
    },
    async signOut() {
      await supabase.auth.signOut({ scope: 'local' });
    },
    async testEmail() {
      if (!engine.linked) return { ok: false, message: 'Entre na sua conta para receber o resumo.' };
      engine.flushNow();
      try {
        const { data: res, error } = await supabase.functions.invoke('weekly-summary', { body: { test: true } });
        if (error) {
          let detail = '';
          try {
            detail = (await error.context.json()).error || '';
          } catch (e) {
            /* sem corpo */
          }
          return { ok: false, message: detail || 'O servidor não conseguiu enviar o e-mail agora.' };
        }
        return { ok: true, message: `Enviado para ${res && res.to ? res.to : 'seu e-mail'}. Confira a caixa de entrada e o spam.` };
      } catch (e) {
        return { ok: false, message: 'Sem conexão com o servidor. Tente de novo.' };
      }
    },
    exportCsv: () => saveTextFile(`ritmo-${keyOf(todayDate())}.csv`, exportCsv(dataRef.current)),
    async resetHistory() {
      const d = dataRef.current;
      const t = keyOf(todayDate());
      if (engine.linked) await engine.resetHistory(d.habits, t, profileOf(d));
      const cur = dataRef.current;
      commit({ ...cur, sample: false, log: {}, notes: {}, moods: {}, focus: [], tasks: [], events: [], habits: cur.habits.map((h) => ({ ...h, createdAt: t })) });
    },
    hasPending: () => engine.hasPending(),
    clearRecovery: () => setRecovery(false),
  };

  return {
    data,
    today,
    user,
    recovery,
    syncStatus,
    toast,
    showToast,
    dismissToast,
    runUndo,
    celebration,
    dismissCelebration,
    habits,
    tasks,
    lists,
    events,
    focus: focusActions,
    account,
  };
}
