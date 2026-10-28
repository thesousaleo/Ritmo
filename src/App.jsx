import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence, MotionConfig } from 'framer-motion';
import { App as NativeApp } from '@capacitor/app';
import { StatusBar, Style } from '@capacitor/status-bar';

import { EASE_OUT, useMediaQuery } from './components/ui.jsx';
import { TodayView, AccountButton } from './components/Today.jsx';
import { StatsView } from './components/Stats.jsx';
import { HabitSheet } from './components/HabitSheet.jsx';
import { HabitDetail } from './components/HabitDetail.jsx';
import { TimerSheet, timerRemaining } from './components/TimerSheet.jsx';
import { ManageSheet } from './components/ManageSheet.jsx';
import { AccountSheet } from './components/AccountSheet.jsx';
import { Toast, Celebration } from './components/Overlays.jsx';
import { TabBar, Sidebar } from './components/Nav.jsx';
import {
  ALL_DAYS, buildSeed, countOf, keyOf, addDays, loadLocal, newHabitId, newBreakId, saveLocal, todayDate,
  normalizeData, normalizeHabit, currentStreak, milestonesOf, exportCsv, noteOf,
} from './lib/habits.js';
import { supabase } from './lib/supabase.js';
import { createSyncEngine } from './lib/sync.js';
import { isNative, syncReminders, scheduleTimerDone, cancelTimerDone, saveTextFile, keepAwake } from './lib/native.js';

const TIMER_KEY = 'ritmo.timer';

const blankHabit = () =>
  normalizeHabit({
    id: '',
    name: '',
    icon: 'Sprout',
    color: 'cobalt',
    period: 'morning',
    days: ALL_DAYS,
    target: 1,
    unit: '',
    createdAt: keyOf(todayDate()),
  });

function haptic(ms) {
  try {
    if (navigator.vibrate) navigator.vibrate(ms);
  } catch (e) {
    /* iOS Safari não expõe vibração */
  }
}

