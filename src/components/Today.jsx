import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Icon, AnimatedNumber, RollingNumber, SPRING, EASE_OUT } from './ui.jsx';
import {
  PERIODS, PERIOD_SHORT, WEEKDAY_LETTER, MOODS, colorOf, keyOf, fromKey, addDays, fmtLong, greetingFor,
  isListed, isScheduled, isWeekly, isAvoid, isDone, countOf, currentStreak, daySummary, weekCount, weekStart,
  activeHabits, breakOn, shortDate, streakShort, isMinimal, isHardDay, partnerHabitView, inBreak,
} from '../lib/habits.js';
import { onThisDay } from '../lib/insights.js';
import { fmtTime, weekOrder } from '../lib/prefs.js';
import { Portal, useEscape, Popover, MenuList, usePopover } from './ui.jsx';

/* ------------------------------------------------------------------ */
/* Cabeçalho de página + botão de conta (celular)                      */
/* ------------------------------------------------------------------ */
const STATUS_TEXT = {
  local: 'Só neste aparelho',
  syncing: 'Sincronizando',
  synced: 'Sincronizado',
  offline: 'Sem conexão',
  error: 'Erro ao sincronizar',
};
export const statusText = (s) => STATUS_TEXT[s] || '';

export function AccountButton({ name, status, onClick }) {
  const initial = (name || '').trim().charAt(0).toUpperCase();
  return (
    <button type="button" className="avatar" onClick={onClick} aria-label={`Conta e sincronização: ${statusText(status)}`}>
      {initial ? <span>{initial}</span> : <Icon name="User" size={18} />}
      <span className={`sync-dot is-${status}`} aria-hidden="true" />
    </button>
  );
}

export function PageHeader({ title, subtitle, children }) {
  return (
    <header className="page-header">
      <div className="min-w-0">
        <h1 className="greet">{title}</h1>
        {subtitle && <p className="date-line">{subtitle}</p>}
      </div>
      <div className="flex items-center gap-2 flex-none">{children}</div>
    </header>
  );
}

/* ------------------------------------------------------------------ */
/* Anel segmentado do dia                                              */
/* ------------------------------------------------------------------ */
const polar = (cx, cy, r, deg) => {
  const rad = ((deg - 90) * Math.PI) / 180;
  return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)];
};
function arcPath(cx, cy, r, start, end) {
  const [x1, y1] = polar(cx, cy, r, start);
  const [x2, y2] = polar(cx, cy, r, end);
  const large = end - start > 180 ? 1 : 0;
  return `M ${x1.toFixed(3)} ${y1.toFixed(3)} A ${r} ${r} 0 ${large} 1 ${x2.toFixed(3)} ${y2.toFixed(3)}`;
}

let ringIntroPlayed = false; // a varredura de entrada acontece uma vez por sessão

