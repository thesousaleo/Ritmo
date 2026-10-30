import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Icon, Popover, Sheet, TaskCheck, EASE_OUT } from '../ui.jsx';
import { PageHeader } from '../Today.jsx';
import { TaskRow } from '../tasks/TaskRow.jsx';
import { colorOf, keyOf, fromKey, addDays, activeHabits, isListed, countOf } from '../../lib/habits.js';
import { monthGrid, rangeDays, itemsByDay, blockRange, layoutBlocks, snap, MONTHS_LONG, weekStartOf } from '../../lib/calendar.js';
import { dayLabel, hhmm, minutesOf, priorityOf } from '../../lib/tasks.js';
import { dragProps, useDragMonitor } from '../../lib/dnd.js';
import { holidayOn } from '../../lib/holidays.js';
import { fmtTime, weekOrder } from '../../lib/prefs.js';
import { freeSlots } from '../../lib/plan.js';
import { yearActivity } from '../../lib/insights.js';
import { fmtMinutes } from '../../lib/focus.js';

const WD = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const VIEW_KEY = 'ritmo.calview';
const OLD_MODE_KEY = 'ritmo.calmode';
const FOLD_KEY = 'ritmo.calfold';
const HINT_KEY = 'ritmo.calhint';
const ZOOM_KEY = 'ritmo.calzoom';
const MODES = ['list', 'year', 'month', 'week', 'three', 'day'];
const MODE_LABEL = { list: 'Lista', year: 'Ano', month: 'Mês', week: 'Semana', three: '3 Dias', day: 'Dia' };
const isTimeMode = (m) => m === 'week' || m === 'three' || m === 'day';

const ls = {
  get(k) {
    try {
      return localStorage.getItem(k);
    } catch (e) {
      return null;
    }
  },
  set(k, v) {
    try {
      localStorage.setItem(k, v);
    } catch (e) {
      /* sem storage */
    }
  },
};
const loadZoom = (desktop) => {
  const v = Number(ls.get(ZOOM_KEY));
  if (v >= 28 && v <= 128) return v;
  return desktop ? 52 : 48;
};
/** Visão salva; a chave antiga (Mês/3 dias/Dia/Lista/Ano) vira a nova estrutura. */
const loadMode = () => {
  const v = ls.get(VIEW_KEY);
  if (MODES.includes(v)) return v;
  const old = ls.get(OLD_MODE_KEY);
  if (old === 'week') return 'three';
  if (old === 'day' || old === 'year') return old;
  return 'list';
};
/** Altura de uma hora na tela, medida do próprio elemento (vale com zoom de texto e de pinça). */
const hourPx = (el) => el.getBoundingClientRect().height / 24;
const holidayOf = (settings, k) => (settings.showHolidays === false ? null : holidayOn(k));
const sameMonth = (a, b) => a.slice(0, 7) === b.slice(0, 7);

/* ------------------------------------------------------------------ */
/* Gesto de deslizar (um dedo): troca de mês, semana ou dias           */
/* ------------------------------------------------------------------ */
function useSwipe(ref, handlers, enabled = true) {
  const h = useRef(handlers);
  h.current = handlers;
  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled) return undefined;
    let s = null;
    const onStart = (e) => {
      s = e.touches.length === 1 ? { x: e.touches[0].clientX, y: e.touches[0].clientY, t: Date.now(), dead: false } : null;
    };
    const onMove = (e) => {
      if (!s) return;
      // Dois dedos (pinça) ou arrasto de item: não é deslize
      if (e.touches.length !== 1 || document.body.classList.contains('is-dragging')) s.dead = true;
    };
    const onEnd = (e) => {
      if (!s || s.dead) return (s = null);
      const t = e.changedTouches[0];
      const dx = t.clientX - s.x;
      const dy = t.clientY - s.y;
      const fast = Date.now() - s.t < 600;
      s = null;
      if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy) * 1.6) (dx < 0 ? h.current.left : h.current.right)?.();
      else if (fast && Math.abs(dy) > 36 && Math.abs(dy) > Math.abs(dx) * 1.6) (dy < 0 ? h.current.up : h.current.down)?.();
    };
    const onCancel = () => (s = null);
    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchmove', onMove, { passive: true });
    el.addEventListener('touchend', onEnd);
    el.addEventListener('touchcancel', onCancel);
    return () => {
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchmove', onMove);
      el.removeEventListener('touchend', onEnd);
      el.removeEventListener('touchcancel', onCancel);
    };
  }, [ref, enabled]);
}

