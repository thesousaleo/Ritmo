import React, { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence, MotionConfig } from 'framer-motion';
import { App as NativeApp } from '@capacitor/app';
import { StatusBar, Style } from '@capacitor/status-bar';

import { EASE_OUT, useMediaQuery, Sheet, Icon, hasOpenLayer } from './components/ui.jsx';
import { TodayView, AccountButton } from './components/Today.jsx';
import { StatsView } from './components/Stats.jsx';
import { HabitSheet } from './components/HabitSheet.jsx';
import { HabitDetail } from './components/HabitDetail.jsx';
import { TimerSheet } from './components/TimerSheet.jsx';
import { ManageSheet } from './components/ManageSheet.jsx';
import { AccountSheet } from './components/AccountSheet.jsx';
import { Toast, Celebration } from './components/Overlays.jsx';
import { Rail, ListsPanel, ListsDrawer, TabBar, Fab, MODULES } from './components/Nav.jsx';
import { TasksView } from './components/tasks/TasksView.jsx';
import { TaskPanel, TaskSheet } from './components/tasks/TaskDetail.jsx';
import { QuickAdd } from './components/tasks/QuickAdd.jsx';
import { ListSheet } from './components/tasks/ListSheet.jsx';
import { CalendarView } from './components/calendar/CalendarView.jsx';
import { EventSheet, CreateSheet } from './components/calendar/EventSheet.jsx';
import { MatrixView } from './components/MatrixView.jsx';
import { FocusView } from './components/FocusView.jsx';
import { SearchSheet } from './components/SearchSheet.jsx';
import { useRitmoStore } from './store.js';
import { ALL_DAYS, keyOf, todayDate, normalizeHabit, fmtLong } from './lib/habits.js';
import { viewMeta } from './lib/tasks.js';
import { isRunning } from './lib/focus.js';
import { isNative } from './lib/native.js';

const UI_KEY = 'ritmo.ui';
const loadUi = () => {
  try {
    return JSON.parse(localStorage.getItem(UI_KEY)) || {};
  } catch (e) {
    return {};
  }
};

const blankHabit = () =>
  normalizeHabit({ id: '', name: '', icon: 'Sprout', color: 'cobalt', period: 'morning', days: ALL_DAYS, target: 1, unit: '', createdAt: keyOf(todayDate()) });

