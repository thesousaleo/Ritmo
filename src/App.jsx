import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence, MotionConfig } from 'framer-motion';
import { Capacitor } from '@capacitor/core';
import { App as NativeApp } from '@capacitor/app';
import { StatusBar, Style } from '@capacitor/status-bar';

import { EASE_OUT, useMediaQuery } from './components/ui.jsx';
import { TodayView, AccountButton } from './components/Today.jsx';
import { StatsView } from './components/Stats.jsx';
import { HabitSheet } from './components/HabitSheet.jsx';
import { AccountSheet } from './components/AccountSheet.jsx';
import { TabBar, Sidebar } from './components/Nav.jsx';
import { ALL_DAYS, buildSeed, countOf, keyOf, loadLocal, newHabitId, saveLocal, todayDate } from './lib/habits.js';
import { supabase } from './lib/supabase.js';
import { createSyncEngine } from './lib/sync.js';

const isNative = Capacitor.isNativePlatform();

const blankHabit = () => ({
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

export default function App() {
  const desktop = useMediaQuery('(min-width: 1024px)');
  const [data, setData] = useState(loadLocal);
  const dataRef = useRef(data);
  const [tab, setTab] = useState('today');
  const [today, setToday] = useState(todayDate);
  const [selectedKey, setSelectedKey] = useState(() => keyOf(todayDate()));
  const [sheet, setSheet] = useState(null);
  const [accountOpen, setAccountOpen] = useState(false);
  const [recovery, setRecovery] = useState(false);
  const [user, setUser] = useState(null);
  const [syncStatus, setSyncStatus] = useState('local');
  const scrollRef = useRef(null);
  const uiRef = useRef({});
  uiRef.current = { sheet, accountOpen, tab };

  /** Toda alteração passa por aqui: atualiza a ref na hora (toques rápidos leem o valor certo) e o estado. */
  const commit = useCallback((next) => {
    dataRef.current = next;
    setData(next);
  }, []);

  useEffect(() => saveLocal(data), [data]);

  /* ---------- motor de sincronização ---------- */
  const engine = useMemo(
    () =>
      createSyncEngine({
        client: supabase,
        onStatus: setSyncStatus,
        onSnapshot: (snap, opts) => {
          const prev = dataRef.current;
          commit({
            ...prev,
            habits: snap.habits,
            log: snap.log,
            name: snap.name ?? prev.name,
            sample: opts && opts.replaced ? false : prev.sample,
          });
        },
      }),
    [commit]
  );

  /* ---------- sessão ---------- */
  const userIdRef = useRef(null);
  useEffect(() => {
    const handleUser = (u) => {
      const id = u ? u.id : null;
      setUser(u);
      if (id === userIdRef.current) return;
      const had = userIdRef.current;
      userIdRef.current = id;
      if (id) {
        engine.link(id, dataRef.current);
      } else if (had) {
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

  // Volta para o app ou reconecta: busca o que mudou nos outros aparelhos
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

  /* ---------- Android: botão voltar e barra de status ---------- */
  useEffect(() => {
    if (!isNative) return undefined;
    const handle = NativeApp.addListener('backButton', () => {
      const s = uiRef.current;
      if (s.sheet) setSheet(null);
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
  const openEdit = useCallback((h) => setSheet({ mode: 'edit', habit: h }), []);

  // Atalhos no computador: N novo hábito, 1 e 2 trocam de tela
  useEffect(() => {
    const onKey = (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      const s = uiRef.current;
      if (s.sheet || s.accountOpen) return;
      if (e.key === 'n' || e.key === 'N') {
        e.preventDefault();
        openCreate();
      } else if (e.key === '1') onTab('today');
      else if (e.key === '2') onTab('stats');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [openCreate, onTab]);

  /* ---------- alterações ---------- */
  const toggle = useCallback(
    (h) => {
      const d = dataRef.current;
      const c = countOf(d.log, selectedKey, h.id);
      const next = c >= h.target ? 0 : c + 1;
      const day = { ...(d.log[selectedKey] || {}) };
      if (next === 0) delete day[h.id];
      else day[h.id] = next;
      commit({ ...d, log: { ...d.log, [selectedKey]: day } });
      engine.queueCheckin(h.id, selectedKey, next);
      haptic(next >= h.target ? 14 : 6);
    },
    [selectedKey, commit, engine]
  );

  const save = (habit) => {
    const d = dataRef.current;
    let habits;
    let saved = habit;
    if (habit.id) {
      habits = d.habits.map((h) => (h.id === habit.id ? habit : h));
    } else {
      saved = { ...habit, id: newHabitId(), createdAt: keyOf(todayDate()) };
      habits = [...d.habits, saved];
    }
    commit({ ...d, habits });
    engine.queueHabit(saved, habits.findIndex((h) => h.id === saved.id));
    setSheet(null);
  };

  const remove = (id) => {
    const d = dataRef.current;
    const index = d.habits.findIndex((h) => h.id === id);
    const target = d.habits[index];
    const log = {};
    for (const [k, v] of Object.entries(d.log)) {
      const rest = { ...v };
      delete rest[id];
      if (Object.keys(rest).length) log[k] = rest;
    }
    commit({ ...d, habits: d.habits.filter((h) => h.id !== id), log });
    if (target) engine.queueHabit({ ...target, deleted: true }, index);
    setSheet(null);
  };

  const rename = (name) => {
    commit({ ...dataRef.current, name });
    engine.queueProfile(name);
  };

  const resetHistory = async () => {
    const d = dataRef.current;
    const t = keyOf(todayDate());
    if (engine.linked) await engine.resetHistory(d.habits, t, d.name || '');
    commit({ ...dataRef.current, sample: false, log: {}, habits: dataRef.current.habits.map((h) => ({ ...h, createdAt: t })) });
    setTab('today');
  };

  const signOut = async () => {
    await supabase.auth.signOut({ scope: 'local' });
    setAccountOpen(false);
  };

  const accountButton = !desktop && <AccountButton name={data.name} status={syncStatus} onClick={() => setAccountOpen(true)} />;

  return (
    <MotionConfig reducedMotion="user">
      <div className={`app${desktop ? ' is-desktop' : ''}`}>
        {desktop && (
          <Sidebar tab={tab} onTab={onTab} onCreate={openCreate} onAccount={() => setAccountOpen(true)} user={user} name={data.name} status={syncStatus} />
        )}

        <main ref={scrollRef} className={`scroll${sheet || accountOpen ? ' is-locked' : ''}`}>
          <motion.div key={tab} className="page" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18, ease: EASE_OUT }}>
            {tab === 'today' ? (
              <TodayView
                data={data}
                today={today}
                selectedKey={selectedKey}
                onSelectDay={setSelectedKey}
                onToggle={toggle}
                onEdit={openEdit}
                onCreate={openCreate}
                headerRight={accountButton}
              />
            ) : (
              <StatsView data={data} today={today} weeks={desktop ? 26 : 18} onReset={resetHistory} headerRight={accountButton} />
            )}
          </motion.div>
        </main>

        {!desktop && <TabBar tab={tab} onTab={onTab} onCreate={openCreate} />}

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
            />
          )}
        </AnimatePresence>
      </div>
    </MotionConfig>
  );
}