function loadTimer() {
  try {
    const raw = localStorage.getItem(TIMER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}
function saveTimer(t) {
  try {
    if (t) localStorage.setItem(TIMER_KEY, JSON.stringify(t));
    else localStorage.removeItem(TIMER_KEY);
  } catch (e) {
    /* sem storage */
  }
}

export default function App() {
  const desktop = useMediaQuery('(min-width: 1024px)');
  const [data, setData] = useState(loadLocal);
  const dataRef = useRef(data);
  const [tab, setTab] = useState('today');
  const [today, setToday] = useState(todayDate);
  const [selectedKey, setSelectedKey] = useState(() => keyOf(todayDate()));
  const [sheet, setSheet] = useState(null); // editar/criar
  const [detail, setDetail] = useState(null); // { habitId, dayKey }
  const [manageOpen, setManageOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [timer, setTimer] = useState(loadTimer);
  const [timerOpen, setTimerOpen] = useState(false);
  const [toast, setToast] = useState(null);
  const [celebration, setCelebration] = useState(null);
  const [recovery, setRecovery] = useState(false);
  const [user, setUser] = useState(null);
  const [syncStatus, setSyncStatus] = useState('local');
  const scrollRef = useRef(null);
  const uiRef = useRef({});
  uiRef.current = { sheet, detail, manageOpen, accountOpen, timerOpen, celebration, tab };
  const anyOverlay = !!(sheet || detail || manageOpen || accountOpen || timerOpen);

  /** Toda alteração passa por aqui: atualiza a ref na hora (toques rápidos leem o valor certo) e o estado. */
  const commit = useCallback((next) => {
    dataRef.current = next;
    setData(next);
  }, []);

  useEffect(() => saveLocal(data), [data]);
  useEffect(() => saveTimer(timer), [timer]);

  /* ---------- motor de sincronização ---------- */
  const engine = useMemo(
    () =>
      createSyncEngine({
        client: supabase,
        onStatus: setSyncStatus,
        onSnapshot: (snap, opts) => {
          const prev = dataRef.current;
          commit(
            normalizeData({
              ...prev,
              habits: snap.habits,
              log: snap.log,
              notes: snap.notes,
              moods: snap.moods,
              name: snap.name ?? prev.name,
              breaks: snap.breaks ?? prev.breaks,
              weeklyEmail: snap.weeklyEmail ?? prev.weeklyEmail,
              sample: opts && opts.replaced ? false : prev.sample,
            })
          );
        },
      }),
    [commit]
  );
  const profileOf = (d) => ({ name: d.name || '', breaks: d.breaks || [], weeklyEmail: !!d.weeklyEmail });

  /* ---------- sessão ---------- */
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
        commit(buildSeed());
      }
    };
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        setRecovery(true);
        setAccountOpen(true);
      }
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
      if (keyOf(t) !== keyOf(today)) {
        setSelectedKey((k) => (k === keyOf(today) ? keyOf(t) : k));
        setToday(t);
      }
    };
    const id = setInterval(tick, 60000);
    document.addEventListener('visibilitychange', tick);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [today]);

  /* ---------- lembretes: reagenda quando hábitos, pausas ou o dia mudam ---------- */
  const reminderSig = JSON.stringify([data.habits.map((h) => [h.id, h.name, h.reminder, h.days, h.freq, h.archived, h.kind, h.unit]), data.breaks, keyOf(today)]);
  useEffect(() => {
    syncReminders(dataRef.current);
  }, [reminderSig]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ---------- Android: botão voltar e barra de status ---------- */
  useEffect(() => {
    if (!isNative) return undefined;
    const handle = NativeApp.addListener('backButton', () => {
      const s = uiRef.current;
      if (s.celebration) setCelebration(null);
      else if (s.timerOpen) setTimerOpen(false);
      else if (s.sheet) setSheet(null);
      else if (s.detail) setDetail(null);
      else if (s.manageOpen) setManageOpen(false);
      else if (s.accountOpen) setAccountOpen(false);
      else if (s.tab !== 'today') setTab('today');
      else NativeApp.minimizeApp();
    });
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const paint = () => {
      StatusBar.setStyle({ style: mq.matches ? Style.Dark : Style.Light }).catch(() => {});
      StatusBar.setBackgroundColor({ color: mq.matches ? '#0F1412' : '#ECEFE9' }).catch(() => {});
    };
    paint();
    mq.addEventListener('change', paint);
    return () => {
      mq.removeEventListener('change', paint);
      Promise.resolve(handle).then((h) => h && h.remove && h.remove());
    };
  }, []);

  /* ---------- navegação ---------- */
  const onTab = useCallback((t) => {
    if (t === uiRef.current.tab) {
      scrollRef.current && scrollRef.current.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    setTab(t);
    scrollRef.current && scrollRef.current.scrollTo({ top: 0 });
  }, []);

  const openCreate = useCallback(() => setSheet({ mode: 'create', habit: blankHabit() }), []);
  const openEdit = useCallback((h) => {
    setDetail(null);
    setSheet({ mode: 'edit', habit: h });
  }, []);
  const openDetail = useCallback((h, dayKey) => setDetail({ habitId: h.id, dayKey }), []);

  useEffect(() => {
    const onKey = (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      const s = uiRef.current;
      if (s.sheet || s.detail || s.manageOpen || s.accountOpen || s.timerOpen) return;
      if (e.key === 'n' || e.key === 'N') {
        e.preventDefault();
        openCreate();
      } else if (e.key === '1') onTab('today');
      else if (e.key === '2') onTab('stats');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [openCreate, onTab]);

  /* ---------- desfazer ---------- */
  const undoRef = useRef(null);
  const showToast = useCallback((text, undo) => {
    undoRef.current = undo || null;
    setToast({ id: Date.now(), text, actionLabel: undo ? 'Desfazer' : null });
  }, []);
  const dismissToast = useCallback(() => setToast(null), []);
  const dismissCelebration = useCallback(() => setCelebration(null), []);
  const runUndo = useCallback(() => {
    const fn = undoRef.current;
    undoRef.current = null;
    setToast(null);
    if (fn) fn();
  }, []);

  /* ---------- check-ins ---------- */
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

  /* ---------- temporizador ---------- */
  const completeTimer = useCallback(
    (t) => {
      const h = dataRef.current.habits.find((x) => x.id === t.habitId);
      setTimer(null);
      setTimerOpen(false);
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

  const wakeRef = useRef(null);
  useEffect(() => {
    if (timer && timer.endAt && timerOpen) {
      keepAwake().then((w) => (wakeRef.current = w));
    }
    return () => {
      if (wakeRef.current) wakeRef.current.release().catch(() => {});
      wakeRef.current = null;
    };
  }, [timer, timerOpen]);

  const startTimer = (h) => {
    if (timer && timer.habitId === h.id && timer.day === selectedKey) {
      setTimerOpen(true);
      return;
    }
    const ms = h.duration * 60000;
    const t = { habitId: h.id, day: selectedKey, durationMs: ms, remainingMs: ms, endAt: Date.now() + ms };
    if (timer) cancelTimerDone();
    setTimer(t);
    setTimerOpen(true);
    scheduleTimerDone(h.name, t.endAt);
    haptic(8);
  };

  const toggle = useCallback(
    (h) => {
      const d = dataRef.current;
      const c = countOf(d.log, selectedKey, h.id);
      if (c < h.target && h.duration > 0) {
        startTimer(h);
        return;
      }
      const next = c >= h.target ? 0 : c + 1;
      setCount(h, selectedKey, next);
      if (next === 0 && h.target > 1) {
        const day = selectedKey;
        showToast(`${h.name}: contador zerado`, () => setCount(h, day, c));
      }
    },
    [selectedKey, setCount, showToast, timer] // eslint-disable-line react-hooks/exhaustive-deps
  );

  /* ---------- hábitos ---------- */
  const persistHabits = (habits, changed) => {
    const nd = { ...dataRef.current, habits };
    commit(nd);
    for (const h of changed) engine.queueHabit(h, Math.max(0, habits.findIndex((x) => x.id === h.id)));
    return nd;
  };

  const save = (habit) => {
    const d = dataRef.current;
    let saved = normalizeHabit(habit);
    let habits;
    if (habit.id) habits = d.habits.map((h) => (h.id === habit.id ? saved : h));
    else {
      saved = { ...saved, id: newHabitId(), createdAt: keyOf(todayDate()) };
      habits = [...d.habits, saved];
    }
    const nd = persistHabits(habits, [saved]);
    if (saved.reminder) syncReminders(nd, { ask: true });
    setSheet(null);
    showToast(habit.id ? 'Alterações salvas' : `“${saved.name}” criado`);
  };

  const remove = (id) => {
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
    setSheet(null);
    setDetail(null);
    if (timer && timer.habitId === id) {
      setTimer(null);
      cancelTimerDone();
    }
    showToast(`“${target.name}” excluído`, () => {
      // O histórico continua no servidor e no snapshot anterior: basta recolocar o hábito
      const cur = dataRef.current;
      const habits = [...cur.habits];
      habits.splice(Math.min(index, habits.length), 0, target);
      const mergedLog = { ...cur.log };
      for (const [k, v] of Object.entries(d.log)) if (v[id]) mergedLog[k] = { ...(mergedLog[k] || {}), [id]: v[id] };
      commit({ ...cur, habits, log: mergedLog });
      engine.queueHabit({ ...target, deleted: false }, index);
    });
  };

  const setArchived = (h, archived) => {
    const d = dataRef.current;
    const updated = { ...h, archived };
    persistHabits(d.habits.map((x) => (x.id === h.id ? updated : x)), [updated]);
  };
  const archive = (h) => {
    setArchived(h, true);
    setSheet(null);
    setDetail(null);
    showToast(`“${h.name}” arquivado`, () => setArchived(h, false));
  };
  const restore = (h) => {
    setArchived(h, false);
    showToast(`“${h.name}” voltou para a lista`);
  };

  const reorder = (ids) => {
    const d = dataRef.current;
    const byId = new Map(d.habits.map((h) => [h.id, h]));
    const ordered = ids.map((id) => byId.get(id)).filter(Boolean);
    const rest = d.habits.filter((h) => !ids.includes(h.id));
    const habits = [...ordered, ...rest];
    if (habits.every((h, i) => h.id === d.habits[i].id)) return;
    commit({ ...d, habits });
    engine.queueHabits(habits);
  };

  /* ---------- notas, humor, pausas, perfil ---------- */
  const saveNote = (h, day, text) => {
    const d = dataRef.current;
    const dayNotes = { ...((d.notes || {})[day] || {}) };
    if (text) dayNotes[h.id] = text;
    else delete dayNotes[h.id];
    const notes = { ...(d.notes || {}), [day]: dayNotes };
    if (!Object.keys(dayNotes).length) delete notes[day];
    commit({ ...d, notes });
    engine.queueCheckin(h.id, day, countOf(d.log, day, h.id), text);
  };

  const setMood = (day, mood) => {
    const d = dataRef.current;
    const moods = { ...(d.moods || {}) };
    if (mood) moods[day] = mood;
    else delete moods[day];
    commit({ ...d, moods });
    engine.queueMood(day, mood);
    haptic(6);
  };

  const updateProfile = (patch) => {
    const nd = { ...dataRef.current, ...patch };
    commit(nd);
    engine.queueProfile(profileOf(nd));
    return nd;
  };

  const addBreak = (start, end) => {
    const breaks = [...(dataRef.current.breaks || []), { id: newBreakId(), start, end }];
    updateProfile({ breaks });
    showToast(`Pausa de ${start.split('-').reverse().slice(0, 2).join('/')} a ${end.split('-').reverse().slice(0, 2).join('/')} criada`);
  };
  const removeBreak = (b) => {
    const prev = dataRef.current.breaks || [];
    updateProfile({ breaks: prev.filter((x) => x.id !== b.id) });
    showToast('Pausa removida', () => updateProfile({ breaks: prev }));
  };
  const endBreak = (b) => {
    const t = keyOf(todayDate());
    const prev = dataRef.current.breaks || [];
    const yesterday = keyOf(addDays(todayDate(), -1));
    const breaks = b.start >= t ? prev.filter((x) => x.id !== b.id) : prev.map((x) => (x.id === b.id ? { ...x, end: yesterday } : x));
    updateProfile({ breaks });
    showToast('Pausa encerrada', () => updateProfile({ breaks: prev }));
  };

  const rename = (name) => updateProfile({ name });
  const setWeeklyEmail = (weeklyEmail) => updateProfile({ weeklyEmail });

  const testEmail = async () => {
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
  };

  const doExport = () => saveTextFile(`ritmo-${keyOf(todayDate())}.csv`, exportCsv(dataRef.current));

  const resetHistory = async () => {
    const d = dataRef.current;
    const t = keyOf(todayDate());
    if (engine.linked) await engine.resetHistory(d.habits, t, profileOf(d));
    const cur = dataRef.current;
    commit({ ...cur, sample: false, log: {}, notes: {}, moods: {}, habits: cur.habits.map((h) => ({ ...h, createdAt: t })) });
    setTab('today');
  };

  const signOut = async () => {
    await supabase.auth.signOut({ scope: 'local' });
    setAccountOpen(false);
  };

  const accountButton = !desktop && <AccountButton name={data.name} status={syncStatus} onClick={() => setAccountOpen(true)} />;
  const detailHabit = detail && data.habits.find((h) => h.id === detail.habitId);
  const timerHabit = timer && data.habits.find((h) => h.id === timer.habitId);

  return (
    <MotionConfig reducedMotion="user">
      <div className={`app${desktop ? ' is-desktop' : ''}`}>
        {desktop && <Sidebar tab={tab} onTab={onTab} onCreate={openCreate} onAccount={() => setAccountOpen(true)} user={user} name={data.name} status={syncStatus} />}

        <main ref={scrollRef} className={`scroll${anyOverlay ? ' is-locked' : ''}`}>
          <motion.div key={tab} className="page" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18, ease: EASE_OUT }}>
            {tab === 'today' ? (
              <TodayView
                data={data}
                today={today}
                selectedKey={selectedKey}
                onSelectDay={setSelectedKey}
                onToggle={toggle}
                onOpen={(h) => openDetail(h, selectedKey)}
                onCreate={openCreate}
                onManage={() => setManageOpen(true)}
                onMood={setMood}
                onEndBreak={endBreak}
                timer={timer}
                headerRight={accountButton}
              />
            ) : (
              <StatsView
                data={data}
                today={today}
                weeks={desktop ? 26 : 18}
                onReset={resetHistory}
                onOpen={(h) => openDetail(h, keyOf(today))}
                headerRight={accountButton}
              />
            )}
          </motion.div>
        </main>

        {!desktop && <TabBar tab={tab} onTab={onTab} onCreate={openCreate} />}

        <AnimatePresence>
          {detailHabit && (
            <HabitDetail
              key={`detail-${detailHabit.id}`}
              desktop={desktop}
              habit={detailHabit}
              data={data}
              today={today}
              dayKey={detail.dayKey}
              onClose={() => setDetail(null)}
              onEdit={openEdit}
              onNote={saveNote}
            />
          )}
        </AnimatePresence>

        <AnimatePresence>
          {sheet && (
            <HabitSheet
              key={sheet.habit.id || 'new'}
              desktop={desktop}
              mode={sheet.mode}
              initial={sheet.habit}
              onClose={() => setSheet(null)}
              onSave={save}
              onDelete={remove}
              onArchive={archive}
            />
          )}
        </AnimatePresence>

        <AnimatePresence>
          {manageOpen && (
            <ManageSheet
              key="manage"
              desktop={desktop}
              data={data}
              onClose={() => setManageOpen(false)}
              onOrder={reorder}
              onRestore={restore}
              onAddBreak={addBreak}
              onRemoveBreak={removeBreak}
            />
          )}
        </AnimatePresence>

        <AnimatePresence>
          {timerOpen && timer && timerHabit && (
            <TimerSheet
              key="timer"
              desktop={desktop}
              habit={timerHabit}
              timer={timer}
              onClose={() => setTimerOpen(false)}
              onPause={() => {
                setTimer({ ...timer, remainingMs: timerRemaining(timer), endAt: null });
                cancelTimerDone();
              }}
              onResume={() => {
                const endAt = Date.now() + timer.remainingMs;
                setTimer({ ...timer, endAt });
                scheduleTimerDone(timerHabit.name, endAt);
              }}
              onCancel={() => {
                setTimer(null);
                setTimerOpen(false);
                cancelTimerDone();
              }}
              onFinishNow={() => completeTimer(timer)}
            />
          )}
        </AnimatePresence>

        <AnimatePresence>
          {accountOpen && (
            <AccountSheet
              key="account"
              desktop={desktop}
              user={user}
              recovery={recovery}
              name={data.name}
              status={syncStatus}
              hasPending={engine.hasPending()}
              weeklyEmail={!!data.weeklyEmail}
              onClose={() => setAccountOpen(false)}
              onRename={rename}
              onLocalName={(name) => commit({ ...dataRef.current, name })}
              onSyncNow={() => {
                engine.flushNow();
                engine.pull();
              }}
              onSignOut={signOut}
              onRecoveryDone={() => {
                setRecovery(false);
                setAccountOpen(false);
              }}
              onExport={doExport}
              onWeeklyEmail={setWeeklyEmail}
              onTestEmail={testEmail}
            />
          )}
        </AnimatePresence>

        <AnimatePresence>{toast && <Toast key={toast.id} toast={toast} desktop={desktop} onAction={runUndo} onDismiss={dismissToast} />}</AnimatePresence>

        <AnimatePresence>
          {celebration && <Celebration key="celebration" habit={celebration.habit} value={celebration.value} onDismiss={dismissCelebration} />}
        </AnimatePresence>
      </div>
    </MotionConfig>
  );
}
