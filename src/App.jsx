import React, { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence, MotionConfig } from 'framer-motion';
import { App as NativeApp } from '@capacitor/app';
import { StatusBar, Style } from '@capacitor/status-bar';

import { EASE_OUT, useMediaQuery, Sheet, Icon, hasOpenLayer } from './components/ui.jsx';
import { TodayView } from './components/Today.jsx';
import { StatsView } from './components/Stats.jsx';
import { HabitSheet } from './components/HabitSheet.jsx';
import { HabitDetail } from './components/HabitDetail.jsx';
import { TimerSheet } from './components/TimerSheet.jsx';
import { ManageSheet } from './components/ManageSheet.jsx';
import { Toast, Celebration } from './components/Overlays.jsx';
import { Rail, ListsPanel, ListsDrawer, TabBar, Fab, visibleModules } from './components/Nav.jsx';
import { SettingsPage, SettingsButton } from './components/SettingsPage.jsx';
import { RitualSheet, WhatNowSheet, TemplateSheet, FilterSheet } from './components/Planner.jsx';
import { LockScreen } from './components/LockScreen.jsx';
import { useAppearance } from './lib/appearance.js';
import { useNativeBridges } from './lib/nativeBridges.js';
import { setNavTheme } from './lib/ritmoNative.js';
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
import { startAmbient, stopAmbient } from './lib/sound.js';
import { isNative } from './lib/native.js';

const UI_KEY = 'ritmo.ui';
const loadUi = () => {
  try {
    return JSON.parse(localStorage.getItem(UI_KEY)) || {};
  } catch (e) {
    return {};
  }
};

function QuickAddHelp() {
  const [open, setOpen] = useState(false);
  return (
    <div className="qa-help">
      <button type="button" className="btn-link self-start" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <Icon name="CircleHelp" size={14} /> O que dá para escrever
      </button>
      {open && (
        <ul className="qa-help-list">
          <li><b>sexta 9h</b>, <b>dia 15</b>, <b>em 3 dias</b>: data e hora</li>
          <li><b>todo quinto dia útil</b>, <b>toda última sexta</b>, <b>a cada 2 semanas na terça</b></li>
          <li><b>3 dias depois de concluir</b>: repete a partir de quando você fizer</li>
          <li><b>até sexta</b>: prazo final · <b>algum dia</b>: sem pressa</li>
          <li><b>!1</b> prioridade · <b>#etiqueta</b> · <b>^lista</b> · <b>~leve</b> energia · <b>~30min</b></li>
          <li><b>R$ 120</b>: valor da conta · <b>@agenda</b>: vira compromisso</li>
          <li>Cole várias linhas para criar várias tarefas</li>
        </ul>
      )}
    </div>
  );
}

const blankHabit = () =>
  normalizeHabit({ id: '', name: '', icon: 'Sprout', color: 'cobalt', period: 'morning', days: ALL_DAYS, target: 1, unit: '', createdAt: keyOf(todayDate()) });

