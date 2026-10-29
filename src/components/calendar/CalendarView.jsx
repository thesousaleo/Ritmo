import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Icon, Segmented, TaskCheck, EASE_OUT } from '../ui.jsx';
import { PageHeader } from '../Today.jsx';
import { TaskRow } from '../tasks/TaskRow.jsx';
import { colorOf, keyOf, fromKey, addDays, activeHabits, isListed, countOf } from '../../lib/habits.js';
import { monthGrid, monthTitle, rangeDays, itemsByDay, blockRange, layoutBlocks, snap, MONTHS_LONG, weekStartOf } from '../../lib/calendar.js';
import { dayLabel, hhmm, minutesOf, priorityOf } from '../../lib/tasks.js';
import { dragProps, useDragMonitor } from '../../lib/dnd.js';
import { holidayOn } from '../../lib/holidays.js';
import { fmtTime, weekOrder } from '../../lib/prefs.js';
import { freeSlots } from '../../lib/plan.js';
import { yearActivity } from '../../lib/insights.js';
import { fmtMinutes } from '../../lib/focus.js';

const WD = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const MODE_KEY = 'ritmo.calmode';
const ZOOM_KEY = 'ritmo.calzoom';
const loadZoom = (desktop) => {
  try {
    const v = Number(localStorage.getItem(ZOOM_KEY));
    if (v >= 28 && v <= 128) return v;
  } catch (e) {
    /* sem storage */
  }
  return desktop ? 52 : 48;
};
/** Altura de uma hora na tela, medida do próprio elemento (vale com zoom de texto e de pinça). */
const hourPx = (el) => el.getBoundingClientRect().height / 24;
const holidayOf = (settings, k) => (settings.showHolidays === false ? null : holidayOn(k));
const loadMode = () => {
  try {
    return localStorage.getItem(MODE_KEY) || 'month';
  } catch (e) {
    return 'month';
  }
};

function EventChip({ occ, onOpen, dense, day }) {
  const ev = occ.ev;
  return (
    <div
      className={`mitem is-event${dense ? ' is-dense' : ''}`}
      style={{ '--c': colorOf(ev.color).value }}
      onClick={(e) => {
        e.stopPropagation();
        onOpen(occ);
      }}
      role="button"
      tabIndex={0}
      {...dragProps({ type: 'event', id: ev.id }, null, { disabled: !!ev.repeat })}
    >
      {!ev.allDay && (!day || occ.date === day) && <span className="mitem-time">{fmtTime(ev.start)}</span>}
      <span className="mitem-title">{ev.title}</span>
    </div>
  );
}

