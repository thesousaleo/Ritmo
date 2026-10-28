import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Icon, AnimatedNumber, RollingNumber, SPRING, EASE_OUT } from './ui.jsx';
import {
  PERIODS, PERIOD_SHORT, WEEKDAY_LETTER, colorOf, keyOf, fromKey, addDays, fmtLong, greetingFor,
  isScheduled, isDone, countOf, currentStreak, daySummary,
} from '../lib/habits.js';

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

function DayRing({ items, done, total, percent }) {
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
    <div className="ring" role="img" aria-label={`${done} de ${total} hábitos concluídos`}>
      <svg viewBox="0 0 120 120" className="ring-svg">
        {n === 0 && <circle cx="60" cy="60" r={R} fill="none" stroke="var(--surface-2)" strokeWidth={SW} />}
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
        <span className="ring-num">
          <AnimatedNumber value={percent} />
          <span className="ring-pct">%</span>
        </span>
        <span className="ring-sub">
          {done} de {total}
        </span>
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
    const end = addDays(today, 6 - today.getDay());
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
        const summary = future ? null : daySummary(data.habits, data.log, d);
        return (
          <button
            key={k}
            type="button"
            role="option"
            aria-selected={selected}
            data-selected={selected}
            disabled={future}
            className={`day${selected ? ' is-selected' : ''}${k === todayKey ? ' is-today' : ''}`}
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
function CheckButton({ habit, count, onPress }) {
  const c = colorOf(habit.color);
  const multi = habit.target > 1;
  const done = count >= habit.target;
  const [burst, setBurst] = useState(0);
  const prevDone = useRef(done);

  useEffect(() => {
    if (done && !prevDone.current) setBurst((b) => b + 1);
    prevDone.current = done;
  }, [done]);

  const label = multi
    ? done
      ? `${habit.name}: meta concluída. Tocar para zerar`
      : `${habit.name}: ${count} de ${habit.target}. Tocar para somar 1`
    : done
      ? `Desmarcar ${habit.name}`
      : `Concluir ${habit.name}`;

  return (
    <motion.button
      type="button"
      className="check"
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
      {multi && !done && (
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

function HabitRow({ habit, count, streak, onToggle, onEdit }) {
  const c = colorOf(habit.color);
  const done = count >= habit.target;
  const meta = habit.target > 1 ? `${count} de ${habit.target} ${habit.unit}`.trim() : habit.unit || 'Uma vez';

  return (
    <div className={`row${done ? ' is-done' : ''}`} style={{ '--c': c.value }}>
      <button type="button" className="row-main" onClick={() => onEdit(habit)} aria-label={`Editar ${habit.name}`}>
        <span className="tile">
          <Icon name={habit.icon} size={20} />
        </span>
        <span className="row-text">
          <span className="row-title">
            <span className="row-title-text">{habit.name}</span>
            <motion.span className="strike" initial={false} animate={{ scaleX: done ? 1 : 0 }} transition={{ duration: done ? 0.22 : 0.12, ease: EASE_OUT }} />
          </span>
          <span className="row-meta">
            <span className="truncate">{meta}</span>
            {streak > 0 && (
              <span className="streak" aria-label={`Sequência de ${streak} ${streak === 1 ? 'dia' : 'dias'}`}>
                <Icon name="Flame" size={13} strokeWidth={2.4} />
                <RollingNumber value={streak} />
              </span>
            )}
          </span>
        </span>
      </button>
      <CheckButton habit={habit} count={count} onPress={() => onToggle(habit)} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Tela Hoje                                                           */
/* ------------------------------------------------------------------ */
export function TodayView({ data, today, selectedKey, onSelectDay, onToggle, onEdit, onCreate, headerRight }) {
  const selectedDate = fromKey(selectedKey);
  const isToday = selectedKey === keyOf(today);
  const scheduled = data.habits.filter((h) => isScheduled(h, selectedDate));
  const unscheduled = data.habits.filter((h) => !isScheduled(h, selectedDate));
  const summary = daySummary(data.habits, data.log, selectedDate);
  const percent = Math.round(summary.partial * 100);

  const ringItems = PERIODS.flatMap((p) => scheduled.filter((h) => h.period === p.id)).map((h) => ({
    id: h.id,
    color: colorOf(h.color).value,
    frac: countOf(data.log, selectedKey, h.id) / h.target,
  }));

  const streaks = useMemo(() => {
    const out = {};
    for (const h of data.habits) out[h.id] = currentStreak(h, data.log, today);
    return out;
  }, [data, today]);

  const groups = PERIODS.map((p) => ({ ...p, habits: scheduled.filter((h) => h.period === p.id) })).filter((g) => g.habits.length);
  const remaining = summary.total - summary.done;
  const headline =
    summary.total === 0 ? 'Nada programado' : remaining === 0 ? 'Dia completo' : isToday ? `Faltam ${remaining}` : `${remaining} ficaram pendentes`;

  return (
    <div className="today">
      <div className="today-side">
        <PageHeader
          title={`${greetingFor(new Date())}${data.name ? `, ${data.name}` : ''}`}
          subtitle={isToday ? `Hoje, ${fmtLong.format(selectedDate)}` : fmtLong.format(selectedDate)}
        >
          <AnimatePresence initial={false}>
            {!isToday && (
              <motion.button
                type="button"
                className="chip-btn"
                onClick={() => onSelectDay(keyOf(today))}
                initial={{ opacity: 0, scale: 0.94 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.94, transition: { duration: 0.12 } }}
                transition={{ duration: 0.18, ease: EASE_OUT }}
                style={{ transformOrigin: 'right center' }}
              >
                Ir para hoje
              </motion.button>
            )}
          </AnimatePresence>
          {headerRight}
        </PageHeader>

        <WeekStrip data={data} selectedKey={selectedKey} onSelect={onSelectDay} today={today} />

        <section className="progress" aria-label="Progresso do dia">
          <DayRing items={ringItems} done={summary.done} total={summary.total} percent={percent} />
          <div className="progress-side">
            <p className="progress-head">{headline}</p>
            <ul className="period-list">
              {groups.map((g) => {
                const d = g.habits.filter((h) => isDone(h, data.log, selectedKey)).length;
                return (
                  <li key={g.id} className="period-item">
                    <span className="period-name">{PERIOD_SHORT[g.id]}</span>
                    <span className="period-bar" aria-hidden="true">
                      <motion.span className="period-bar-fill" initial={false} animate={{ scaleX: d / g.habits.length }} transition={SPRING.progress} />
                    </span>
                    <span className="period-count">
                      {d}/{g.habits.length}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        </section>
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
            <section key={g.id} className="flex flex-col gap-2" aria-labelledby={`sec-${g.id}`}>
              <div className="section-head">
                <h2 id={`sec-${g.id}`}>{g.label}</h2>
                <span className="section-count">
                  {d} de {g.habits.length}
                </span>
              </div>
              <div className="group">
                {g.habits.map((h) => (
                  <HabitRow key={h.id} habit={h} count={countOf(data.log, selectedKey, h.id)} streak={streaks[h.id]} onToggle={onToggle} onEdit={onEdit} />
                ))}
              </div>
            </section>
          );
        })}

        {unscheduled.length > 0 && (
          <section className="flex flex-col gap-2" aria-labelledby="sec-off">
            <div className="section-head">
              <h2 id="sec-off" className="is-quiet">
                Fora da programação
              </h2>
            </div>
            <div className="off-list">
              {unscheduled.map((h) => (
                <button key={h.id} type="button" className="off-item" onClick={() => onEdit(h)} style={{ '--c': colorOf(h.color).value }}>
                  <Icon name={h.icon} size={15} />
                  <span>{h.name}</span>
                </button>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