export default function App() {
  const desktop = useMediaQuery('(min-width: 1024px)');
  const wide = useMediaQuery('(min-width: 1280px)');
  const store = useRitmoStore();
  const { data, today } = store;
  const todayKey = keyOf(today);

  const [module, setModule] = useState(() => loadUi().module || 'tasks');
  const [view, setView] = useState(() => loadUi().view || 'today');
  const [habitDay, setHabitDay] = useState(todayKey);
  const [taskId, setTaskId] = useState(null);
  const [drawer, setDrawer] = useState(false);
  const [quickAdd, setQuickAdd] = useState(null); // { view }
  const [listSheet, setListSheet] = useState(null); // { list? }
  const [eventSheet, setEventSheet] = useState(null); // evento (novo ou existente)
  const [create, setCreate] = useState(null); // { date, time }
  const [search, setSearch] = useState(false);
  const [habitSheet, setHabitSheet] = useState(null);
  const [habitDetail, setHabitDetail] = useState(null);
  const [manageOpen, setManageOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [timerOpen, setTimerOpen] = useState(false);
  const scrollRef = useRef(null);

  useEffect(() => {
    try {
      localStorage.setItem(UI_KEY, JSON.stringify({ module, view }));
    } catch (e) {
      /* sem storage */
    }
  }, [module, view]);

  // Visão apontando para lista ou etiqueta que sumiu volta para Hoje
  useEffect(() => {
    if (view.startsWith('list:') && !viewMeta(view, data).list) setView('today');
  }, [view, data]);
  useEffect(() => {
    if (store.recovery) setAccountOpen(true);
  }, [store.recovery]);
  // Dia selecionado nos hábitos acompanha a virada do dia
  const prevToday = useRef(todayKey);
  useEffect(() => {
    if (prevToday.current !== todayKey) {
      setHabitDay((d) => (d === prevToday.current ? todayKey : d));
      prevToday.current = todayKey;
    }
  }, [todayKey]);

  const task = taskId && data.tasks.find((t) => t.id === taskId);
  useEffect(() => {
    if (taskId && !task) setTaskId(null);
  }, [taskId, task]);

  const ui = { taskId, drawer, quickAdd, listSheet, eventSheet, create, search, habitSheet, habitDetail, manageOpen, accountOpen, timerOpen, module, celebration: store.celebration };
  const uiRef = useRef(ui);
  uiRef.current = ui;

  const goModule = useCallback((m) => {
    if (m === uiRef.current.module) {
      scrollRef.current && scrollRef.current.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    setModule(m);
    scrollRef.current && scrollRef.current.scrollTo({ top: 0 });
  }, []);

  const openTask = useCallback((id) => setTaskId(id), []);
  const openEvent = useCallback((occ) => setEventSheet(occ.ev), []);
  const openHabit = useCallback((h) => {
    setModule('habits');
    setHabitDetail({ habitId: h.id, dayKey: todayKey });
  }, [todayKey]);

  const focusTask = (t) => {
    setTaskId(null);
    store.focus.setTarget({ taskId: t.id });
    setModule('focus');
  };

  const habitToggle = (h, day = todayKey) => {
    if (store.habits.toggle(h, day) === 'timer') setTimerOpen(true);
  };

  const newItem = useCallback(() => {
    const m = uiRef.current.module;
    if (m === 'habits' || m === 'stats') setHabitSheet({ mode: 'create', habit: blankHabit() });
    else if (m === 'calendar') setCreate({ date: keyOf(todayDate()) });
    else if (m === 'focus') return;
    else if (desktop && m === 'tasks') {
      const el = document.querySelector('.qa-input');
      if (el) el.focus();
    } else setQuickAdd({ view: m === 'matrix' ? 'all' : view });
  }, [desktop, view]);

  /* ---------- teclado (computador) ---------- */
  useEffect(() => {
    const onKey = (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
      if (hasOpenLayer() || uiRef.current.search) return;
      if (e.key === 'n' || e.key === 'N') {
        e.preventDefault();
        newItem();
      } else if (e.key === '/') {
        e.preventDefault();
        setSearch(true);
      } else {
        const m = MODULES.find((x) => x.key === e.key);
        if (m) goModule(m.id);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [newItem, goModule]);

  /* ---------- Android: botão voltar e barra de status ---------- */
  useEffect(() => {
    if (!isNative) return undefined;
    const handle = NativeApp.addListener('backButton', () => {
      const s = uiRef.current;
      if (s.celebration) store.dismissCelebration();
      else if (s.search) setSearch(false);
      else if (s.timerOpen) setTimerOpen(false);
      else if (s.create) setCreate(null);
      else if (s.eventSheet) setEventSheet(null);
      else if (s.habitSheet) setHabitSheet(null);
      else if (s.listSheet) setListSheet(null);
      else if (s.quickAdd) setQuickAdd(null);
      else if (s.habitDetail) setHabitDetail(null);
      else if (s.taskId) setTaskId(null);
      else if (s.manageOpen) setManageOpen(false);
      else if (s.accountOpen) setAccountOpen(false);
      else if (s.drawer) setDrawer(false);
      else if (s.module !== 'tasks') setModule('tasks');
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
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const accountButton = !desktop && <AccountButton name={data.name} status={store.syncStatus} onClick={() => setAccountOpen(true)} />;
  const searchButton = !desktop && (
    <button type="button" className="icon-btn ghost" onClick={() => setSearch(true)} aria-label="Buscar">
      <Icon name="Search" size={19} />
    </button>
  );
  const headerRight = (
    <>
      {searchButton}
      {accountButton}
    </>
  );
  const focusRunning = isRunning(store.focus.state);
  const panelMode = desktop && wide && module === 'tasks';
  const anyOverlay = !!(quickAdd || listSheet || eventSheet || create || habitSheet || habitDetail || manageOpen || accountOpen || timerOpen || (task && !panelMode));
  const detailHabit = habitDetail && data.habits.find((h) => h.id === habitDetail.habitId);
  const timer = store.habits.timer;
  const timerHabit = timer && data.habits.find((h) => h.id === timer.habitId);
  const showFab = !desktop && module !== 'focus' && module !== 'stats';

  let content;
  if (module === 'tasks')
    content = (
      <TasksView
        store={store}
        view={view}
        todayKey={todayKey}
        desktop={desktop}
        selectedId={taskId}
        onOpen={openTask}
        onOpenLists={() => setDrawer(true)}
        onEditList={(l) => setListSheet({ list: l })}
        onOpenEvent={openEvent}
        onHabit={(h) => habitToggle(h)}
        headerRight={headerRight}
      />
    );
  else if (module === 'calendar')
    content = <CalendarView store={store} todayKey={todayKey} desktop={desktop} onOpenTask={openTask} onOpenEvent={openEvent} onCreate={(slot) => setCreate(slot)} headerRight={headerRight} />;
  else if (module === 'matrix') content = <MatrixView store={store} todayKey={todayKey} desktop={desktop} onOpenTask={openTask} selectedId={taskId} headerRight={headerRight} />;
  else if (module === 'focus') content = <FocusView store={store} todayKey={todayKey} desktop={desktop} headerRight={headerRight} />;
  else if (module === 'habits')
    content = (
      <TodayView
        data={data}
        today={today}
        selectedKey={habitDay}
        onSelectDay={setHabitDay}
        onToggle={(h) => habitToggle(h, habitDay)}
        onOpen={(h) => setHabitDetail({ habitId: h.id, dayKey: habitDay })}
        onCreate={() => setHabitSheet({ mode: 'create', habit: blankHabit() })}
        onManage={() => setManageOpen(true)}
        onMood={store.habits.setMood}
        onEndBreak={store.habits.endBreak}
        timer={timer}
        title="Hábitos"
        headerRight={
          <>
            <button type="button" className="icon-btn ghost" onClick={() => goModule('stats')} aria-label="Consistência">
              <Icon name="Activity" size={19} />
            </button>
            {desktop && (
              <button type="button" className="btn-secondary sm" onClick={() => setHabitSheet({ mode: 'create', habit: blankHabit() })}>
                <Icon name="Plus" size={15} /> Novo hábito
              </button>
            )}
            {accountButton}
          </>
        }
      />
    );
  else
    content = (
      <StatsView
        data={data}
        today={today}
        weeks={desktop ? 26 : 18}
        onReset={store.account.resetHistory}
        onOpen={(h) => setHabitDetail({ habitId: h.id, dayKey: todayKey })}
        headerRight={
          <>
            {!desktop && (
              <button type="button" className="icon-btn ghost" onClick={() => goModule('habits')} aria-label="Voltar para hábitos">
                <Icon name="Sprout" size={19} />
              </button>
            )}
            {accountButton}
          </>
        }
      />
    );

  return (
    <MotionConfig reducedMotion="user">
      <div className={`app${desktop ? ' is-desktop' : ''} m-${module}`}>
        {desktop && (
          <Rail module={module} onModule={goModule} onSearch={() => setSearch(true)} onAccount={() => setAccountOpen(true)} name={data.name} status={store.syncStatus} focusRunning={focusRunning} />
        )}
        {desktop && module === 'tasks' && (
          <aside className="lists-col" aria-label="Listas">
            <div className="lists-col-head">
              <span>Tarefas</span>
              <span className="lists-col-date first-up">{fmtLong.format(today)}</span>
            </div>
            <ListsPanel data={data} view={view} todayKey={todayKey} onView={setView} onNewList={() => setListSheet({})} store={store} />
          </aside>
        )}

        <main ref={scrollRef} className={`scroll${anyOverlay && !desktop ? ' is-locked' : ''}`}>
          <motion.div key={module} className={`page is-${module}`} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.16, ease: EASE_OUT }}>
            {content}
          </motion.div>
        </main>

        <AnimatePresence>
          {panelMode && task && (
            <TaskPanel key="panel" task={task} data={data} todayKey={todayKey} desktop={desktop} store={store} onClose={() => setTaskId(null)} onFocus={focusTask} />
          )}
        </AnimatePresence>

        {!desktop && <TabBar module={module} onModule={goModule} focusRunning={focusRunning} />}
        {showFab && <Fab onClick={newItem} label={module === 'habits' ? 'Novo hábito' : module === 'calendar' ? 'Adicionar na agenda' : 'Nova tarefa'} />}

        {!desktop && (
          <ListsDrawer
            open={drawer}
            onClose={() => setDrawer(false)}
            data={data}
            view={view}
            todayKey={todayKey}
            onView={(v) => {
              setView(v);
              setModule('tasks');
            }}
            onNewList={() => setListSheet({})}
            store={store}
          />
        )}

        <AnimatePresence>
          {!panelMode && task && <TaskSheet key="task" task={task} data={data} todayKey={todayKey} desktop={desktop} store={store} onClose={() => setTaskId(null)} onFocus={focusTask} />}
        </AnimatePresence>

        <AnimatePresence>
          {quickAdd && (
            <Sheet key="qa" desktop={desktop} title="Nova tarefa" onClose={() => setQuickAdd(null)} className="is-compact">
              <QuickAdd data={data} view={quickAdd.view} todayKey={todayKey} desktop={false} autoFocus onAdd={(fields) => store.tasks.add(fields)} />
              <p className="field-hint">Escreva a data e a hora no texto (“sexta 9h”), #etiqueta, !1 para prioridade alta e ^lista.</p>
            </Sheet>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {listSheet && (
            <ListSheet
              key="list"
              desktop={desktop}
              initial={listSheet.list}
              onClose={() => setListSheet(null)}
              onSave={(form) => {
                if (listSheet.list) store.lists.update(listSheet.list.id, form);
                else {
                  const l = store.lists.add(form);
                  setView(`list:${l.id}`);
                  setModule('tasks');
                }
                setListSheet(null);
              }}
            />
          )}
        </AnimatePresence>

        <AnimatePresence>
          {create && (
            <CreateSheet
              key="create"
              desktop={desktop}
              slot={create}
              onClose={() => setCreate(null)}
              onCreateTask={(f) => {
                store.tasks.add(f);
                setCreate(null);
              }}
              onCreateEvent={(ev) => {
                store.events.save(ev);
                setCreate(null);
              }}
              onMore={(ev) => {
                setCreate(null);
                setEventSheet(ev);
              }}
            />
          )}
        </AnimatePresence>

        <AnimatePresence>
          {eventSheet && (
            <EventSheet
              key={eventSheet.id || 'new-event'}
              desktop={desktop}
              initial={eventSheet}
              onClose={() => setEventSheet(null)}
              onSave={(ev) => {
                store.events.save(ev);
                setEventSheet(null);
              }}
              onDelete={(id) => {
                store.events.remove(id);
                setEventSheet(null);
              }}
            />
          )}
        </AnimatePresence>

        <AnimatePresence>
          {detailHabit && (
            <HabitDetail
              key={`hd-${detailHabit.id}`}
              desktop={desktop}
              habit={detailHabit}
              data={data}
              today={today}
              dayKey={habitDetail.dayKey}
              onClose={() => setHabitDetail(null)}
              onEdit={(h) => {
                setHabitDetail(null);
                setHabitSheet({ mode: 'edit', habit: h });
              }}
              onNote={store.habits.saveNote}
            />
          )}
        </AnimatePresence>

        <AnimatePresence>
          {habitSheet && (
            <HabitSheet
              key={habitSheet.habit.id || 'new'}
              desktop={desktop}
              mode={habitSheet.mode}
              initial={habitSheet.habit}
              onClose={() => setHabitSheet(null)}
              onSave={(h) => {
                store.habits.save(h);
                setHabitSheet(null);
              }}
              onDelete={(id) => {
                store.habits.remove(id);
                setHabitSheet(null);
              }}
              onArchive={(h) => {
                store.habits.setArchived(h, true);
                setHabitSheet(null);
              }}
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
              onOrder={store.habits.reorder}
              onRestore={(h) => store.habits.setArchived(h, false)}
              onAddBreak={store.habits.addBreak}
              onRemoveBreak={store.habits.removeBreak}
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
              onPause={store.habits.pauseTimer}
              onResume={() => store.habits.resumeTimer(timerHabit.name)}
              onCancel={() => {
                store.habits.cancelTimer();
                setTimerOpen(false);
              }}
              onFinishNow={() => {
                store.habits.finishTimer();
                setTimerOpen(false);
              }}
            />
          )}
        </AnimatePresence>

        <AnimatePresence>
          {accountOpen && (
            <AccountSheet
              key="account"
              desktop={desktop}
              user={store.user}
              recovery={store.recovery}
              name={data.name}
              status={store.syncStatus}
              hasPending={store.account.hasPending()}
              weeklyEmail={!!data.weeklyEmail}
              onClose={() => setAccountOpen(false)}
              onRename={store.account.rename}
              onLocalName={store.account.setLocalName}
              onSyncNow={store.account.syncNow}
              onSignOut={async () => {
                await store.account.signOut();
                setAccountOpen(false);
              }}
              onRecoveryDone={() => {
                store.account.clearRecovery();
                setAccountOpen(false);
              }}
              onExport={store.account.exportCsv}
              onWeeklyEmail={store.account.setWeeklyEmail}
              onTestEmail={store.account.testEmail}
            />
          )}
        </AnimatePresence>

        {search && (
          <SearchSheet
            data={data}
            todayKey={todayKey}
            onClose={() => setSearch(false)}
            onOpenTask={(id) => setTaskId(id)}
            onOpenEvent={openEvent}
            onOpenHabit={openHabit}
          />
        )}

        <AnimatePresence>{store.toast && <Toast key={store.toast.id} toast={store.toast} desktop={desktop} onAction={store.runUndo} onDismiss={store.dismissToast} />}</AnimatePresence>
        <AnimatePresence>
          {store.celebration && <Celebration key="celebration" habit={store.celebration.habit} value={store.celebration.value} onDismiss={store.dismissCelebration} />}
        </AnimatePresence>
      </div>
    </MotionConfig>
  );
}
