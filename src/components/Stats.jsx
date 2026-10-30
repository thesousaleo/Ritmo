import React, { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Icon, AnimatedNumber, SPRING, swapProps, Segmented } from './ui.jsx';
import { PageHeader } from './Today.jsx';
import { Garden, InsightsPanel } from './Insights.jsx';
import {
  WEEKDAY_LETTER, WEEKDAY_SHORT, MOODS, colorOf, keyOf, addDays, fmtLong, fmtShort, fmtMonth,
  currentStreak, daySummary, habitRate, activeHabits, isWeekly, isAvoid, streakShort, moodInsights, milestoneGallery,
} from '../lib/habits.js';

function heatLevel(s) {
  if (!s) return -1;
  if (s.paused) return 'p';
  if (s.ratio === null) return -1;
  if (s.ratio === 0) return 0;
  if (s.ratio < 0.34) return 1;
  if (s.ratio < 0.67) return 2;
  if (s.ratio < 1) return 3;
  return 4;
}

const moodIcon = (v) => (MOODS[Math.min(4, Math.max(0, Math.round(v) - 1))] || MOODS[2]).icon;

export function StatsView(props) {
  const [tab, setTab] = useState('summary');
  const { data, today, onOpen, onOpenTask, headerRight } = props;
  return (
    <div className="stats-wrap">
      <div className="stats-header">
        <PageHeader title="Evolução">
          {headerRight}
        </PageHeader>
        <div className="stats-tabs">
          <Segmented
            id="stats-tab"
            label="Seção"
            value={tab}
            onChange={setTab}
            options={[
              { id: 'summary', label: 'Resumo' },
              { id: 'garden', label: 'Jardim' },
              { id: 'insights', label: 'Insights' },
            ]}
          />
        </div>
      </div>
      {tab === 'summary' && <SummaryView {...props} />}
      {tab === 'garden' && <Garden data={data} today={today} onOpen={onOpen} />}
      {tab === 'insights' && <InsightsPanel data={data} today={today} onOpenTask={onOpenTask || (() => {})} />}
    </div>
  );
}