export default function App() {
  const desktop = useMediaQuery('(min-width: 1024px)');
  const wide = useMediaQuery('(min-width: 1280px)');
  const store = useRitmoStore();
  const { data, today } = store;
  const todayKey = keyOf(today);

  // Abre na tela inicial escolhida nos Ajustes (ou na última usada, se não houver escolha)
  const [module, setModule] = useState(() => (store.settings.startModule && store.data.settings && store.data.settings.startModule) || loadUi().module || 'tasks');
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
  const [timerOpen, setTimerOpen] = useState(false);
  // Ajustes é uma página inteira: null = fechada, ou a aba aberta
  const [settingsTab, setSettingsTab] = useState(null);
  const settingsOpen = !!settingsTab;
  const openSettings = useCallback((tab = null) => setSettingsTab(tab || 'menu'), []);
  const [ritual, setRitual] = useState(null); // 'plan' | 'shutdown' | 'review'
  const [whatNowOpen, setWhatNowOpen] = useState(false);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [filterSheet, setFilterSheet] = useState(null); // { filter? }
  const scrollRef = useRef(null);
  const settingsBackRef = useRef(null);
  const modules = store.settings.modules;
  const resolvedTheme = useAppearance(store.settings);
  // Tocar numa notificação abre a tarefa, o evento ou o hábito
  const locked = useNativeBridges(store, todayKey, {
    onOpenTask: (id) => {
      setSettingsTab(null);
      setModule('tasks');
      setTaskId(id);
    },
    onOpenEvent: (ev) => {
      setSettingsTab(null);
      setEventSheet(ev);
    },
    onOpenHabit: (h) => {
      setSettingsTab(null);
      setModule('habits');
      setHabitDetail({ habitId: h.id, dayKey: keyOf(todayDate()) });
    },
  });

  // Módulo desligado nos Ajustes: volta para o primeiro visível
  useEffect(() => {
    if (!modules.includes(module) && !(module === 'stats' && modules.includes('habits'))) setModule(modules[0]);
  }, [modules, module]);

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
    if (view.startsWith('filter:') && !viewMeta(view, data).filter) setView('today');
  }, [view, data]);
  useEffect(() => {
    if (store.recovery) setSettingsTab('account');
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

  const ui = {
    taskId, drawer, quickAdd, listSheet, eventSheet, create, search, habitSheet, habitDetail, manageOpen, timerOpen, module,
    celebration: store.celebration, settingsOpen, ritual, whatNowOpen, templatesOpen, filterSheet, modules,
  };
  const uiRef = useRef(ui);
  uiRef.current = ui;

  const goModule = useCallback((m) => {
    if (uiRef.current.settingsOpen) {
      setSettingsTab(null);
      setModule(m);
      scrollRef.current && scrollRef.current.scrollTo({ top: 0 });
      return;
    }
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
    setWhatNowOpen(false);
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
      } else if (e.key === ',') {
        e.preventDefault();
        setSettingsTab((t) => t || 'menu');
      } else {
        const m = visibleModules(uiRef.current.modules).find((x) => x.key === e.key);
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
      else if (s.filterSheet) setFilterSheet(null);
      else if (s.templatesOpen) setTemplatesOpen(false);
      else if (s.whatNowOpen) setWhatNowOpen(false);
      else if (s.ritual) setRitual(null);
      else if (s.settingsOpen) {
        if (!(settingsBackRef.current && settingsBackRef.current())) setSettingsTab(null);
      }
      else if (s.timerOpen) setTimerOpen(false);
      else if (s.create) setCreate(null);
      else if (s.eventSheet) setEventSheet(null);
      else if (s.habitSheet) setHabitSheet(null);
      else if (s.listSheet) setListSheet(null);
      else if (s.quickAdd) setQuickAdd(null);
      else if (s.habitDetail) setHabitDetail(null);
      else if (s.taskId) setTaskId(null);
      else if (s.manageOpen) setManageOpen(false);
      else if (s.drawer) setDrawer(false);
      else if (s.module !== s.modules[0]) setModule(s.modules[0]);
      else NativeApp.minimizeApp();
    });
    return () => {
      Promise.resolve(handle).then((h) => h && h.remove && h.remove());
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Barra de status do Android acompanha o tema efetivo
  useEffect(() => {
    if (!isNative) return;
    const dark = resolvedTheme !== 'light';
    StatusBar.setStyle({ style: dark ? Style.Dark : Style.Light }).catch(() => {});
    StatusBar.setBackgroundColor({ color: resolvedTheme === 'black' ? '#000000' : dark ? '#0F1412' : '#ECEFE9' }).catch(() => {});
    // Barra de navegação (gestos) na mesma cor, em vez do branco padrão do Android
    setNavTheme(resolvedTheme);
  }, [resolvedTheme]);

  const accountButton = !desktop && <SettingsButton status={store.syncStatus} onClick={() => openSettings()} />;
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
  const focusPhase = store.focus.state.phase;
  // Som ambiente: toca enquanto o foco (ou cronômetro) está rodando
  useEffect(() => {
    const on = focusRunning && (focusPhase === 'focus' || focusPhase === 'stopwatch') && store.device.ambient && store.device.ambient !== 'off';
    if (on) startAmbient(store.device.ambient, store.device.ambientVolume ?? 0.5);
    else stopAmbient();
    return undefined;
  }, [focusRunning, focusPhase, store.device.ambient]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => stopAmbient(), []);
  const panelMode = desktop && wide && module === 'tasks' && !settingsOpen;
  const anyOverlay = !!(
    quickAdd || listSheet || eventSheet || create || habitSheet || habitDetail || manageOpen || timerOpen || (task && !panelMode) ||
    ritual || whatNowOpen || templatesOpen || filterSheet
  );
  const detailHabit = habitDetail && data.habits.find((h) => h.id === habitDetail.habitId);
  const timer = store.habits.timer;
  const timerHabit = timer && data.habits.find((h) => h.id === timer.habitId);
  const showFab = !desktop && !settingsOpen && module !== 'focus' && module !== 'stats';

  let content;
  if (settingsOpen)
    content = (
      <SettingsPage
        desktop={desktop}
        store={store}
        todayKey={todayKey}
        initial={settingsTab === 'menu' ? null : settingsTab}
        backRef={settingsBackRef}
        onBack={desktop ? null : () => setSettingsTab(null)}
        onSignedOut={() => setSettingsTab('account')}
      />
    );
  else if (module === 'tasks')
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
        onRitual={setRitual}
        onWhatNow={() => setWhatNowOpen(true)}
        onEditFilter={(f) => setFilterSheet({ filter: f })}
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
        onMinimal={(h) => store.habits.checkMinimal(h, habitDay)}
        onDay={store.habits.setDay}
        timer={timer}
        title="Hábitos"
        desktop={desktop}
        onStats={() => goModule('stats')}
        headerRight={
          <>
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
        onOpenTask={openTask}
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
          <Rail
            module={module}
            modules={modules}
            onModule={goModule}
            onSearch={() => setSearch(true)}
            onSettings={() => (settingsOpen ? setSettingsTab(null) : openSettings())}
            settingsOpen={settingsOpen}
            name={data.name}
            status={store.syncStatus}
            focusRunning={focusRunning}
          />
        )}
        {desktop && module === 'tasks' && !settingsOpen && (
          <aside className="lists-col" aria-label="Listas">
            <div className="lists-col-head">
              <span>Tarefas</span>
              <span className="lists-col-date first-up">{fmtLong.format(today)}</span>
            </div>
            <ListsPanel
              data={data}
              view={view}
              todayKey={todayKey}
              onView={setView}
              onNewList={() => setListSheet({})}
              onNewFilter={() => setFilterSheet({})}
              onEditFilter={(f) => setFilterSheet({ filter: f })}
              onTemplates={() => setTemplatesOpen(true)}
              store={store}
            />
          </aside>
        )}

        <main ref={scrollRef} className={`scroll${anyOverlay && !desktop ? ' is-locked' : ''}`}>
          <motion.div key={settingsOpen ? 'settings' : module} className={`page is-${settingsOpen ? 'settings' : module}`} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.16, ease: EASE_OUT }}>
            {content}
          </motion.div>
        </main>

        <AnimatePresence>
          {panelMode && task && (
            <TaskPanel key="panel" task={task} data={data} todayKey={todayKey} desktop={desktop} store={store} onClose={() => setTaskId(null)} onFocus={focusTask} />
          )}
        </AnimatePresence>

        {!desktop && <TabBar module={settingsOpen ? null : module} modules={modules} onModule={goModule} focusRunning={focusRunning} />}
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
            onNewFilter={() => setFilterSheet({})}
            onEditFilter={(f) => setFilterSheet({ filter: f })}
            onTemplates={() => setTemplatesOpen(true)}
            store={store}
          />
        )}

        <AnimatePresence>
          {!panelMode && task && <TaskSheet key="task" task={task} data={data} todayKey={todayKey} desktop={desktop} store={store} onClose={() => setTaskId(null)} onFocus={focusTask} />}
        </AnimatePresence>

        <AnimatePresence>
          {quickAdd && (
            <Sheet key="qa" desktop={desktop} title="Nova tarefa" onClose={() => setQuickAdd(null)} className="is-compact">
              <QuickAdd
                data={data}
                view={quickAdd.view}
                todayKey={todayKey}
                desktop={false}
                autoFocus
                onAdd={(fields) => store.tasks.add(fields)}
                onAddMany={(items) => {
                  store.tasks.addMany(items);
                  setQuickAdd(null);
                }}
                onAddEvent={(ev) => {
                  store.events.save(ev);
                  setQuickAdd(null);
                }}
              />
              <QuickAddHelp />
            </Sheet>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {listSheet && (
            <ListSheet
              key="list"
              desktop={desktop}
              initial={listSheet.list}
              data={data}
              store={store}
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
              store={store}
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
          {ritual && <RitualSheet key={`ritual-${ritual}`} mode={ritual} desktop={desktop} store={store} todayKey={todayKey} onClose={() => setRitual(null)} onOpenTask={(id) => setTaskId(id)} />}
        </AnimatePresence>
        <AnimatePresence>
          {whatNowOpen && (
            <WhatNowSheet
              key="whatnow"
              desktop={desktop}
              store={store}
              onClose={() => setWhatNowOpen(false)}
              onOpenTask={(id) => {
                setWhatNowOpen(false);
                setTaskId(id);
              }}
              onFocus={focusTask}
            />
          )}
        </AnimatePresence>
        <AnimatePresence>
          {templatesOpen && (
            <TemplateSheet key="tpl" desktop={desktop} store={store} todayKey={todayKey} defaultListId={view.startsWith('list:') ? view.slice(5) : 'inbox'} onClose={() => setTemplatesOpen(false)} />
          )}
        </AnimatePresence>
        <AnimatePresence>
          {filterSheet && (
            <FilterSheet
              key={(filterSheet.filter && filterSheet.filter.id) || 'new-filter'}
              desktop={desktop}
              store={store}
              todayKey={todayKey}
              initial={filterSheet.filter}
              onClose={() => setFilterSheet(null)}
              onSaved={(f) => {
                setFilterSheet(null);
                setView(`filter:${f.id}`);
                setModule('tasks');
              }}
            />
          )}
        </AnimatePresence>
        {locked && <LockScreen onUnlock={locked.unlock} />}

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