/* ------------------------------------------------------------------ */
/* Ícones das visões                                                    */
/* ------------------------------------------------------------------ */
function ModeIcon({ mode, size = 22 }) {
  const p = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' };
  const frame = <rect x="3.5" y="3.5" width="17" height="17" rx="3.5" {...p} />;
  const v = (x) => <line key={`v${x}`} x1={x} y1="3.5" x2={x} y2="20.5" {...p} />;
  const hz = (y) => <line key={`h${y}`} x1="3.5" y1={y} x2="20.5" y2={y} {...p} />;
  let body;
  if (mode === 'list')
    body = (
      <>
        <rect x="3.5" y="3.5" width="17" height="7" rx="2.5" {...p} />
        <line x1="12" y1="3.5" x2="12" y2="10.5" {...p} />
        <line x1="3.5" y1="15" x2="20.5" y2="15" {...p} />
        <line x1="3.5" y1="19.5" x2="20.5" y2="19.5" {...p} />
      </>
    );
  else if (mode === 'year') body = <>{frame}{[7.75, 12, 16.25].map(v)}{[7.75, 12, 16.25].map(hz)}</>;
  else if (mode === 'month') body = <>{frame}{[9.17, 14.83].map(v)}{[9.17, 14.83].map(hz)}</>;
  else if (mode === 'week') body = <>{frame}{[7.75, 12, 16.25].map(v)}</>;
  else if (mode === 'three') body = <>{frame}{[9.17, 14.83].map(v)}</>;
  else
    body = (
      <>
        <line x1="4.5" y1="3.5" x2="19.5" y2="3.5" {...p} />
        <rect x="3.5" y="7.5" width="17" height="9" rx="2.5" {...p} />
        <line x1="4.5" y1="20.5" x2="19.5" y2="20.5" {...p} />
      </>
    );
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" className="mode-icon">
      {body}
    </svg>
  );
}

function ViewMenu({ anchor, value, onPick, onClose }) {
  return (
    <Popover anchor={anchor} desktop onClose={onClose} title="Visualização" width={232} align="end">
      <ul className="menu cal-menu" role="menu" aria-label="Visualização">
        {MODES.map((m) => (
          <li key={m} role="none">
            <button
              type="button"
              role="menuitemradio"
              aria-checked={value === m}
              className={`menu-item cal-menu-item${value === m ? ' is-on' : ''}`}
              onClick={() => onPick(m)}
            >
              <ModeIcon mode={m} />
              <span className="flex-1 min-w-0 truncate">{MODE_LABEL[m]}</span>
              {value === m && <Icon name="Check" size={18} className="menu-check" />}
            </button>
          </li>
        ))}
      </ul>
    </Popover>
  );
}

/* ------------------------------------------------------------------ */
/* Itens compactos (células do mês e faixa "Dia todo")                 */
/* ------------------------------------------------------------------ */
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

