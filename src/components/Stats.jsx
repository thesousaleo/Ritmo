import React, { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Icon, AnimatedNumber, SPRING, swapProps } from './ui.jsx';
import { PageHeader } from './Today.jsx';
import {
  WEEKDAY_LETTER, WEEKDAY_SHORT, colorOf, keyOf, addDays, fmtLong, fmtShort, fmtMonth,
  isScheduled, isDone, currentStreak, bestStreak, daySummary,
} from '../lib/habits.js';

function heatLevel(ratio) {
  if (ratio === null || ratio === undefined) return -1;
  if (ratio === 0) return 0;
  if (ratio < 0.34) return 1;
  if (ratio < 0.67) return 2;
  if (ratio < 1) return 3;
  return 4;
}

export function StatsView({ data, today, weeks = 18, onReset, headerRight }) {
  const todayKey = keyOf(today);
  const [picked, setPicked] = useState(todayKey);
  const [confirmReset, setConfirmReset] = useState(false);
  const [resetError, setResetError] = useState('');
  const [resetting, setResetting] = useState(false);

  const { cells, months } = useMemo(() => {
    const end = addDays(today, 6 - today.getDay());
    const start = addDays(end, -(weeks * 7 - 1));
    const cells = [];
    const months = [];
    for (let w = 0; w < weeks; w++) {
      for (let dow = 0; dow < 7; dow++) {
        const date = addDays(start, w * 7 + dow);
        const k = keyOf(date);
        const future = k > todayKey;
        const s = future ? null : daySummary(data.habits, data.log, date);
        cells.push({ k, date, future, s, w, dow });
        if ((date.getDate() === 1 || (w === 0 && dow === 0)) && (!months.length || months[months.length - 1].w !== w)) {
          months.push({ w, label: fmtMonth.format(date).replace('.', '') });
        }
      }
    }
    if (months.length > 1 && months[1].w - months[0].w < 3) months.shift();
    return { cells, months };
  }, [data, today, todayKey, weeks]);

  const week = useMemo(() => {
    const sunday = addDays(today, -today.getDay());
    const rate = (from, to) => {
      let done = 0;
      let total = 0;
      for (let d = from; d <= to; d = addDays(d, 1)) {
        const s = daySummary(data.habits, data.log, d);
        done += s.done;
        total += s.total;
      }
      return total ? done / total : 0;
    };
    const days = [];
    for (let i = 0; i < 7; i++) {
      const d = addDays(sunday, i);
      const future = d > today;
      days.push({ d, future, s: future ? null : daySummary(data.habits, data.log, d) });
    }
    return { days, thisRate: rate(sunday, today), lastRate: rate(addDays(sunday, -7), addDays(sunday, -1)) };
  }, [data, today]);

  const perHabit = useMemo(
    () =>
      data.habits.map((h) => {
        let done = 0;
        let total = 0;
        for (let i = 0; i < 30; i++) {
          const d = addDays(today, -i);
          if (!isScheduled(h, d)) continue;
          if (i === 0 && !isDone(h, data.log, keyOf(d))) continue;
          total++;
          if (isDone(h, data.log, keyOf(d))) done++;
        }
        return { h, rate: total ? done / total : 0, current: currentStreak(h, data.log, today), best: bestStreak(h, data.log, today) };
      }),
    [data, today]
  );

  const top = perHabit.reduce((a, b) => (b.best > (a ? a.best : -1) ? b : a), null);

  const perfectDays = useMemo(() => {
    let n = 0;
    for (let i = 1; i <= 30; i++) {
      const s = daySummary(data.habits, data.log, addDays(today, -i));
      if (s.total && s.done === s.total) n++;
    }
    return n;
  }, [data, today]);

  const pickedCell = cells.find((c) => c.k === picked);
  const pickedText =
    pickedCell && pickedCell.s
      ? pickedCell.s.total
        ? `${pickedCell.s.done} de ${pickedCell.s.total} hábitos concluídos`
        : 'Nenhum hábito programado'
      : '';
  const delta = Math.round((week.thisRate - week.lastRate) * 100);

  const doReset = async () => {
    setResetting(true);
    setResetError('');
    try {
      await onReset();
      setConfirmReset(false);
    } catch (e) {
      setResetError('Não deu para apagar o histórico agora. Verifique a conexão e tente de novo.');
    } finally {
      setResetting(false);
    }
  };

  return (
    <div className="stats">
      <div className="stats-header">
        <PageHeader title="Consistência" subtitle="Como seus hábitos se sustentam ao longo das semanas">
          {headerRight}
        </PageHeader>
      </div>

      <section className="panel stats-heat" aria-labelledby="heat-title">
        <div className="panel-head">
          <h2 id="heat-title">Últimas {weeks} semanas</h2>
          <span className="legend" aria-hidden="true">
            Menos
            {[0, 1, 2, 3, 4].map((l) => (
              <i key={l} className={`heat-cell lv${l}`} />
            ))}
            Mais
          </span>
        </div>
        <div className="heat-wrap">
          <div className="heat-days" aria-hidden="true">
            {WEEKDAY_SHORT.map((w, i) => (
              <span key={w}>{i % 2 === 1 ? w : ''}</span>
            ))}
          </div>
          <div className="heat-main">
            <div className="heat-months" aria-hidden="true" style={{ gridTemplateColumns: `repeat(${weeks}, 1fr)` }}>
              {months.map((m) => (
                <span key={m.w} style={{ gridColumn: `${m.w + 1} / span 3` }}>
                  {m.label}
                </span>
              ))}
            </div>
            <div className="heat-grid" style={{ gridTemplateColumns: `repeat(${weeks}, 1fr)` }} aria-label="Mapa de consistência">
              {cells.map((c) => (
                <button
                  key={c.k}
                  type="button"
                  disabled={c.future}
                  className={`heat-cell lv${heatLevel(c.s ? c.s.ratio : null)}${picked === c.k ? ' is-picked' : ''}${c.future ? ' is-future' : ''}`}
                  style={{ gridColumn: c.w + 1, gridRow: c.dow + 1 }}
                  onClick={() => setPicked(c.k)}
                  aria-label={`${fmtLong.format(c.date)}${c.s && c.s.total ? `: ${c.s.done} de ${c.s.total}` : ''}`}
                />
              ))}
            </div>
          </div>
        </div>
        {pickedCell && (
          <p className="heat-info" aria-live="polite">
            <span className="heat-info-date">{fmtShort.format(pickedCell.date).replace(/\./g, '')}</span>
            <span>{pickedText}</span>
          </p>
        )}
      </section>

      <section className="panel stats-week" aria-labelledby="week-title">
        <div className="panel-head">
          <h2 id="week-title">Esta semana</h2>
          {week.lastRate > 0 && (
            <span className={`delta${delta >= 0 ? ' up' : ' down'}`}>
              {delta >= 0 ? '+' : ''}
              {delta} pts vs. semana passada
            </span>
          )}
        </div>
        <div className="week-row">
          <p className="big-num">
            <AnimatedNumber value={Math.round(week.thisRate * 100)} />
            <span className="big-unit">%</span>
            <span className="big-label">concluído</span>
          </p>
          <div className="bars" aria-label="Conclusão por dia nesta semana">
            {week.days.map((w, i) => (
              <div key={i} className="bar-col">
                <span className="bar-track">
                  <motion.span
                    className="bar-fill"
                    initial={{ scaleY: 0 }}
                    animate={{ scaleY: w.s && w.s.ratio ? w.s.ratio : 0 }}
                    transition={{ ...SPRING.progress, delay: i * 0.03 }}
                  />
                </span>
                <span className={`bar-label${keyOf(w.d) === todayKey ? ' is-today' : ''}`}>{WEEKDAY_LETTER[i]}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <div className="stats-pair">
        <section className="panel compact" aria-labelledby="best-title">
          <h2 id="best-title" className="panel-label">
            Maior sequência
          </h2>
          <p className="mid-num">
            {top ? top.best : 0}
            <span className="mid-unit">dias</span>
          </p>
          {top && (
            <p className="panel-foot" style={{ '--c': colorOf(top.h.color).value }}>
              <Icon name={top.h.icon} size={14} /> {top.h.name}
            </p>
          )}
        </section>
        <section className="panel compact" aria-labelledby="perfect-title">
          <h2 id="perfect-title" className="panel-label">
            Dias completos
          </h2>
          <p className="mid-num">
            {perfectDays}
            <span className="mid-unit">de 30</span>
          </p>
          <p className="panel-foot">Todos os hábitos do dia</p>
        </section>
      </div>

      <section className="stats-habits flex flex-col gap-2" aria-labelledby="habits-title">
        <div className="section-head">
          <h2 id="habits-title">Por hábito</h2>
          <span className="section-count">últimos 30 dias</span>
        </div>
        <div className="group">
          {perHabit.map(({ h, rate, current, best }) => (
            <div key={h.id} className="row stat-row" style={{ '--c': colorOf(h.color).value }}>
              <span className="tile">
                <Icon name={h.icon} size={20} />
              </span>
              <span className="row-text">
                <span className="row-title">
                  <span className="row-title-text">{h.name}</span>
                </span>
                <span className="rate-bar" aria-hidden="true">
                  <span className="rate-fill" style={{ transform: `scaleX(${rate})` }} />
                </span>
              </span>
              <span className="stat-nums">
                <span className="stat-rate">{Math.round(rate * 100)}%</span>
                <span className="stat-streak">
                  <span className="inline-flex items-center gap-0.5" aria-label={`Sequência atual: ${current}`}>
                    <Icon name="Flame" size={12} strokeWidth={2.4} />
                    {current}
                  </span>
                  <span>recorde {best}</span>
                </span>
              </span>
            </div>
          ))}
        </div>
      </section>

      {data.sample && (
        <section className="sample-note stats-note">
          <AnimatePresence mode="wait" initial={false}>
            {!confirmReset ? (
              <motion.div key="note" className="flex flex-col gap-3" {...swapProps}>
                <p>O histórico anterior a hoje é de exemplo, para você explorar o app. Seus registros de agora em diante são reais.</p>
                <button type="button" className="btn-secondary self-start" onClick={() => setConfirmReset(true)}>
                  Começar do zero
                </button>
              </motion.div>
            ) : (
              <motion.div key="confirm" className="flex flex-col gap-3" {...swapProps}>
                <p>Isso apaga todo o histórico, inclusive nos outros aparelhos, e mantém só os hábitos cadastrados. Não dá para desfazer.</p>
                {resetError && <p className="field-error">{resetError}</p>}
                <div className="flex gap-2">
                  <button type="button" className="btn-secondary" onClick={() => setConfirmReset(false)} disabled={resetting}>
                    Cancelar
                  </button>
                  <button type="button" className="btn-danger" onClick={doReset} disabled={resetting}>
                    {resetting ? 'Apagando…' : 'Apagar histórico'}
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </section>
      )}
    </div>
  );
}