function DayRing({ items, done, total, percent, paused }) {
  const intro = useRef(!ringIntroPlayed);
  useEffect(() => {
    ringIntroPlayed = true;
  }, []);
  const n = items.length;
  const R = 50;
  const SW = 11;
  // Cap arredondado de 5.5px em r=50 avança ~6.3° por ponta: o vão precisa passar de 12.6°
  const gap = n > 1 ? Math.min(18, 160 / n) : 0;
  const seg = n ? 360 / n - gap : 0;

  return (
    <div className="dayring">
      <span className="sr-only">{paused ? 'Dia em pausa' : `${done} de ${total} hábitos concluídos`}</span>
      <svg viewBox="0 0 120 120" className="ring-svg" aria-hidden="true" focusable="false">
        {n === 0 && <circle cx="60" cy="60" r={R} fill="none" stroke="var(--surface-2)" strokeWidth={SW} strokeDasharray={paused ? '3 9' : undefined} strokeLinecap="round" />}
        {items.map((it, i) => {
          const start = i * (360 / n) + gap / 2;
          const end = n === 1 ? start + 359.9 : start + seg;
          const d = arcPath(60, 60, R, start, end);
          const frac = Math.max(0, Math.min(1, it.frac));
          return (
            <g key={it.id}>
              <path d={d} fill="none" stroke={`color-mix(in oklab, ${it.color} 20%, var(--surface-2))`} strokeWidth={SW} strokeLinecap="round" />
              <motion.path
                d={d}
                fill="none"
                stroke={it.color}
                strokeWidth={SW}
                strokeLinecap="round"
                initial={intro.current ? { pathLength: 0, opacity: 0 } : false}
                animate={{ pathLength: frac > 0 ? frac : 0.001, opacity: frac > 0 ? 1 : 0 }}
                transition={
                  intro.current
                    ? { pathLength: { ...SPRING.progress, delay: 0.12 + i * 0.05 }, opacity: { duration: 0.12, delay: 0.12 + i * 0.05 } }
                    : { pathLength: SPRING.progress, opacity: { duration: 0.12 } }
                }
              />
            </g>
          );
        })}
      </svg>
      <div className="ring-center">
        {paused ? (
          <>
            <Icon name="Pause" size={28} className="text-[color:var(--muted)]" />
            <span className="ring-sub">Em pausa</span>
          </>
        ) : (
          <>
            <span className="ring-num">
              <AnimatedNumber value={percent} />
              <span className="ring-pct">%</span>
            </span>
            <span className="ring-sub">
              {done} de {total}
            </span>
          </>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Carrossel de dias                                                   */
/* ------------------------------------------------------------------ */
function MiniRing({ value }) {
  const C = 2 * Math.PI * 15;
  return (
    <svg viewBox="0 0 34 34" className="mini-ring" aria-hidden="true">
      <circle cx="17" cy="17" r="15" className="mini-track" />
      <circle cx="17" cy="17" r="15" className="mini-fill" strokeDasharray={C} strokeDashoffset={C * (1 - (value || 0))} style={{ opacity: value > 0 ? 1 : 0 }} />
    </svg>
  );
}

function WeekStrip({ data, selectedKey, onSelect, today }) {
  const scroller = useRef(null);
  const days = useMemo(() => {
    const ws = weekOrder()[0];
    const end = addDays(today, 6 - ((today.getDay() - ws + 7) % 7));
    const start = addDays(end, -27);
    const out = [];
    for (let d = start; d <= end; d = addDays(d, 1)) out.push(d);
    return out;
  }, [today]);

  useEffect(() => {
    const box = scroller.current;
    const el = box && box.querySelector('[data-selected="true"]');
    if (!el) return;
    const target = el.offsetLeft - box.clientWidth / 2 + el.clientWidth / 2;
    box.scrollTo({ left: target, behavior: box.dataset.ready ? 'smooth' : 'auto' });
    box.dataset.ready = '1';
  }, [selectedKey]);

  const todayKey = keyOf(today);
  return (
    <div className="week" ref={scroller} role="listbox" aria-label="Escolher dia">
      {days.map((d) => {
        const k = keyOf(d);
        const future = k > todayKey;
        const selected = k === selectedKey;
        const summary = future ? null : daySummary(data, d);
        return (
          <button
            key={k}
            type="button"
            role="option"
            aria-selected={selected}
            data-selected={selected}
            disabled={future}
            className={`day${selected ? ' is-selected' : ''}${k === todayKey ? ' is-today' : ''}${summary && summary.paused ? ' is-paused' : ''}`}
            onClick={() => onSelect(k)}
            aria-label={fmtLong.format(d)}
          >
            {selected && <motion.span layoutId="day-pill" className="day-pill" transition={SPRING.indicator} />}
            <span className="day-letter">{WEEKDAY_LETTER[d.getDay()]}</span>
            <span className="day-num">
              {!future && <MiniRing value={summary ? summary.partial : 0} />}
              <span>{d.getDate()}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Check                                                               */
/* ------------------------------------------------------------------ */
function CheckButton({ habit, count, onPress, timerRunning }) {
  const c = colorOf(habit.color);
  const multi = habit.target > 1;
  const done = count >= habit.target;
  const timed = habit.duration > 0;
  const [burst, setBurst] = useState(0);
  const prevDone = useRef(done);

  useEffect(() => {
    if (done && !prevDone.current) setBurst((b) => b + 1);
    prevDone.current = done;
  }, [done]);

  const label = done
    ? multi
      ? `${habit.name}: meta concluída. Tocar para zerar`
      : `Desmarcar ${habit.name}`
    : timed
      ? `Iniciar temporizador de ${habit.duration} minutos para ${habit.name}`
      : multi
        ? `${habit.name}: ${count} de ${habit.target}. Tocar para somar 1`
        : isAvoid(habit)
          ? `Marcar que evitou ${habit.name} hoje`
          : `Concluir ${habit.name}`;

  return (
    <motion.button
      type="button"
      className={`check${isAvoid(habit) ? ' is-avoid' : ''}`}
      style={{ '--c': c.value, '--on': c.on }}
      onClick={onPress}
      whileTap={{ scale: 0.86 }}
      transition={SPRING.press}
      aria-pressed={done}
      aria-label={label}
    >
      <svg viewBox="0 0 44 44" className="check-svg" aria-hidden="true">
        <circle cx="22" cy="22" r="18" className={multi ? 'check-track multi' : 'check-track'} />
        {multi && (
          <motion.circle
            cx="22"
            cy="22"
            r="18"
            className="check-progress"
            initial={false}
            animate={{ pathLength: Math.max(count / habit.target, 0.001), opacity: count > 0 ? 1 : 0 }}
            transition={{ pathLength: SPRING.progress, opacity: { duration: 0.12 } }}
          />
        )}
      </svg>
      <motion.span
        className="check-fill"
        initial={false}
        animate={done ? { scale: 1, opacity: 1 } : { scale: 0.6, opacity: 0 }}
        transition={done ? SPRING.pop : { duration: 0.14, ease: EASE_OUT }}
      />
      <svg viewBox="0 0 24 24" className="check-mark" aria-hidden="true">
        <motion.path
          d="M5.5 12.5l4.2 4.2L18.5 7.8"
          initial={false}
          animate={{ pathLength: done ? 1 : 0, opacity: done ? 1 : 0 }}
          transition={done ? { duration: 0.22, ease: EASE_OUT, delay: 0.05 } : { duration: 0.1 }}
        />
      </svg>
      {!done && timed && (
        <span className={`check-play${timerRunning ? ' is-running' : ''}`}>
          <Icon name={timerRunning ? 'Hourglass' : 'Play'} size={15} strokeWidth={2.4} />
        </span>
      )}
      {multi && !done && !timed && (
        <span className="check-count">
          <RollingNumber value={count} />
        </span>
      )}
      {burst > 0 && (
        <motion.span
          key={burst}
          className="check-burst"
          initial={{ scale: 0.9, opacity: 0.5 }}
          animate={{ scale: 1.55, opacity: 0 }}
          transition={{ duration: 0.32, ease: EASE_OUT }}
        />
      )}
    </motion.button>
  );
}

function HabitRow({ habit, data, dayKey, today, streak, onToggle, onOpen, timerRunning, onMinimal }) {
  const c = colorOf(habit.color);
  const count = countOf(data.log, dayKey, habit.id);
  const done = count >= habit.target;
  const minimal = done && isMinimal(data, dayKey, habit.id);
  const hasNote = !!(data.notes && data.notes[dayKey] && data.notes[dayKey][habit.id]);

  let meta;
  if (isWeekly(habit)) {
    const n = weekCount(habit, data.log, weekStart(fromKey(dayKey)));
    meta = `${Math.min(n, habit.perWeek)} de ${habit.perWeek} nesta semana`;
  } else if (habit.target > 1) meta = `${count} de ${habit.target} ${habit.unit}`.trim();
  else if (habit.duration > 0) meta = timerRunning ? 'Temporizador em andamento' : `${habit.duration} minutos`;
  else if (isAvoid(habit)) meta = done ? 'Evitado hoje' : 'Evitar';
  else meta = habit.unit || 'Uma vez';
  if (!done && inBreak(data, dayKey, habit) && !breakOn(data, dayKey)) meta = 'Pausado: modo viagem';

  return (
    <div className={`row${done ? ' is-done' : ''}${minimal ? ' is-minimal' : ''}`} style={{ '--c': c.value }}>
      <button type="button" className="row-main" onClick={() => onOpen(habit)} aria-label={`Abrir ${habit.name}`}>
        <span className={`tile${isAvoid(habit) ? ' is-avoid' : ''}`}>
          <Icon name={habit.icon} size={20} />
        </span>
        <span className="row-text">
          <span className="row-title">
            <span className="row-title-text">{habit.name}</span>
            <motion.span className="strike" initial={false} animate={{ scaleX: done && !isAvoid(habit) ? 1 : 0 }} transition={{ duration: done ? 0.22 : 0.12, ease: EASE_OUT }} />
          </span>
          <span className="row-meta">
            <span className="truncate">{minimal ? `Mínimo: ${habit.minimum}` : meta}</span>
            {hasNote && <Icon name="StickyNote" size={13} className="flex-none" aria-label="Tem nota" />}
            {habit.reminder && !done && dayKey === keyOf(today) && (
              <span className="reminder-chip">
                <Icon name="Bell" size={11} strokeWidth={2.4} />
                {fmtTime(habit.reminder)}
              </span>
            )}
            {streak > 0 && (
              <span className="streak" aria-label={`Sequência de ${streak} ${isWeekly(habit) ? 'semanas' : 'dias'}`}>
                <Icon name={isAvoid(habit) ? 'ShieldCheck' : 'Flame'} size={13} strokeWidth={2.4} />
                <RollingNumber value={streak} />
                {isWeekly(habit) && <span className="streak-unit">{streakShort(habit)}</span>}
              </span>
            )}
          </span>
        </span>
      </button>
      {habit.minimum && !done && !isAvoid(habit) && onMinimal && (
        <button type="button" className="min-btn" onClick={() => onMinimal(habit)} title={`Só o mínimo: ${habit.minimum}`} aria-label={`Fazer só o mínimo de ${habit.name}: ${habit.minimum}`}>
          mín.
        </button>
      )}
      <CheckButton habit={habit} count={count} onPress={() => onToggle(habit)} timerRunning={timerRunning} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Rotina encadeada: um hábito por vez, em sequência                   */
/* ------------------------------------------------------------------ */
function RoutineRunner({ title, habits, data, dayKey, onToggle, onMinimal, onClose }) {
  useEscape(onClose);
  const pending = habits.filter((h) => !isDone(h, data.log, dayKey));
  const [skipped, setSkipped] = useState([]);
  const queue = pending.filter((h) => !skipped.includes(h.id));
  const cur = queue[0];
  const doneCount = habits.length - pending.length;
  useEffect(() => {
    if (!cur) {
      const id = setTimeout(onClose, 1400);
      return () => clearTimeout(id);
    }
    return undefined;
  }, [cur]); // eslint-disable-line react-hooks/exhaustive-deps
  const c = cur ? colorOf(cur.color) : null;
  return (
    <Portal>
      <motion.div className="runner" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18, ease: EASE_OUT }} role="dialog" aria-label={`Rotina: ${title}`}>
        <div className="runner-top">
          <span className="runner-title">{title}</span>
          <button type="button" className="icon-btn ghost" onClick={onClose} aria-label="Fechar rotina">
            <Icon name="X" size={20} />
          </button>
        </div>
        <div className="runner-dots" aria-hidden="true">
          {habits.map((h) => (
            <i key={h.id} className={isDone(h, data.log, dayKey) ? 'is-done' : cur && h.id === cur.id ? 'is-cur' : ''} style={{ '--c': colorOf(h.color).value }} />
          ))}
        </div>
        <AnimatePresence mode="wait">
          {cur ? (
            <motion.div key={cur.id} className="runner-card" style={{ '--c': c.value, '--on': c.on }} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -14 }} transition={{ duration: 0.2, ease: EASE_OUT }}>
              <span className="runner-icon">
                <Icon name={cur.icon} size={34} />
              </span>
              <h2 className="runner-name">{cur.name}</h2>
              <p className="field-hint">
                {cur.duration > 0 ? `${cur.duration} minutos` : cur.target > 1 ? `${countOf(data.log, dayKey, cur.id)} de ${cur.target} ${cur.unit}` : cur.unit || ''}
              </p>
              <div className="runner-actions">
                <button type="button" className="btn-primary" onClick={() => onToggle(cur)}>
                  <Icon name={cur.duration > 0 ? 'Play' : 'Check'} size={18} /> {cur.duration > 0 ? 'Começar' : cur.target > 1 ? 'Mais 1' : 'Feito'}
                </button>
                {cur.minimum && (
                  <button type="button" className="btn-secondary" onClick={() => onMinimal(cur)}>
                    Só o mínimo: {cur.minimum}
                  </button>
                )}
                <button type="button" className="btn-link" onClick={() => setSkipped((x) => [...x, cur.id])}>
                  Pular por agora
                </button>
              </div>
            </motion.div>
          ) : (
            <motion.div key="end" className="runner-card is-end" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.2, ease: EASE_OUT }}>
              <span className="runner-icon">
                <Icon name="PartyPopper" size={34} />
              </span>
              <h2 className="runner-name">{skipped.length ? 'Rotina encerrada' : 'Rotina completa'}</h2>
              <p className="field-hint">
                {doneCount} de {habits.length} feitos
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </Portal>
  );
}

/* ------------------------------------------------------------------ */
/* Hábitos de parceiros (só leitura)                                   */
/* ------------------------------------------------------------------ */
function PartnerSection({ data, today }) {
  const list = (data.partnerHabits || []).map((p) => partnerHabitView(p, today));
  if (!list.length) return null;
  return (
    <section className="flex flex-col gap-2" aria-labelledby="sec-partners">
      <div className="section-head">
        <h2 id="sec-partners" className="is-quiet">
          Com parceiros
        </h2>
      </div>
      <div className="group">
        {list.map((x) => (
          <div key={`${x.ownerId}-${x.h.id}`} className="row is-partner" style={{ '--c': colorOf(x.h.color).value }}>
            <span className="row-main">
              <span className="tile">
                <Icon name={x.h.icon} size={20} />
              </span>
              <span className="row-text">
                <span className="row-title">
                  <span className="row-title-text">{x.h.name}</span>
                </span>
                <span className="row-meta">
                  <span className="truncate">{x.owner}</span>
                  {x.streak > 0 && (
                    <span className="streak">
                      <Icon name="Flame" size={13} strokeWidth={2.4} />
                      {x.streak}
                    </span>
                  )}
                </span>
              </span>
            </span>
            <span className={`partner-state${x.doneToday ? ' is-done' : ''}`}>{x.doneToday ? 'Feito hoje' : x.listedToday ? 'Pendente' : 'Folga'}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Diário de uma linha + dia difícil                                   */
/* ------------------------------------------------------------------ */
function DayCheckin({ data, dayKey, isToday, info, onMood, onDay }) {
  const mood = (data.moods && data.moods[dayKey]) || 0;
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(info.journal || '');
  useEffect(() => {
    setText(info.journal || '');
    setEditing(false);
  }, [dayKey, info.journal]);
  const save = () => {
    setEditing(false);
    if (onDay && text.trim() !== (info.journal || '')) onDay(dayKey, { journal: text.trim() });
  };
  return (
    <section className="checkin" aria-label="Como foi o dia">
      <div className="checkin-row">
        <span className="checkin-label">{isToday ? 'Como está o dia?' : 'Como foi o dia?'}</span>
        <div className="mood-row" role="radiogroup" aria-label="Humor do dia">
          {MOODS.map((m) => (
            <motion.button
              key={m.value}
              type="button"
              role="radio"
              aria-checked={mood === m.value}
              aria-label={m.label}
              className={`mood-btn${mood === m.value ? ' is-on' : ''}`}
              onClick={() => onMood(dayKey, mood === m.value ? 0 : m.value)}
              whileTap={{ scale: 0.88 }}
              transition={SPRING.press}
            >
              <Icon name={m.icon} size={20} strokeWidth={mood === m.value ? 2.3 : 1.8} />
            </motion.button>
          ))}
        </div>
      </div>
      {onDay &&
        (editing ? (
          <input
            className="checkin-input"
            value={text}
            autoFocus
            maxLength={280}
            placeholder={isToday ? 'Uma linha sobre hoje' : 'Uma linha sobre este dia'}
            onChange={(e) => setText(e.target.value)}
            onBlur={save}
            onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
            enterKeyHint="done"
            aria-label="Diário do dia"
          />
        ) : (
          <button type="button" className={`checkin-note${info.journal ? ' has-text' : ''}`} onClick={() => setEditing(true)}>
            {info.journal ? info.journal : (
              <>
                <Icon name="PenLine" size={14} /> {isToday ? 'Uma linha sobre hoje' : 'Uma linha sobre este dia'}
              </>
            )}
          </button>
        ))}
    </section>
  );
}

/* ------------------------------------------------------------------ */
function MoodPicker({ value, onChange, isToday }) {
  return (
    <div className="mood">
      <span className="mood-label">{isToday ? 'Como está o seu dia?' : 'Como foi o dia?'}</span>
      <div className="mood-row" role="radiogroup" aria-label="Humor do dia">
        {MOODS.map((m) => (
          <motion.button
            key={m.value}
            type="button"
            role="radio"
            aria-checked={value === m.value}
            aria-label={m.label}
            className={`mood-btn${value === m.value ? ' is-on' : ''}`}
            onClick={() => onChange(value === m.value ? 0 : m.value)}
            whileTap={{ scale: 0.88 }}
            transition={SPRING.press}
          >
            <Icon name={m.icon} size={22} strokeWidth={value === m.value ? 2.3 : 1.8} />
          </motion.button>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Tela Hoje                                                           */
/* ------------------------------------------------------------------ */
export function TodayView({ data, today, selectedKey, onSelectDay, onToggle, onOpen, onCreate, onManage, onMood, onEndBreak, timer, headerRight, title, onMinimal, onDay, onStats, desktop }) {
  const [runner, setRunner] = useState(null); // id do período
  const [showOff, setShowOff] = useState(false);
  const menu = usePopover();
  const selectedDate = fromKey(selectedKey);
  const isToday = selectedKey === keyOf(today);
  const active = activeHabits(data);
  const listed = active.filter((h) => isListed(h, selectedDate));
  const unlisted = active.filter((h) => !isListed(h, selectedDate));
  const summary = daySummary(data, selectedDate);
  const percent = Math.round(summary.partial * 100);
  const pause = breakOn(data, selectedKey);
  const hard = isHardDay(data, selectedKey);
  const info = (data.days || {})[selectedKey] || {};
  // Dia difícil: no máximo um a cada 7 dias, para continuar significando algo
  const recentHard = Object.keys(data.days || {}).some((k) => k !== selectedKey && data.days[k].hard && Math.abs(fromKey(k) - fromKey(selectedKey)) < 7 * 86400000);

  const ringItems = PERIODS.flatMap((p) => listed.filter((h) => h.period === p.id))
    .filter((h) => !pause && (isScheduled(h, selectedDate, data) || (isWeekly(h) && isDone(h, data.log, selectedKey))))
    .map((h) => ({ id: h.id, color: colorOf(h.color).value, frac: countOf(data.log, selectedKey, h.id) / h.target }));

  const streaks = useMemo(() => {
    const out = {};
    for (const h of data.habits) out[h.id] = currentStreak(h, data, today);
    return out;
  }, [data, today]);

  const groups = PERIODS.map((p) => ({ ...p, habits: listed.filter((h) => h.period === p.id) })).filter((g) => g.habits.length);
  const remaining = summary.total - summary.done;
  const memory = isToday ? onThisDay(data, selectedKey) : null;
  const headline = pause
    ? 'Dia em pausa'
    : summary.total === 0
      ? 'Nada obrigatório'
      : remaining === 0
        ? 'Dia completo'
        : isToday
          ? `Faltam ${remaining}`
          : `${remaining} ficaram pendentes`;
  const sub = pause
    ? `Até ${shortDate(pause.end)}. Sequências protegidas.`
    : summary.total === 0
      ? hard
        ? 'Dia difícil: pegue leve.'
        : 'Os hábitos de hoje aparecem aqui.'
      : `${summary.done} de ${summary.total} feitos${hard ? ' · dia difícil' : ''}`;

  return (
    <div className="today is-clean">
      <div className="today-side">
        <PageHeader title={title || 'Hábitos'} subtitle={isToday ? `Hoje, ${fmtLong.format(selectedDate)}` : fmtLong.format(selectedDate)}>
          <AnimatePresence initial={false}>
            {!isToday && (
              <motion.button
                type="button"
                className="chip-btn sm"
                onClick={() => onSelectDay(keyOf(today))}
                initial={{ opacity: 0, scale: 0.94 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.94, transition: { duration: 0.12 } }}
                transition={{ duration: 0.18, ease: EASE_OUT }}
                style={{ transformOrigin: 'right center' }}
              >
                Hoje
              </motion.button>
            )}
          </AnimatePresence>
          <button type="button" className="icon-btn ghost" onClick={(e) => menu.open(e)} aria-label="Mais opções de hábitos">
            <Icon name="Ellipsis" size={20} />
          </button>
          {headerRight}
        </PageHeader>

        <WeekStrip data={data} selectedKey={selectedKey} onSelect={onSelectDay} today={today} />

        <section className={`hsum${pause ? ' is-paused' : ''}`} aria-label="Progresso do dia">
          <DayRing items={ringItems} done={summary.done} total={summary.total} percent={percent} paused={!!pause} />
          <div className="hsum-text">
            <p className="hsum-head">{headline}</p>
            <p className="hsum-sub">{sub}</p>
            {pause && isToday && (
              <button type="button" className="btn-link hsum-link" onClick={() => onEndBreak(pause)}>
                Encerrar pausa
              </button>
            )}
          </div>
        </section>

        <DayCheckin data={data} dayKey={selectedKey} isToday={isToday} info={info} onMood={onMood} onDay={onDay} />

        {memory && (
          <div className="memory">
            <span className="memory-label">
              <Icon name="History" size={14} /> Neste dia, há um ano
            </span>
            <p>{memory.journal || `${memory.tasks.length ? `${memory.tasks.length} tarefas concluídas` : ''}${memory.tasks.length && memory.habits ? ' e ' : ''}${memory.habits ? `${memory.habits} hábitos feitos` : ''}.`}</p>
          </div>
        )}
      </div>

      <div className="today-main">
        {groups.length === 0 && (
          <div className="empty">
            <p className="empty-title">Nenhum hábito para este dia</p>
            <p className="empty-text">Crie um hábito ou ajuste os dias da semana de um existente.</p>
            <button type="button" className="btn-secondary" onClick={onCreate}>
              <Icon name="Plus" size={18} /> Novo hábito
            </button>
          </div>
        )}

        {groups.map((g) => {
          const d = g.habits.filter((h) => isDone(h, data.log, selectedKey)).length;
          return (
            <section key={g.id} className="hgroup" aria-labelledby={`sec-${g.id}`}>
              <div className="hgroup-head">
                <h2 id={`sec-${g.id}`}>{g.label}</h2>
                <span className="hgroup-count">
                  {d}/{g.habits.length}
                </span>
                {isToday && !pause && g.habits.length - d >= 2 && (
                  <button type="button" className="routine-btn" onClick={() => setRunner(g.id)} aria-label={`Começar a rotina da ${g.label.toLowerCase()}`}>
                    <Icon name="Play" size={11} strokeWidth={2.6} /> Rotina
                  </button>
                )}
              </div>
              <div className="group">
                {g.habits.map((h) => (
                  <HabitRow
                    key={h.id}
                    habit={h}
                    data={data}
                    dayKey={selectedKey}
                    today={today}
                    streak={streaks[h.id]}
                    onToggle={onToggle}
                    onOpen={onOpen}
                    onMinimal={onMinimal}
                    timerRunning={!!timer && timer.habitId === h.id && timer.day === selectedKey}
                  />
                ))}
              </div>
            </section>
          );
        })}

        <PartnerSection data={data} today={today} />

        {unlisted.length > 0 && (
          <section className="hgroup">
            <button type="button" className="off-toggle" onClick={() => setShowOff((v) => !v)} aria-expanded={showOff}>
              <span>Fora de hoje</span>
              <span className="hgroup-count">{unlisted.length}</span>
              <motion.span animate={{ rotate: showOff ? 0 : -90 }} transition={{ duration: 0.16, ease: EASE_OUT }}>
                <Icon name="ChevronDown" size={15} />
              </motion.span>
            </button>
            {showOff && (
              <div className="off-list">
                {unlisted.map((h) => (
                  <button key={h.id} type="button" className="off-item" onClick={() => onOpen(h)} style={{ '--c': colorOf(h.color).value }}>
                    <Icon name={h.icon} size={15} />
                    <span>{h.name}</span>
                  </button>
                ))}
              </div>
            )}
          </section>
        )}
      </div>

      <AnimatePresence>
        {menu.state && (
          <Popover key="hm" anchor={menu.state.anchor} desktop={desktop} onClose={menu.close} title="Hábitos" width={260} align="end">
            <MenuList
              items={[
                ...(onStats ? [{ key: 'stats', label: 'Evolução e jardim', icon: 'Activity' }] : []),
                ...(onDay
                  ? [
                      {
                        key: 'hard',
                        label: hard ? 'Desfazer dia difícil' : 'Dia difícil',
                        icon: 'CloudDrizzle',
                        hint: !hard && recentHard ? 'já usado na semana' : '',
                        active: hard,
                      },
                    ]
                  : []),
                { key: 'manage', label: 'Organizar, pausas e viagem', icon: 'ListOrdered' },
                { key: 'new', label: 'Novo hábito', icon: 'Plus' },
              ]}
              onPick={(it) => {
                menu.close();
                if (it.key === 'stats') onStats();
                if (it.key === 'hard' && (hard || !recentHard)) onDay(selectedKey, { hard: !hard });
                if (it.key === 'manage') onManage();
                if (it.key === 'new') onCreate();
              }}
            />
            {!hard && <p className="field-hint px-3 pb-2">Dia difícil: o que ficar pendente não conta e as sequências ficam protegidas. Um por semana.</p>}
          </Popover>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {runner && (
          <RoutineRunner
            key="runner"
            title={(PERIODS.find((p) => p.id === runner) || {}).label || 'Rotina'}
            habits={(groups.find((g) => g.id === runner) || { habits: [] }).habits.filter((h) => !isWeekly(h) || !isDone(h, data.log, selectedKey))}
            data={data}
            dayKey={selectedKey}
            onToggle={(h) => {
              onToggle(h);
              if (h.duration > 0) setRunner(null);
            }}
            onMinimal={onMinimal}
            onClose={() => setRunner(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