/** Etiqueta mínima para a célula do mês no celular: só o título, na cor do item. */
function MiniChip({ x }) {
  if (x.k === 'e') {
    return (
      <span className="mchip is-event" style={{ '--c': colorOf(x.o.ev.color).value }}>
        {x.o.ev.title}
      </span>
    );
  }
  return (
    <span className={`mchip is-task${x.t.done ? ' is-done' : ''}`} style={{ '--pc': priorityOf(x.t.priority).color }}>
      {x.t.title}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Dia sem nada marcado                                                 */
/* ------------------------------------------------------------------ */
function EmptyDay({ compact }) {
  return (
    <div className={`day-empty${compact ? ' is-compact' : ''}`}>
      <svg viewBox="0 0 200 150" className="day-empty-art" aria-hidden="true">
        <path d="M38 78c-8-30 14-56 46-62 30-6 52 4 70 16 20 14 30 36 22 58-8 24-34 38-62 42-30 4-52-6-64-24-6-9-10-19-12-30z" className="de-blob" />
        <g transform="rotate(-6 100 78)">
          <rect x="58" y="44" width="86" height="70" rx="8" className="de-back" />
          <rect x="62" y="40" width="86" height="70" rx="8" className="de-page" />
          <path d="M62 48a8 8 0 0 1 8-8h70a8 8 0 0 1 8 8v8H62z" className="de-head" />
          {[0, 1, 2, 3].map((c) =>
            [0, 1].map((r) => <rect key={`${c}${r}`} x={70 + c * 18} y={64 + r * 18} width="14" height="14" rx="2.5" className="de-cell" />)
          )}
          <circle cx="113" cy="71" r="5" className="de-dot" />
          {[84, 105, 126].map((x) => (
            <rect key={x} x={x - 2.5} y="33" width="5" height="13" rx="2.5" className="de-ring" />
          ))}
        </g>
        <path d="M44 46l2.6 5.4 5.4 2.6-5.4 2.6L44 62l-2.6-5.4-5.4-2.6 5.4-2.6z" className="de-spark" />
        <path d="M162 92l1.8 3.7 3.7 1.8-3.7 1.8-1.8 3.7-1.8-3.7-3.7-1.8 3.7-1.8z" className="de-spark" />
        <circle cx="150" cy="30" r="3" className="de-ring-o" />
        <circle cx="52" cy="104" r="2.4" className="de-ring-o" />
      </svg>
      <p className="day-empty-title">Essa data está livre de tarefas</p>
      <p className="day-empty-sub">Relaxe um pouco</p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Lista de um dia                                                     */
/* ------------------------------------------------------------------ */
function DayList({ dayKey, todayKey, items, data, store: st, onOpenTask, onOpenEvent, onCreate, bare = false }) {
  const { events, tasks } = items || { events: [], tasks: [] };
  const empty = !events.length && !tasks.length;
  const hol = holidayOf(st.settings, dayKey);
  return (
    <section className={`daylist${bare ? ' is-bare' : ''}`} aria-label={`Itens de ${dayLabel(dayKey, todayKey)}`}>
      {bare ? (
        hol && (
          <p className="daylist-hol">
            <span className={`hol-tag is-${hol.kind}`}>{hol.name}</span>
          </p>
        )
      ) : (
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
      )}
      {empty && <EmptyDay compact={!bare} />}
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
            <TaskRow key={t.id} task={t} data={data} todayKey={todayKey} onToggle={st.tasks.toggle} onOpen={onOpenTask} hideDate showList />
          ))}
        </div>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Mês: "Lista" (grade compacta + itens do dia) e "Mês" (grade cheia)  */
/* ------------------------------------------------------------------ */
function MonthGrid({ variant, cursor, selected, folded, onSelect, onDayOpen, todayKey, data, store: st, desktop, onOpenTask, onOpenEvent, onCreate, dir, onSwipe }) {
  const c = fromKey(cursor);
  const full = monthGrid(c.getFullYear(), c.getMonth());
  const rows = full.slice(35).some((d) => d.inMonth) ? 6 : full.slice(28, 35).some((d) => d.inMonth) ? 5 : 4;
  // Dobrada: só a semana do dia escolhido
  const weekStart = keyOf(weekStartOf(fromKey(selected)));
  const grid = folded ? rangeDays(weekStart, 7).map((k) => ({ key: k, date: fromKey(k), inMonth: true })) : full.slice(0, rows * 7);
  const first = grid[0].key;
  const last = grid[grid.length - 1].key;
  const map = useMemo(() => itemsByDay(data, first, last), [data, first, last]);
  const wrapRef = useRef(null);
  useSwipe(wrapRef, onSwipe, !desktop);
  const big = variant === 'month' || desktop;
  const animKey = folded ? `w${weekStart}` : `${c.getFullYear()}-${c.getMonth()}`;

  return (
    <div className={`month${big ? ' is-big' : ''}${folded ? ' is-folded' : ''}`} ref={wrapRef}>
      <div className="month-wd" aria-hidden="true">
        {weekOrder().map((i) => (
          <span key={i}>{WD[i]}</span>
        ))}
      </div>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.div
          key={animKey}
          className="month-grid"
          style={{ '--rows': folded ? 1 : rows }}
          initial={{ opacity: 0, x: dir * 18 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: dir * -18, transition: { duration: 0.12 } }}
          transition={{ duration: 0.2, ease: EASE_OUT }}
          role="grid"
        >
          {grid.map((d) => {
            const it = map.get(d.key) || { events: [], tasks: [] };
            const all = [...it.events.map((o) => ({ k: 'e', o })), ...it.tasks.map((t) => ({ k: 't', t }))];
            const hol = holidayOf(st.settings, d.key);
            const fit = desktop ? 3 : 4;
            const shown = all.length > fit ? all.slice(0, fit - 1) : all;
            return (
              <div
                key={d.key}
                className={`mcell${d.inMonth ? '' : ' is-out'}${d.key === todayKey ? ' is-today' : ''}${d.key === selected ? ' is-selected' : ''}${hol ? ' is-holiday' : ''}`}
                title={hol ? hol.name : undefined}
                data-drop
                data-day={d.key}
                onClick={() => (variant === 'month' && !desktop ? onDayOpen(d.key) : onSelect(d.key))}
                onDoubleClick={() => onCreate({ date: d.key })}
                role="gridcell"
                aria-selected={d.key === selected}
                aria-label={`${d.date.getDate()} de ${MONTHS_LONG[d.date.getMonth()]}${all.length ? `, ${all.length} itens` : ''}`}
              >
                <span className="mcell-num">{d.date.getDate()}</span>
                {desktop && hol && <span className="mcell-hol">{hol.name}</span>}
                {desktop ? (
                  <div className="mcell-items">
                    {shown.map((x) =>
                      x.k === 'e' ? <EventChip key={x.o.id} occ={x.o} onOpen={onOpenEvent} day={d.key} /> : <TaskChip key={x.t.id} task={x.t} onOpen={onOpenTask} onToggle={st.tasks.toggle} />
                    )}
                    {all.length > shown.length && (
                      <button
                        type="button"
                        className="mcell-more"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDayOpen(d.key);
                        }}
                      >
                        +{all.length - shown.length}
                      </button>
                    )}
                  </div>
                ) : variant === 'month' ? (
                  <div className="mcell-chips" aria-hidden="true">
                    {shown.map((x) => (
                      <MiniChip key={x.k === 'e' ? x.o.id : x.t.id} x={x} />
                    ))}
                    {all.length > shown.length && <span className="mcell-more">+{all.length - shown.length}</span>}
                  </div>
                ) : (
                  <div className="mcell-dots" aria-hidden="true">
                    {all.slice(0, 3).map((x, i) => (
                      <i key={i} style={{ background: x.k === 'e' ? colorOf(x.o.ev.color).value : x.t.done ? 'var(--line-strong)' : 'var(--muted)' }} />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Grade de horários (semana, 3 dias, dia)                             */
/* ------------------------------------------------------------------ */
function TimeGrid({ days, todayKey, data, store: st, desktop, onOpenTask, onOpenEvent, onCreate, onPickDay, hover, unscheduled, HOUR, setHour, onSwipe }) {
  const scrollRef = useRef(null);
  const mainRef = useRef(null);
  const settings = st.settings;
  const hourRef = useRef(HOUR);
  hourRef.current = HOUR;
  const setHourRef = useRef(setHour);
  setHourRef.current = setHour;
  const narrow = !desktop && days.length > 3;
  const cols = `${narrow ? 40 : 52}px repeat(${days.length}, minmax(0, 1fr))`;
  useSwipe(mainRef, onSwipe, !desktop);

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
    <div className={`tg${unscheduled ? ' has-side' : ''}${narrow ? ' is-narrow' : ''}`}>
      <div className="tg-main" ref={mainRef}>
        <div className="tg-head" style={{ gridTemplateColumns: cols }}>
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
        <div className="tg-allday" style={{ gridTemplateColumns: cols }}>
          <span className="tg-allday-label">{narrow ? 'Todo' : 'Dia todo'}</span>
          {days.map((k) => {
            const a = allDayFor(k);
            return (
              <div key={k} className="tg-lane" data-drop data-day={k} data-allday onDoubleClick={() => onCreate({ date: k })}>
                {a.events.map((o) => (
                  <EventChip key={o.id} occ={o} onOpen={onOpenEvent} dense day={k} />
                ))}
                {a.tasks.map((t) => (
                  <TaskChip key={t.id} task={t} onOpen={onOpenTask} onToggle={st.tasks.toggle} />
                ))}
              </div>
            );
          })}
        </div>
        <div className="tg-scroll" ref={scrollRef} data-autoscroll>
          <div className="tg-body" style={{ height: 24 * HOUR, gridTemplateColumns: cols, '--hour': `${HOUR}px` }}>
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
                    {((g.end - g.start) / 60) * HOUR > 30 && <span>Livre · {fmtMinutes(g.end - g.start)}</span>}
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
                        onClick={() => k === todayKey && st.habits.toggle(h, k)}
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
                        {!narrow && (
                          <span className="blk-time">
                            {fmtTime(hhmm(b.start))}–{fmtTime(hhmm(b.end % 1440))}
                            {ev.location ? `, ${ev.location}` : ''}
                          </span>
                        )}
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
                        {!narrow && <TaskCheck checked={t.done} priority={t.priority} size={14} onToggle={() => st.tasks.toggle(t.id)} label={`Concluir ${t.title}`} />}
                        {t.title}
                      </span>
                      {height >= 34 && !narrow && <span className="blk-time">{fmtTime(t.time)}</span>}
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
function YearView({ year, todayKey, data, settings, onPickDay, onSwipe, desktop }) {
  const { map, max } = useMemo(() => yearActivity(data, year), [data, year]);
  const order = weekOrder();
  const ref = useRef(null);
  useSwipe(ref, onSwipe, !desktop);
  return (
    <div className="year" ref={ref}>
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
/* Agenda                                                              */
/* ------------------------------------------------------------------ */
export function CalendarView({ store: st, todayKey, desktop, onOpenTask, onOpenEvent, onCreate, headerRight, onDayChange }) {
  const data = st.data;
  const [mode, setModeState] = useState(loadMode);
  const [cursor, setCursor] = useState(todayKey);
  const [selected, setSelected] = useState(todayKey);
  const [folded, setFoldedState] = useState(() => ls.get(FOLD_KEY) === '1');
  const [dir, setDir] = useState(0);
  const [hover, setHover] = useState(null);
  const [menu, setMenu] = useState(null);
  const [daySheet, setDaySheet] = useState(null);
  const [hint, setHint] = useState(false);
  const [HOUR, setHourState] = useState(() => loadZoom(desktop));
  const setHour = (fn) =>
    setHourState((h) => {
      const v = typeof fn === 'function' ? fn(h) : fn;
      ls.set(ZOOM_KEY, String(v));
      return v;
    });
  const setFolded = (v) => {
    setFoldedState(v);
    ls.set(FOLD_KEY, v ? '1' : '0');
  };
  const isFolded = folded && mode === 'list' && !desktop;

  // O botão + cria no dia que está em foco na agenda
  const focusDay = isTimeMode(mode) ? cursor : mode === 'year' ? todayKey : selected;
  useEffect(() => {
    if (onDayChange) onDayChange(focusDay);
  }, [focusDay]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => onDayChange && onDayChange(null), []); // eslint-disable-line react-hooks/exhaustive-deps

  // Dica "Toque para ir para hoje": só na primeira visita
  useEffect(() => {
    if (ls.get(HINT_KEY)) return undefined;
    const show = setTimeout(() => setHint(true), 500);
    const hide = setTimeout(() => {
      setHint(false);
      ls.set(HINT_KEY, '1');
    }, 4500);
    return () => {
      clearTimeout(show);
      clearTimeout(hide);
    };
  }, []);

  // Qualquer interação com a agenda já dispensa a dica
  const touched = useRef(false);
  useEffect(() => {
    if (!touched.current) {
      touched.current = true;
      return;
    }
    if (!hint) return;
    setHint(false);
    ls.set(HINT_KEY, '1');
  }, [menu, mode, selected, cursor, folded]); // eslint-disable-line react-hooks/exhaustive-deps

  const setMode = (m) => {
    setDir(0);
    if (isTimeMode(m) && !isTimeMode(mode)) setCursor(selected);
    if (!isTimeMode(m) && isTimeMode(mode)) {
      setSelected(cursor);
    } else if ((m === 'list' || m === 'month') && mode === 'year') {
      if (selected.slice(0, 4) === cursor.slice(0, 4)) setCursor(selected);
      else setSelected(cursor);
    } else if ((m === 'list' || m === 'month') && !isTimeMode(mode)) setCursor(selected);
    setModeState(m);
    ls.set(VIEW_KEY, m);
  };

  const days = useMemo(() => {
    if (mode === 'week') return rangeDays(keyOf(weekStartOf(fromKey(cursor))), 7);
    if (mode === 'three') return rangeDays(cursor, 3);
    return [cursor];
  }, [mode, cursor]);

  /** Seleciona um dia e leva a grade para o mês dele. */
  const selectDay = (k) => {
    if (!sameMonth(k, cursor)) {
      setDir(k > cursor ? 1 : -1);
      setCursor(k);
    }
    setSelected(k);
  };

  const step = (n) => {
    setDir(n);
    const c = fromKey(cursor);
    if (mode === 'year') setCursor(keyOf(new Date(c.getFullYear() + n, 0, 1)));
    else if (mode === 'list' || mode === 'month') {
      if (isFolded) {
        const k = keyOf(addDays(fromKey(selected), 7 * n));
        setSelected(k);
        setCursor(k);
        return;
      }
      const d = new Date(c.getFullYear(), c.getMonth() + n, 1);
      const k = sameMonth(keyOf(d), todayKey) ? todayKey : keyOf(d);
      setCursor(k);
      setSelected(k);
    } else setCursor(keyOf(addDays(c, n * (mode === 'week' ? 7 : mode === 'three' ? 3 : 1))));
  };
  const goToday = () => {
    setHint(false);
    ls.set(HINT_KEY, '1');
    setDir(cursor < todayKey ? 1 : cursor > todayKey ? -1 : 0);
    setCursor(todayKey);
    setSelected(todayKey);
  };
  const swipe = {
    left: () => step(1),
    right: () => step(-1),
    up: mode === 'list' ? () => !folded && setFolded(true) : undefined,
    down: mode === 'list' ? () => folded && setFolded(false) : undefined,
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
        st.tasks.update(e.data.id, { date: slotDay, time, duration: task && task.duration ? task.duration : 30 });
      } else st.events.move(e.data.id, slotDay, time);
    } else if (day) {
      if (e.data.type === 'task') st.tasks.update(e.data.id, allday !== undefined ? { date: day, time: '' } : { date: day });
      else st.events.move(e.data.id, day);
    }
  });

  // Título: o mês em foco (com o ano só quando não é o ano atual); toque volta para hoje
  const c = fromKey(cursor);
  const yearSuffix = (d) => (d.getFullYear() !== fromKey(todayKey).getFullYear() ? ` de ${d.getFullYear()}` : '');
  let title;
  if (mode === 'year') title = String(c.getFullYear());
  else if (isTimeMode(mode) && days.length > 1 && !sameMonth(days[0], days[days.length - 1])) {
    const a = fromKey(days[0]);
    const b = fromKey(days[days.length - 1]);
    title = `${MONTHS_LONG[a.getMonth()].slice(0, 3)} – ${MONTHS_LONG[b.getMonth()].slice(0, 3)}${yearSuffix(b)}`;
  } else {
    const d = isFolded ? fromKey(selected) : isTimeMode(mode) ? fromKey(days[0]) : c;
    title = `${MONTHS_LONG[d.getMonth()]}${yearSuffix(d)}`;
  }

  const unscheduled = desktop && isTimeMode(mode) ? data.tasks.filter((t) => !t.done && !t.date).slice(0, 30) : null;
  const isCurrent =
    mode === 'year' ? cursor.slice(0, 4) === todayKey.slice(0, 4) : isTimeMode(mode) ? days.includes(todayKey) : sameMonth(cursor, todayKey) && selected === todayKey;
  const sheetItems = useMemo(() => (daySheet ? itemsByDay(data, daySheet, daySheet).get(daySheet) : null), [data, daySheet]);
  const common = { todayKey, data, store: st, desktop, onOpenTask, onOpenEvent, onCreate };

  return (
    <div className={`cal is-${mode}${desktop ? ' is-desk' : ''}`}>
      <PageHeader
        title={
          <span className="cal-title-wrap">
            <button type="button" className="cal-title" onClick={goToday} aria-label={`${title}. Toque para ir para hoje`}>
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.span
                  key={title}
                  className="cal-title-text"
                  initial={{ opacity: 0, y: dir >= 0 ? 6 : -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: dir >= 0 ? -6 : 6, transition: { duration: 0.1 } }}
                  transition={{ duration: 0.18, ease: EASE_OUT }}
                >
                  {title}
                </motion.span>
              </AnimatePresence>
            </button>
            <AnimatePresence>
              {hint && (
                <motion.span
                  className="cal-hint"
                  role="status"
                  initial={{ opacity: 0, y: -4, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, transition: { duration: 0.15 } }}
                  transition={{ duration: 0.2, ease: EASE_OUT }}
                  onClick={goToday}
                >
                  Toque para ir para hoje
                </motion.span>
              )}
            </AnimatePresence>
          </span>
        }
      >
        {desktop && (
          <div className="cal-nav">
            {!isCurrent && (
              <button type="button" className="chip-btn sm" onClick={goToday}>
                Hoje
              </button>
            )}
            <button type="button" className="icon-btn ghost" onClick={() => step(-1)} aria-label="Anterior">
              <Icon name="ChevronLeft" size={18} />
            </button>
            <button type="button" className="icon-btn ghost" onClick={() => step(1)} aria-label="Próximo">
              <Icon name="ChevronRight" size={18} />
            </button>
          </div>
        )}
        <button
          type="button"
          className={`icon-btn ghost cal-view-btn${menu ? ' is-active' : ''}`}
          onClick={(e) => setMenu(menu ? null : e.currentTarget.getBoundingClientRect())}
          aria-label={`Visualização: ${MODE_LABEL[mode]}`}
          aria-haspopup="menu"
          aria-expanded={!!menu}
        >
          <ModeIcon mode={mode} size={21} />
        </button>
        {headerRight}
      </PageHeader>

      <AnimatePresence>
        {menu && (
          <ViewMenu
            anchor={menu}
            value={mode}
            onClose={() => setMenu(null)}
            onPick={(m) => {
              setMenu(null);
              setMode(m);
            }}
          />
        )}
      </AnimatePresence>

      {(mode === 'list' || mode === 'month') && (
        <div className={`month-wrap is-${mode}${desktop ? ' is-desktop' : ''}`}>
          <div className="month-col">
            <MonthGrid
              {...common}
              variant={mode}
              cursor={cursor}
              selected={selected}
              folded={isFolded}
              onSelect={selectDay}
              onDayOpen={(k) => {
                setSelected(k);
                setDaySheet(k);
              }}
              dir={dir}
              onSwipe={swipe}
            />
            {mode === 'list' && !desktop && (
              <button type="button" className="month-fold" onClick={() => setFolded(!folded)} aria-label={folded ? 'Mostrar o mês inteiro' : 'Mostrar só a semana'}>
                <span />
              </button>
            )}
          </div>
          {mode === 'list' && <DayList {...common} dayKey={selected} items={itemsByDay(data, selected, selected).get(selected)} bare={!desktop} />}
        </div>
      )}
      {isTimeMode(mode) && (
        <TimeGrid
          {...common}
          days={days}
          onPickDay={(k) => {
            setCursor(k);
            setSelected(k);
            setMode('day');
          }}
          hover={hover}
          unscheduled={unscheduled}
          HOUR={HOUR}
          setHour={setHour}
          onSwipe={swipe}
        />
      )}
      {mode === 'year' && (
        <YearView
          year={c.getFullYear()}
          todayKey={todayKey}
          data={data}
          settings={st.settings}
          desktop={desktop}
          onSwipe={swipe}
          onPickDay={(k) => {
            setCursor(k);
            setSelected(k);
            setModeState('list');
            ls.set(VIEW_KEY, 'list');
          }}
        />
      )}

      <AnimatePresence>
        {daySheet && (
          <Sheet desktop={desktop} title={`${dayLabel(daySheet, todayKey)}, ${fromKey(daySheet).getDate()} de ${MONTHS_LONG[fromKey(daySheet).getMonth()]}`} onClose={() => setDaySheet(null)} className="is-compact">
            <DayList
              {...common}
              dayKey={daySheet}
              items={sheetItems}
              bare
              onOpenTask={(id) => {
                setDaySheet(null);
                onOpenTask(id);
              }}
              onOpenEvent={(o) => {
                setDaySheet(null);
                onOpenEvent(o);
              }}
            />
            <button
              type="button"
              className="chip-btn day-sheet-add"
              onClick={() => {
                const k = daySheet;
                setDaySheet(null);
                onCreate({ date: k });
              }}
            >
              <Icon name="Plus" size={16} /> Adicionar neste dia
            </button>
          </Sheet>
        )}
      </AnimatePresence>
    </div>
  );
}

export const calendarMinutes = minutesOf;