function SummaryView({ data, today, weeks = 18, onReset, onOpen }) {
  const todayKey = keyOf(today);
  const [picked, setPicked] = useState(todayKey);
  const [confirmReset, setConfirmReset] = useState(false);
  const [resetError, setResetError] = useState('');
  const [resetting, setResetting] = useState(false);
  const active = activeHabits(data);

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
        const s = future ? null : daySummary(data, date);
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
        const s = daySummary(data, d);
        done += s.done;
        total += s.total;
      }
      return total ? done / total : 0;
    };
    const days = [];
    for (let i = 0; i < 7; i++) {
      const d = addDays(sunday, i);
      const future = d > today;
      days.push({ d, future, s: future ? null : daySummary(data, d) });
    }
    return { days, thisRate: rate(sunday, today), lastRate: rate(addDays(sunday, -7), addDays(sunday, -1)) };
  }, [data, today]);

  const perHabit = useMemo(
    () => active.map((h) => ({ h, rate: habitRate(h, data, today).rate, current: currentStreak(h, data, today) })),
    [data, today] // eslint-disable-line react-hooks/exhaustive-deps
  );
  const gallery = useMemo(() => milestoneGallery(data, today), [data, today]);
  const insights = useMemo(() => moodInsights(data, today).slice(0, 4), [data, today]);
  const top = gallery.reduce((a, b) => (b.best > (a ? a.best : -1) ? b : a), null);
  const reachedCount = gallery.reduce((n, g) => n + g.marks.filter((m) => m.reached).length, 0);

  const perfectDays = useMemo(() => {
    let n = 0;
    for (let i = 1; i <= 30; i++) {
      const s = daySummary(data, addDays(today, -i));
      if (s.total && s.done === s.total) n++;
    }
    return n;
  }, [data, today]);

  const pickedCell = cells.find((c) => c.k === picked);
  const pickedText =
    pickedCell && pickedCell.s
      ? pickedCell.s.paused
        ? 'Dia em pausa'
        : pickedCell.s.total
          ? `${pickedCell.s.done} de ${pickedCell.s.total} hábitos concluídos`
          : 'Nenhum hábito obrigatório'
      : '';
  const pickedMood = pickedCell && data.moods && data.moods[pickedCell.k];
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
      <ProductivityPanel data={data} today={today} />

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
                  className={`heat-cell lv${heatLevel(c.s)}${picked === c.k ? ' is-picked' : ''}${c.future ? ' is-future' : ''}`}
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
            <span className="flex-1">{pickedText}</span>
            {pickedMood ? <Icon name={moodIcon(pickedMood)} size={16} aria-label={`Humor: ${MOODS[pickedMood - 1].label}`} /> : null}
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
            <span className="mid-unit">{top && isWeekly(top.h) ? 'semanas' : 'dias'}</span>
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

      <section className="panel stats-marks" aria-labelledby="marks-title">
        <div className="panel-head">
          <h2 id="marks-title">Marcos</h2>
          <span className="section-count">{reachedCount} conquistados</span>
        </div>
        <ul className="marks">
          {gallery.map(({ h, marks }) => (
            <li key={h.id} className="marks-row" style={{ '--c': colorOf(h.color).value }}>
              <span className="marks-name">
                <Icon name={h.icon} size={15} />
                <span className="truncate">{h.name}</span>
              </span>
              <span className="marks-badges">
                {marks.map((m) => (
                  <span key={m.value} className={`badge${m.reached ? ' is-on' : ''}`} title={`${m.value} ${isWeekly(h) ? 'semanas' : 'dias'}`}>
                    {m.value}
                    {isWeekly(h) ? 's' : ''}
                  </span>
                ))}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="panel stats-mood" aria-labelledby="mood-title">
        <div className="panel-head">
          <h2 id="mood-title">Humor e hábitos</h2>
          <span className="section-count">últimos 120 dias</span>
        </div>
        {insights.length === 0 ? (
          <p className="panel-empty">Registre o humor do dia na tela Hoje. Com alguns dias de registro, aparece aqui como cada hábito se relaciona com ele.</p>
        ) : (
          <ul className="insights">
            {insights.map(({ h, withAvg, withoutAvg, diff }) => (
              <li key={h.id} className="insight" style={{ '--c': colorOf(h.color).value }}>
                <span className="tile sm">
                  <Icon name={h.icon} size={16} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="insight-title">{h.name}</span>
                  <span className="insight-text">
                    {Math.abs(diff) < 0.15
                      ? 'Sem diferença clara no humor'
                      : diff > 0
                        ? `Humor ${diff.toFixed(1).replace('.', ',')} ponto${diff >= 1.95 ? 's' : ''} melhor nos dias em que ${isAvoid(h) ? 'você evita' : 'você faz'}`
                        : `Humor ${Math.abs(diff).toFixed(1).replace('.', ',')} ponto${Math.abs(diff) >= 1.95 ? 's' : ''} menor nos dias em que ${isAvoid(h) ? 'você evita' : 'você faz'}`}
                  </span>
                </span>
                <span className="insight-faces" aria-label={`Média ${withAvg.toFixed(1)} com, ${withoutAvg.toFixed(1)} sem`}>
                  <Icon name={moodIcon(withoutAvg)} size={16} className="opacity-50" />
                  <Icon name="ArrowRight" size={12} className="opacity-50" />
                  <Icon name={moodIcon(withAvg)} size={18} />
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="stats-habits flex flex-col gap-2" aria-labelledby="habits-title">
        <div className="section-head">
          <h2 id="habits-title">Por hábito</h2>
          <span className="section-count">toque para ver detalhes</span>
        </div>
        <div className="group">
          {perHabit.map(({ h, rate, current }) => (
            <button key={h.id} type="button" className="row stat-row" style={{ '--c': colorOf(h.color).value }} onClick={() => onOpen(h)}>
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
                  <Icon name={isAvoid(h) ? 'ShieldCheck' : 'Flame'} size={12} strokeWidth={2.4} />
                  {current}
                  {streakShort(h)}
                </span>
              </span>
              <Icon name="ChevronRight" size={16} className="row-chevron" />
            </button>
          ))}
        </div>
      </section>

      {data.sample && (
        <section className="sample-note stats-note">
          <AnimatePresence mode="wait" initial={false}>
            {!confirmReset ? (
              <motion.div key="note" className="flex flex-col gap-3" {...swapProps}>
                <p>As tarefas, eventos e o histórico que você vê são exemplos, para explorar o app. Quando quiser, comece do zero.</p>
                <button type="button" className="btn-secondary self-start" onClick={() => setConfirmReset(true)}>
                  Começar do zero
                </button>
              </motion.div>
            ) : (
              <motion.div key="confirm" className="flex flex-col gap-3" {...swapProps}>
                <p>Isso apaga o histórico de hábitos, humor e foco e as tarefas e eventos de exemplo, inclusive nos outros aparelhos. Os hábitos e as listas continuam. Não dá para desfazer.</p>
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

/** Tarefas concluídas e minutos de foco nos últimos 7 dias. */
function ProductivityPanel({ data, today }) {
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = addDays(today, -i);
    const k = keyOf(d);
    const done = (data.tasks || []).filter((t) => t.done && t.completedAt && keyOf(new Date(t.completedAt)) === k).length;
    const focus = (data.focus || []).filter((f) => keyOf(new Date(f.startedAt)) === k).reduce((n, f) => n + f.minutes, 0);
    days.push({ k, d, done, focus });
  }
  const totalDone = days.reduce((n, x) => n + x.done, 0);
  const totalFocus = days.reduce((n, x) => n + x.focus, 0);
  const maxDone = Math.max(3, ...days.map((x) => x.done));
  const todayKey = keyOf(today);
  const overdue = (data.tasks || []).filter((t) => !t.done && t.date && t.date < todayKey).length;
  return (
    <section className="panel stats-prod" aria-labelledby="prod-title">
      <div className="panel-head">
        <h2 id="prod-title">Produtividade</h2>
        <span className="section-count">últimos 7 dias</span>
      </div>
      <div className="prod-row">
        <div className="prod-nums">
          <p className="mid-num">
            {totalDone}
            <span className="mid-unit">tarefas concluídas</span>
          </p>
          <p className="mid-num sm">
            {totalFocus >= 60 ? `${Math.floor(totalFocus / 60)}h${totalFocus % 60 ? String(totalFocus % 60).padStart(2, '0') : ''}` : `${totalFocus}min`}
            <span className="mid-unit">de foco</span>
          </p>
          {overdue > 0 && <p className="prod-late">{overdue} {overdue === 1 ? 'tarefa atrasada' : 'tarefas atrasadas'}</p>}
        </div>
        <div className="bars" aria-label="Tarefas concluídas por dia">
          {days.map((x, i) => (
            <div key={x.k} className="bar-col">
              <span className="bar-track">
                <motion.span className="bar-fill" initial={{ scaleY: 0 }} animate={{ scaleY: x.done / maxDone }} transition={{ ...SPRING.progress, delay: i * 0.03 }} />
              </span>
              <span className={`bar-label${x.k === todayKey ? ' is-today' : ''}`}>{WEEKDAY_LETTER[x.d.getDay()]}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
