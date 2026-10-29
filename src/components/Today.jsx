import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Icon, AnimatedNumber, RollingNumber, SPRING, EASE_OUT } from './ui.jsx';
import {
  PERIODS, PERIOD_SHORT, WEEKDAY_LETTER, MOODS, colorOf, keyOf, fromKey, addDays, fmtLong, greetingFor,
  isListed, isScheduled, isWeekly, isAvoid, isDone, countOf, currentStreak, daySummary, weekCount, weekStart,
  activeHabits, breakOn, shortDate, streakShort,
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
    <div className="ring" role="img" aria-label={paused ? 'Dia em pausa' : `${done} de ${total} hábitos concluídos`}>
      <svg viewBox="0 0 120 120" className="ring-svg">
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

function HabitRow({ habit, data, dayKey, today, streak, onToggle, onOpen, timerRunning }) {
  const c = colorOf(habit.color);
  const count = countOf(data.log, dayKey, habit.id);
  const done = count >= habit.target;
  const hasNote = !!(data.notes && data.notes[dayKey] && data.notes[dayKey][habit.id]);

  let meta;
  if (isWeekly(habit)) {
    const n = weekCount(habit, data.log, weekStart(fromKey(dayKey)));
    meta = `${Math.min(n, habit.perWeek)} de ${habit.perWeek} nesta semana`;
  } else if (habit.target > 1) meta = `${count} de ${habit.target} ${habit.unit}`.trim();
  else if (habit.duration > 0) meta = timerRunning ? 'Temporizador em andamento' : `${habit.duration} minutos`;
  else if (isAvoid(habit)) meta = done ? 'Evitado hoje' : 'Evitar';
  else meta = habit.unit || 'Uma vez';

  return (
    <div className={`row${done ? ' is-done' : ''}`} style={{ '--c': c.value }}>
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
            <span className="truncate">{meta}</span>
            {hasNote && <Icon name="StickyNote" size={13} className="flex-none" aria-label="Tem nota" />}
            {habit.reminder && !done && dayKey === keyOf(today) && (
              <span className="reminder-chip">
                <Icon name="Bell" size={11} strokeWidth={2.4} />
                {habit.reminder}
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
      <CheckButton habit={habit} count={count} onPress={() => onToggle(habit)} timerRunning={timerRunning} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Humor do dia                                                        */
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
export function TodayView({ data, today, selectedKey, onSelectDay, onToggle, onOpen, onCreate, onManage, onMood, onEndBreak, timer, headerRight, title }) {
  const selectedDate = fromKey(selectedKey);
  const isToday = selectedKey === keyOf(today);
  const active = activeHabits(data);
  const listed = active.filter((h) => isListed(h, selectedDate));
  const unlisted = active.filter((h) => !isListed(h, selectedDate));
  const summary = daySummary(data, selectedDate);
  const percent = Math.round(summary.partial * 100);
  const pause = breakOn(data, selectedKey);

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
  const headline = pause
    ? 'Dia em pausa'
    : summary.total === 0
      ? 'Nada obrigatório hoje'
      : remaining === 0
        ? 'Dia completo'
        : isToday
          ? `Faltam ${remaining}`
          : `${remaining} ficaram pendentes`;

  return (
    <div className="today">
      <div className="today-side">
        <PageHeader
          title={title || `${greetingFor(new Date())}${data.name ? `, ${data.name}` : ''}`}
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

        {pause && (
          <div className="pause-banner">
            <Icon name="Palmtree" size={20} />
            <p className="flex-1 min-w-0">
              Pausa até <strong>{shortDate(pause.end)}</strong>. Suas sequências estão protegidas.
            </p>
            {isToday && (
              <button type="button" className="btn-secondary sm" onClick={() => onEndBreak(pause)}>
                Encerrar
              </button>
            )}
          </div>
        )}

        <section className="progress" aria-label="Progresso do dia">
          <DayRing items={ringItems} done={summary.done} total={summary.total} percent={percent} paused={!!pause} />
          <div className="progress-side">
            <p className="progress-head">{headline}</p>
            <ul className="period-list">
              {groups.map((g) => {
                const req = g.habits.filter((h) => !isWeekly(h));
                if (!req.length) return null;
                const d = req.filter((h) => isDone(h, data.log, selectedKey)).length;
                return (
                  <li key={g.id} className="period-item">
                    <span className="period-name">{PERIOD_SHORT[g.id]}</span>
                    <span className="period-bar" aria-hidden="true">
                      <motion.span className="period-bar-fill" initial={false} animate={{ scaleX: d / req.length }} transition={SPRING.progress} />
                    </span>
                    <span className="period-count">
                      {d}/{req.length}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        </section>

        <MoodPicker value={(data.moods && data.moods[selectedKey]) || 0} onChange={(m) => onMood(selectedKey, m)} isToday={isToday} />
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
                  <HabitRow
                    key={h.id}
                    habit={h}
                    data={data}
                    dayKey={selectedKey}
                    today={today}
                    streak={streaks[h.id]}
                    onToggle={onToggle}
                    onOpen={onOpen}
                    timerRunning={!!timer && timer.habitId === h.id && timer.day === selectedKey}
                  />
                ))}
              </div>
            </section>
          );
        })}

        {unlisted.length > 0 && (
          <section className="flex flex-col gap-2" aria-labelledby="sec-off">
            <div className="section-head">
              <h2 id="sec-off" className="is-quiet">
                Fora da programação
              </h2>
            </div>
            <div className="off-list">
              {unlisted.map((h) => (
                <button key={h.id} type="button" className="off-item" onClick={() => onOpen(h)} style={{ '--c': colorOf(h.color).value }}>
                  <Icon name={h.icon} size={15} />
                  <span>{h.name}</span>
                </button>
              ))}
            </div>
          </section>
        )}

        <button type="button" className="manage-link" onClick={onManage}>
          <Icon name="ListOrdered" size={17} />
          Organizar hábitos, arquivo e pausas
        </button>
      </div>
    </div>
  );
}