function TaskChip({ task, onOpen, onToggle }) {
  return (
    <div
      className={`mitem is-task${task.done ? ' is-done' : ''}`}
      style={{ '--pc': priorityOf(task.priority).color }}
      onClick={(e) => {
        e.stopPropagation();
        onOpen(task.id);
      }}
      role="button"
      tabIndex={0}
      {...dragProps({ type: 'task', id: task.id })}
    >
      <button
        type="button"
        className="mitem-check"
        onClick={(e) => {
          e.stopPropagation();
          onToggle(task.id);
        }}
        aria-label={task.done ? `Reabrir ${task.title}` : `Concluir ${task.title}`}
      >
        {task.done && <Icon name="Check" size={9} strokeWidth={3.5} />}
      </button>
      {task.time && <span className="mitem-time">{fmtTime(task.time)}</span>}
      <span className="mitem-title">{task.title}</span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Lista de um dia (abaixo do mês no celular, ao lado no desktop)      */
/* ------------------------------------------------------------------ */
function DayList({ dayKey, todayKey, items, data, store, onOpenTask, onOpenEvent, onCreate }) {
  const { events, tasks } = items || { events: [], tasks: [] };
  const empty = !events.length && !tasks.length;
  const hol = holidayOf(store.settings, dayKey);
  return (
    <section className="daylist" aria-label={`Itens de ${dayLabel(dayKey, todayKey)}`}>
      <header className="daylist-head">
        <h2>
          {dayLabel(dayKey, todayKey)}
          <span className="daylist-date"> {fromKey(dayKey).getDate()} de {MONTHS_LONG[fromKey(dayKey).getMonth()]}</span>
          {hol && <span className={`hol-tag is-${hol.kind}`}>{hol.name}</span>}
        </h2>
        <button type="button" className="icon-btn" onClick={() => onCreate({ date: dayKey })} aria-label="Adicionar neste dia">
          <Icon name="Plus" size={17} />
        </button>
      </header>
      {empty && <p className="daylist-empty">Dia livre. Toque em + para adicionar uma tarefa ou evento.</p>}
      {events.map((o) => (
        <button key={o.id} type="button" className="ev-row" style={{ '--c': colorOf(o.ev.color).value }} onClick={() => onOpenEvent(o)}>
          <span className="ev-row-bar" />
          <span className="ev-row-time">{o.ev.allDay ? 'Dia todo' : o.date === dayKey ? `${fmtTime(o.ev.start)}${o.ev.end && o.endDate === dayKey ? `\n${fmtTime(o.ev.end)}` : ''}` : 'Continua'}</span>
          <span className="min-w-0 flex-1">
            <span className="ev-row-title">{o.ev.title}</span>
            {(o.ev.location || o.ev.repeat) && (
              <span className="ev-row-sub">
                {o.ev.repeat && <Icon name="Repeat" size={11} />} {o.ev.location}
              </span>
            )}
          </span>
        </button>
      ))}
      {tasks.length > 0 && (
        <div className="group daylist-tasks">
          {tasks.map((t) => (
            <TaskRow key={t.id} task={t} data={data} todayKey={todayKey} onToggle={store.tasks.toggle} onOpen={onOpenTask} hideDate showList />
          ))}
        </div>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Mês                                                                 */
/* ------------------------------------------------------------------ */
function MonthView({ cursor, selected, onSelect, todayKey, data, store, desktop, onOpenTask, onOpenEvent, onCreate, dir }) {
  const c = fromKey(cursor);
  const grid = monthGrid(c.getFullYear(), c.getMonth());
  const map = useMemo(() => itemsByDay(data, grid[0].key, grid[41].key), [data, grid[0].key]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className={`month-wrap${desktop ? ' is-desktop' : ''}`}>
      <div className="month">
        <div className="month-wd" aria-hidden="true">
          {weekOrder().map((i) => (
            <span key={i}>{desktop ? WD[i] : WD[i][0].toUpperCase()}</span>
          ))}
        </div>
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.div
            key={`${c.getFullYear()}-${c.getMonth()}`}
            className="month-grid"
            initial={{ opacity: 0, x: dir * 16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: dir * -16, transition: { duration: 0.12 } }}
            transition={{ duration: 0.18, ease: EASE_OUT }}
          >
            {grid.map((d) => {
              const it = map.get(d.key) || { events: [], tasks: [] };
              const all = [...it.events.map((o) => ({ k: 'e', o })), ...it.tasks.map((t) => ({ k: 't', t }))];
              const max = 3;
              const hol = holidayOf(store.settings, d.key);
              return (
                <div
                  key={d.key}
                  className={`mcell${d.inMonth ? '' : ' is-out'}${d.key === todayKey ? ' is-today' : ''}${d.key === selected ? ' is-selected' : ''}${hol ? ' is-holiday' : ''}`}
                  title={hol ? hol.name : undefined}
                  data-drop
                  data-day={d.key}
                  onClick={() => onSelect(d.key)}
                  onDoubleClick={() => onCreate({ date: d.key })}
                  role="gridcell"
                  aria-selected={d.key === selected}
                  aria-label={`${d.date.getDate()} de ${MONTHS_LONG[d.date.getMonth()]}${all.length ? `, ${all.length} itens` : ''}`}
                >
                  <span className="mcell-num">{d.date.getDate()}</span>
                  {desktop && hol && <span className="mcell-hol">{hol.name}</span>}
                  {desktop ? (
                    <div className="mcell-items">
                      {all.slice(0, max).map((x) =>
                        x.k === 'e' ? <EventChip key={x.o.id} occ={x.o} onOpen={onOpenEvent} day={d.key} /> : <TaskChip key={x.t.id} task={x.t} onOpen={onOpenTask} onToggle={store.tasks.toggle} />
                      )}
                      {all.length > max && <span className="mcell-more">+{all.length - max}</span>}
                    </div>
                  ) : (
                    <div className="mcell-dots" aria-hidden="true">
                      {all.slice(0, 4).map((x, i) => (
                        <i key={i} style={{ background: x.k === 'e' ? colorOf(x.o.ev.color).value : x.t.done ? 'var(--line-strong)' : 'var(--ink)' }} />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </motion.div>
        </AnimatePresence>
      </div>
      <DayList dayKey={selected} todayKey={todayKey} items={map.get(selected) || itemsByDay(data, selected, selected).get(selected)} data={data} store={store} onOpenTask={onOpenTask} onOpenEvent={onOpenEvent} onCreate={onCreate} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Grade de horários (semana, 3 dias, dia)                             */
/* ------------------------------------------------------------------ */
function TimeGrid({ days, todayKey, data, store, desktop, onOpenTask, onOpenEvent, onCreate, onPickDay, hover, unscheduled, HOUR, setHour }) {
  const scrollRef = useRef(null);
  const settings = store.settings;
  const hourRef = useRef(HOUR);
  hourRef.current = HOUR;
  const setHourRef = useRef(setHour);
  setHourRef.current = setHour;

  // Zoom: Ctrl + rolagem no computador, pinça com dois dedos no celular
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return undefined;
    const clamp = (v) => Math.max(28, Math.min(128, Math.round(v)));
    const onWheel = (e) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      setHourRef.current((h) => clamp(h * (e.deltaY < 0 ? 1.1 : 0.9)));
    };
    // Pinça: eventos de toque (não são cancelados pela rolagem do navegador)
    let base = null;
    const spread = (e) => Math.abs(e.touches[0].clientY - e.touches[1].clientY) || 1;
    const onStart = (e) => {
      if (e.touches.length === 2) base = { d: spread(e), h: hourRef.current };
    };
    const onTouchMove = (e) => {
      if (e.touches.length !== 2 || !base) return;
      e.preventDefault();
      setHourRef.current(clamp((base.h * spread(e)) / base.d));
    };
    const onEnd = (e) => {
      if (e.touches.length < 2) base = null;
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', onEnd);
    el.addEventListener('touchcancel', onEnd);
    return () => {
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onEnd);
      el.removeEventListener('touchcancel', onEnd);
    };
  }, []);
  const map = useMemo(() => itemsByDay(data, days[0], days[days.length - 1]), [data, days.join()]); // eslint-disable-line react-hooks/exhaustive-deps
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(id);
  }, []);
  const nowMin = now.getHours() * 60 + now.getMinutes();

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const start = days.includes(todayKey) ? Math.max(0, nowMin - 90) : 7 * 60;
    el.scrollTop = (start / 60) * HOUR;
  }, [days.join()]); // eslint-disable-line react-hooks/exhaustive-deps

  const blocksFor = (key) => {
    const it = map.get(key) || { events: [], tasks: [] };
    const raw = [];
    for (const o of it.events) {
      const r = blockRange({ kind: 'event', occ: o }, key);
      if (r) raw.push({ id: `e-${o.id}`, start: r[0], end: r[1], kind: 'event', occ: o });
    }
    for (const t of it.tasks) {
      const r = blockRange({ kind: 'task', task: t }, key);
      if (r) raw.push({ id: `t-${t.id}`, start: r[0], end: r[1], kind: 'task', task: t });
    }
    // Hábitos com horário de lembrete aparecem como blocos leves (opcional nos Ajustes)
    if (settings.calendarHabits) {
      const d = fromKey(key);
      for (const h of activeHabits(data)) {
        if (!h.reminder || !isListed(h, d)) continue;
        const s0 = minutesOf(h.reminder);
        raw.push({ id: `h-${h.id}`, start: s0, end: s0 + Math.max(15, h.duration || 20), kind: 'habit', habit: h, done: countOf(data.log, key, h.id) >= h.target });
      }
    }
    return layoutBlocks(raw);
  };
  // Horários livres: no dia e nos 3 dias; na semana inteira só hoje, para a grade não ficar carregada
  const gapsFor = (key) =>
    settings.calendarGaps && key >= todayKey && (days.length <= 3 || key === todayKey) ? freeSlots(data, key, settings, key === todayKey ? now : null, 45) : [];
  const allDayFor = (key) => {
    const it = map.get(key) || { events: [], tasks: [] };
    return { events: it.events.filter((o) => o.ev.allDay || o.date !== key), tasks: it.tasks.filter((t) => !t.time) };
  };

  return (
    <div className={`tg${unscheduled ? ' has-side' : ''}`}>
      <div className="tg-main">
        <div className="tg-head" style={{ gridTemplateColumns: `52px repeat(${days.length}, 1fr)` }}>
          <span />
          {days.map((k) => {
            const d = fromKey(k);
            const hol = holidayOf(settings, k);
            return (
              <button key={k} type="button" className={`tg-day${k === todayKey ? ' is-today' : ''}${hol ? ' is-holiday' : ''}`} onClick={() => onPickDay(k)} title={hol ? hol.name : undefined}>
                <span className="tg-wd">{WD[d.getDay()]}</span>
                <span className="tg-num">{d.getDate()}</span>
                {hol && days.length <= 3 && <span className="tg-hol">{hol.name}</span>}
              </button>
            );
          })}
        </div>
        <div className="tg-allday" style={{ gridTemplateColumns: `52px repeat(${days.length}, 1fr)` }}>
          <span className="tg-allday-label">Dia todo</span>
          {days.map((k) => {
            const a = allDayFor(k);
            return (
              <div key={k} className="tg-lane" data-drop data-day={k} data-allday onDoubleClick={() => onCreate({ date: k })}>
                {a.events.map((o) => (
                  <EventChip key={o.id} occ={o} onOpen={onOpenEvent} dense day={k} />
                ))}
                {a.tasks.map((t) => (
                  <TaskChip key={t.id} task={t} onOpen={onOpenTask} onToggle={store.tasks.toggle} />
                ))}
              </div>
            );
          })}
        </div>
        <div className="tg-scroll" ref={scrollRef} data-autoscroll>
          <div className="tg-body" style={{ height: 24 * HOUR, gridTemplateColumns: `52px repeat(${days.length}, 1fr)`, '--hour': `${HOUR}px` }}>
            <div className="tg-hours" aria-hidden="true">
              {Array.from({ length: 23 }, (_, i) => (
                <span key={i} style={{ top: (i + 1) * HOUR }}>
                  {fmtTime(`${String(i + 1).padStart(2, '0')}:00`).replace(':00 ', ' ')}
                </span>
              ))}
            </div>
            {days.map((k) => (
              <div
                key={k}
                className="tg-col"
                data-drop
                data-slot-day={k}
                onClick={(e) => {
                  if (e.target !== e.currentTarget && !e.target.classList.contains('gap')) return;
                  const r = e.currentTarget.getBoundingClientRect();
                  onCreate({ date: k, time: hhmm(snap(((e.clientY - r.top) / hourPx(e.currentTarget)) * 60)) });
                }}
              >
                {gapsFor(k).map((g) => (
                  <div key={`g${g.start}`} className="gap" style={{ top: (g.start / 60) * HOUR, height: ((g.end - g.start) / 60) * HOUR - 2 }} aria-hidden="true">
                    {(g.end - g.start) / 60 * HOUR > 30 && <span>Livre · {fmtMinutes(g.end - g.start)}</span>}
                  </div>
                ))}
                {blocksFor(k).map((b) => {
                  const top = (b.start / 60) * HOUR;
                  const height = Math.max(18, ((b.end - b.start) / 60) * HOUR - 2);
                  const style = { top, height, left: `calc(${(b.col / b.cols) * 100}% + 2px)`, width: `calc(${100 / b.cols}% - 4px)` };
                  if (b.kind === 'habit') {
                    const h = b.habit;
                    return (
                      <div
                        key={b.id}
                        className={`blk is-habit${b.done ? ' is-done' : ''}${height < 34 ? ' is-short' : ''}`}
                        style={{ ...style, '--c': colorOf(h.color).value }}
                        onClick={() => k === todayKey && store.habits.toggle(h, k)}
                        role="button"
                        tabIndex={0}
                        title={k === todayKey ? 'Tocar para marcar' : h.name}
                      >
                        <span className="blk-title">
                          <Icon name={b.done ? 'CircleCheck' : h.icon} size={13} /> {h.name}
                        </span>
                      </div>
                    );
                  }
                  if (b.kind === 'event') {
                    const ev = b.occ.ev;
                    return (
                      <div
                        key={b.id}
                        className={`blk is-event${height < 34 ? ' is-short' : ''}`}
                        style={{ ...style, '--c': colorOf(ev.color).value }}
                        onClick={() => onOpenEvent(b.occ)}
                        role="button"
                        tabIndex={0}
                        {...dragProps({ type: 'event', id: ev.id, minutes: b.end - b.start }, null, { disabled: !!ev.repeat || b.occ.date !== b.occ.endDate })}
                      >
                        <span className="blk-title">{ev.title}</span>
                        <span className="blk-time">
                          {fmtTime(hhmm(b.start))}–{fmtTime(hhmm(b.end % 1440))}
                          {ev.location ? `, ${ev.location}` : ''}
                        </span>
                      </div>
                    );
                  }
                  const t = b.task;
                  return (
                    <div
                      key={b.id}
                      className={`blk is-task${t.done ? ' is-done' : ''}${height < 34 ? ' is-short' : ''}`}
                      style={{ ...style, '--pc': priorityOf(t.priority).color }}
                      onClick={() => onOpenTask(t.id)}
                      role="button"
                      tabIndex={0}
                      {...dragProps({ type: 'task', id: t.id, minutes: b.end - b.start })}
                    >
                      <span className="blk-title">
                        <TaskCheck checked={t.done} priority={t.priority} size={14} onToggle={() => store.tasks.toggle(t.id)} label={`Concluir ${t.title}`} />
                        {t.title}
                      </span>
                      {height >= 34 && <span className="blk-time">{fmtTime(t.time)}</span>}
                    </div>
                  );
                })}
                {hover && hover.day === k && (
                  <div className="blk-preview" style={{ top: (hover.min / 60) * HOUR, height: Math.max(18, (hover.len / 60) * HOUR - 2) }}>
                    {fmtTime(hhmm(hover.min))}
                  </div>
                )}
                {k === todayKey && (
                  <div className="now-line" style={{ top: (nowMin / 60) * HOUR }} aria-hidden="true">
                    <i />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
      {unscheduled && (
        <aside className="tg-side" aria-label="Tarefas sem data">
          <h3 className="tg-side-title">Sem data</h3>
          <p className="field-hint">Arraste para um horário ou dia.</p>
          <div className="tg-side-list">
            {unscheduled.length === 0 && <p className="field-hint">Nenhuma tarefa sem data.</p>}
            {unscheduled.map((t) => (
              <div key={t.id} className="tg-side-item" {...dragProps({ type: 'task', id: t.id, minutes: 30 })} onClick={() => onOpenTask(t.id)} role="button" tabIndex={0}>
                <i style={{ background: priorityOf(t.priority).color }} />
                <span className="truncate">{t.title}</span>
              </div>
            ))}
          </div>
        </aside>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Ano: 12 meses pequenos com a intensidade de cada dia                */
/* ------------------------------------------------------------------ */
function YearView({ year, todayKey, data, settings, onPickDay }) {
  const { map, max } = useMemo(() => yearActivity(data, year), [data, year]);
  const order = weekOrder();
  return (
    <div className="year">
      {Array.from({ length: 12 }, (_, m) => {
        const grid = monthGrid(year, m);
        const rows = grid.slice(35).some((d) => d.inMonth) ? 42 : 35;
        return (
          <section key={m} className="ymonth" aria-label={MONTHS_LONG[m]}>
            <h3 className="ymonth-title">{MONTHS_LONG[m]}</h3>
            <div className="ymonth-wd" aria-hidden="true">
              {order.map((i) => (
                <span key={i}>{WD[i][0].toUpperCase()}</span>
              ))}
            </div>
            <div className="ymonth-grid">
              {grid.slice(0, rows).map((d) => {
                if (!d.inMonth) return <span key={d.key} className="yday is-out" />;
                const v = map.get(d.key) || 0;
                const level = v ? Math.min(4, Math.ceil((v / max) * 4)) : 0;
                const hol = holidayOf(settings, d.key);
                return (
                  <button
                    key={d.key}
                    type="button"
                    className={`yday l${level}${d.key === todayKey ? ' is-today' : ''}${hol ? ' is-holiday' : ''}`}
                    onClick={() => onPickDay(d.key)}
                    title={`${d.date.getDate()} de ${MONTHS_LONG[m]}${hol ? ` · ${hol.name}` : ''}`}
                  >
                    {d.date.getDate()}
                  </button>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Lista (próximos 30 dias)                                            */
/* ------------------------------------------------------------------ */
function AgendaList({ todayKey, data, store, onOpenTask, onOpenEvent, onCreate }) {
  const end = keyOf(addDays(fromKey(todayKey), 29));
  const map = useMemo(() => itemsByDay(data, todayKey, end), [data, todayKey, end]);
  const days = [...map.entries()].filter(([, v]) => v.events.length || v.tasks.some((t) => !t.done));
  if (!days.length) return <p className="daylist-empty">Nada nos próximos 30 dias.</p>;
  return (
    <div className="agenda-list">
      {days.map(([k, v]) => (
        <DayList key={k} dayKey={k} todayKey={todayKey} items={{ events: v.events, tasks: v.tasks.filter((t) => !t.done) }} data={data} store={store} onOpenTask={onOpenTask} onOpenEvent={onOpenEvent} onCreate={onCreate} />
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Agenda                                                              */
/* ------------------------------------------------------------------ */
export function CalendarView({ store, todayKey, desktop, onOpenTask, onOpenEvent, onCreate, headerRight }) {
  const data = store.data;
  const [mode, setModeState] = useState(loadMode);
  const [cursor, setCursor] = useState(todayKey);
  const [selected, setSelected] = useState(todayKey);
  const [dir, setDir] = useState(0);
  const [hover, setHover] = useState(null);
  const [HOUR, setHourState] = useState(() => loadZoom(desktop));
  const setHour = (fn) =>
    setHourState((h) => {
      const v = typeof fn === 'function' ? fn(h) : fn;
      try {
        localStorage.setItem(ZOOM_KEY, String(v));
      } catch (e) {
        /* sem storage */
      }
      return v;
    });
  const span = mode === 'week' ? (desktop ? 7 : 3) : 1;

  const setMode = (m) => {
    setModeState(m);
    try {
      localStorage.setItem(MODE_KEY, m);
    } catch (e) {
      /* sem storage */
    }
  };

  const days = useMemo(() => {
    if (mode === 'week' && desktop) return rangeDays(keyOf(weekStartOf(fromKey(cursor))), 7);
    if (mode === 'week') return rangeDays(cursor, 3);
    return [cursor];
  }, [mode, cursor, desktop]);

  const step = (n) => {
    setDir(n);
    const c = fromKey(cursor);
    if (mode === 'year') setCursor(keyOf(new Date(c.getFullYear() + n, 0, 1)));
    else if (mode === 'month') {
      const d = new Date(c.getFullYear(), c.getMonth() + n, 1);
      setCursor(keyOf(d));
      setSelected(keyOf(d.getMonth() === fromKey(todayKey).getMonth() && d.getFullYear() === fromKey(todayKey).getFullYear() ? fromKey(todayKey) : d));
    } else setCursor(keyOf(addDays(c, n * (mode === 'week' ? span : 1))));
  };
  const goToday = () => {
    setDir(cursor < todayKey ? 1 : -1);
    setCursor(todayKey);
    setSelected(todayKey);
  };

  // Arrastar e soltar: horário, dia inteiro ou dia do mês
  useDragMonitor((e) => {
    if (!e.data || (e.data.type !== 'task' && e.data.type !== 'event')) return;
    const t = e.target;
    const minutesAt = () => {
      const r = t.getBoundingClientRect();
      return snap(((e.y - e.offY - r.top) / (r.height / 24)) * 60);
    };
    if (e.phase === 'move') {
      if (t && t.dataset.slotDay) setHover({ day: t.dataset.slotDay, min: minutesAt(), len: e.data.minutes || 30 });
      else if (hover) setHover(null);
      return;
    }
    if (e.phase === 'cancel') return setHover(null);
    if (e.phase !== 'drop') return;
    setHover(null);
    if (!t) return;
    const { slotDay, day, allday } = t.dataset;
    if (slotDay) {
      const time = hhmm(minutesAt());
      if (e.data.type === 'task') {
        const task = data.tasks.find((x) => x.id === e.data.id);
        store.tasks.update(e.data.id, { date: slotDay, time, duration: task && task.duration ? task.duration : 30 });
      } else store.events.move(e.data.id, slotDay, time);
    } else if (day) {
      if (e.data.type === 'task') store.tasks.update(e.data.id, allday !== undefined ? { date: day, time: '' } : { date: day });
      else store.events.move(e.data.id, day);
    }
  });

  const c = fromKey(cursor);
  const title =
    mode === 'year'
      ? String(c.getFullYear())
      : mode === 'month'
      ? monthTitle(c)
      : mode === 'agenda'
        ? 'Próximos 30 dias'
        : days.length > 1
          ? `${fromKey(days[0]).getDate()} ${MONTHS_LONG[fromKey(days[0]).getMonth()].slice(0, 3)} – ${fromKey(days[days.length - 1]).getDate()} ${MONTHS_LONG[fromKey(days[days.length - 1]).getMonth()].slice(0, 3)}`
          : `${dayLabel(cursor, todayKey)}, ${c.getDate()} de ${MONTHS_LONG[c.getMonth()]}`;

  const unscheduled = desktop && (mode === 'week' || mode === 'day') ? data.tasks.filter((t) => !t.done && !t.date).slice(0, 30) : null;
  const isCurrent =
    mode === 'year' ? cursor.slice(0, 4) === todayKey.slice(0, 4) : mode === 'month' ? cursor.slice(0, 7) === todayKey.slice(0, 7) && selected === todayKey : days.includes(todayKey);

  return (
    <div className={`cal is-${mode}`}>
      <PageHeader title={<span className="first-up">{title}</span>}>
        {headerRight}
      </PageHeader>
      <div className="cal-bar">
        <Segmented
          id="calmode"
          label="Visualização"
          value={mode}
          onChange={(m) => {
            setDir(0);
            setMode(m);
            if (m !== 'month') setCursor(selected);
          }}
          options={[
            { id: 'month', label: 'Mês' },
            { id: 'week', label: desktop ? 'Semana' : '3 dias' },
            { id: 'day', label: 'Dia' },
            { id: 'agenda', label: 'Lista' },
            { id: 'year', label: 'Ano' },
          ]}
        />
        {mode !== 'agenda' && (
          <div className="cal-nav">
            {!isCurrent && (
              <button type="button" className="chip-btn sm" onClick={goToday}>
                Hoje
              </button>
            )}
            <button type="button" className="icon-btn" onClick={() => step(-1)} aria-label="Anterior">
              <Icon name="ChevronLeft" size={18} />
            </button>
            <button type="button" className="icon-btn" onClick={() => step(1)} aria-label="Próximo">
              <Icon name="ChevronRight" size={18} />
            </button>
          </div>
        )}
      </div>

      {mode === 'month' && (
        <MonthView
          cursor={cursor}
          selected={selected}
          onSelect={setSelected}
          todayKey={todayKey}
          data={data}
          store={store}
          desktop={desktop}
          onOpenTask={onOpenTask}
          onOpenEvent={onOpenEvent}
          onCreate={onCreate}
          dir={dir}
        />
      )}
      {(mode === 'week' || mode === 'day') && (
        <TimeGrid
          days={days}
          todayKey={todayKey}
          data={data}
          store={store}
          desktop={desktop}
          onOpenTask={onOpenTask}
          onOpenEvent={onOpenEvent}
          onCreate={onCreate}
          onPickDay={(k) => {
            setCursor(k);
            setSelected(k);
            setMode('day');
          }}
          hover={hover}
          unscheduled={unscheduled}
          HOUR={HOUR}
          setHour={setHour}
        />
      )}
      {mode === 'year' && (
        <YearView
          year={c.getFullYear()}
          todayKey={todayKey}
          data={data}
          settings={store.settings}
          onPickDay={(k) => {
            setCursor(k);
            setSelected(k);
            setMode('month');
          }}
        />
      )}
      {mode === 'agenda' && <AgendaList todayKey={todayKey} data={data} store={store} onOpenTask={onOpenTask} onOpenEvent={onOpenEvent} onCreate={onCreate} />}
    </div>
  );
}

export const calendarMinutes = minutesOf;
