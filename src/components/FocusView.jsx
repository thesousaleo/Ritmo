import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Icon, Segmented, Popover, MenuList, usePopover, SPRING, EASE_OUT } from './ui.jsx';
import { PageHeader } from './Today.jsx';
import { colorOf, keyOf } from '../lib/habits.js';
import { groupsFor } from '../lib/tasks.js';
import { PHASE_LABEL, isRunning, remaining, elapsed, focusStats, fmtClock, fmtMinutes } from '../lib/focus.js';
import { AMBIENTS, setAmbientVolume } from '../lib/sound.js';
import { focusOnTask } from '../lib/insights.js';
import { keepAwake } from '../lib/native.js';
import { Portal, useEscape } from './ui.jsx';

/** Tela cheia: só o tempo, a tarefa e um botão. */
function FullFocus({ label, phase, ms, progress, running, onToggle, onExit }) {
  useEscape(onExit);
  useEffect(() => {
    let lock = null;
    keepAwake().then((l) => (lock = l));
    const el = document.documentElement;
    if (el.requestFullscreen && !document.fullscreenElement) el.requestFullscreen().catch(() => {});
    return () => {
      if (lock && lock.release) lock.release().catch(() => {});
      if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(() => {});
    };
  }, []);
  return (
    <Portal>
      <motion.div className="fullfocus" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25, ease: EASE_OUT }} role="dialog" aria-label="Foco em tela cheia">
        <button type="button" className="icon-btn ghost fullfocus-exit" onClick={onExit} aria-label="Sair da tela cheia">
          <Icon name="Minimize2" size={20} />
        </button>
        <span className="fullfocus-phase">{PHASE_LABEL[phase]}</span>
        <span className="fullfocus-time">{fmtClock(ms)}</span>
        <span className="fullfocus-bar" aria-hidden="true">
          <span style={{ transform: `scaleX(${Math.max(0, Math.min(1, progress))})` }} />
        </span>
        <span className="fullfocus-label">{label}</span>
        <button type="button" className="focus-play" onClick={onToggle} aria-label={running ? 'Pausar' : 'Continuar'}>
          <Icon name={running ? 'Pause' : 'Play'} size={28} strokeWidth={2.4} />
        </button>
      </motion.div>
    </Portal>
  );
}

const WD = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];

function useNow(active) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!active) return undefined;
    let raf;
    const loop = () => {
      setNow(Date.now());
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [active]);
  return active ? now : Date.now();
}

function NumberField({ label, value, min, max, onChange, suffix = 'min' }) {
  return (
    <div className="fs-row">
      <span className="flex-1">{label}</span>
      <button type="button" className="icon-btn sm" onClick={() => onChange(Math.max(min, value - 1))} disabled={value <= min} aria-label={`Diminuir ${label}`}>
        <Icon name="Minus" size={14} />
      </button>
      <span className="fs-val">
        {value}
        {suffix && <small> {suffix}</small>}
      </span>
      <button type="button" className="icon-btn sm" onClick={() => onChange(Math.min(max, value + 1))} disabled={value >= max} aria-label={`Aumentar ${label}`}>
        <Icon name="Plus" size={14} />
      </button>
    </div>
  );
}

export function FocusView({ store, todayKey, desktop, headerRight }) {
  const data = store.data;
  const f = store.focus;
  const s = f.state;
  const st = f.settings;
  const running = isRunning(s);
  const now = useNow(running);
  const targetPop = usePopover();
  const setPop = usePopover();
  const soundPop = usePopover();
  const [full, setFull] = useState(false);
  const ambient = store.device.ambient || 'off';

  const isBreak = s.phase === 'short' || s.phase === 'long';
  const ms = s.phase === 'stopwatch' ? elapsed(s, now) : remaining(s, now);
  const progress = s.phase === 'stopwatch' ? (elapsed(s, now) % 3600000) / 3600000 : s.durationMs ? 1 - remaining(s, now) / s.durationMs : 0;
  const R = 112;
  const C = 2 * Math.PI * R;
  const touched = s.phase === 'stopwatch' ? s.elapsedMs > 0 || running : s.remainingMs < s.durationMs || running;

  const task = s.taskId && data.tasks.find((t) => t.id === s.taskId);
  const habit = s.habitId && data.habits.find((h) => h.id === s.habitId);
  const targetLabel = task ? task.title : habit ? habit.name : 'Escolher tarefa';
  const spent = task && task.duration > 0 ? focusOnTask(data, task.id) + (s.phase === 'focus' || s.phase === 'stopwatch' ? Math.floor(elapsed(s, now) / 60000) : 0) : 0;

  const stats = focusStats(data);
  const maxWeek = Math.max(30, ...stats.week.map((d) => d.minutes));
  const nameFor = (k) => {
    if (k === 'none') return 'Sem tarefa';
    const id = k.slice(2);
    if (k.startsWith('t:')) {
      const t = data.tasks.find((x) => x.id === id);
      return t ? t.title : 'Tarefa excluída';
    }
    const h = data.habits.find((x) => x.id === id);
    return h ? h.name : 'Hábito excluído';
  };

  const todayTasks = groupsFor('today', data, todayKey)
    .filter((g) => !g.done)
    .flatMap((g) => g.tasks);
  const otherTasks = data.tasks.filter((t) => !t.done && !todayTasks.includes(t)).slice(0, 12);
  const timedHabits = data.habits.filter((h) => !h.archived && h.kind !== 'avoid');

  return (
    <div className="focus-page">
      <PageHeader title="Foco">
        <button type="button" className={`icon-btn${ambient !== 'off' ? ' is-active' : ''}`} onClick={(e) => soundPop.open(e)} aria-label="Som ambiente">
          <Icon name={ambient !== 'off' ? 'Volume2' : 'VolumeX'} size={18} />
        </button>
        <button type="button" className="icon-btn" onClick={() => setFull(true)} aria-label="Tela cheia">
          <Icon name="Maximize2" size={18} />
        </button>
        <button type="button" className="icon-btn" onClick={(e) => setPop.open(e)} aria-label="Ajustes do foco">
          <Icon name="Settings2" size={18} />
        </button>
        {headerRight}
      </PageHeader>

      <div className="focus-layout">
        <section className={`focus-main${isBreak ? ' is-break' : ''}`} aria-label="Temporizador">
          <Segmented
            id="fmode"
            label="Modo"
            value={s.phase === 'stopwatch' ? 'stopwatch' : 'pomo'}
            onChange={(m) => f.setMode(m)}
            options={[
              { id: 'pomo', label: 'Pomodoro' },
              { id: 'stopwatch', label: 'Cronômetro' },
            ]}
          />
          <button type="button" className="focus-target" onClick={(e) => targetPop.open(e)}>
            <Icon name={habit ? habit.icon : task ? 'SquareCheckBig' : 'Crosshair'} size={16} />
            <span className="truncate">{targetLabel}</span>
            <Icon name="ChevronDown" size={14} />
          </button>
          {task && task.duration > 0 && (
            <span className={`focus-est${spent > task.duration ? ' is-over' : ''}`}>
              {fmtMinutes(spent)} de {fmtMinutes(task.duration)} estimados
            </span>
          )}

          <div className="focus-ring" role="timer" aria-label={`${PHASE_LABEL[s.phase]}: ${fmtClock(ms)}`}>
            <svg viewBox="0 0 260 260" aria-hidden="true">
              <circle cx="130" cy="130" r={R} className="fr-track" />
              <circle cx="130" cy="130" r={R} className="fr-fill" strokeDasharray={C} strokeDashoffset={C * (1 - Math.max(0, Math.min(1, progress)))} />
            </svg>
            <div className="fr-center">
              <AnimatePresence mode="wait" initial={false}>
                <motion.span key={s.phase} className="fr-phase" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.15, ease: EASE_OUT }}>
                  {PHASE_LABEL[s.phase]}
                </motion.span>
              </AnimatePresence>
              <span className="fr-time">{fmtClock(ms)}</span>
              {s.phase !== 'stopwatch' && (
                <span className="fr-cycle" aria-label={`Rodada ${(s.cycle % st.longEvery) + 1} de ${st.longEvery}`}>
                  {Array.from({ length: st.longEvery }, (_, i) => (
                    <i key={i} className={i < s.cycle % st.longEvery ? 'is-on' : ''} />
                  ))}
                </span>
              )}
            </div>
          </div>

          <div className="focus-actions">
            {touched && (
              <button type="button" className="icon-btn lg" onClick={f.stop} aria-label="Encerrar e registrar">
                <Icon name="Square" size={18} />
              </button>
            )}
            <motion.button
              type="button"
              className="focus-play"
              onClick={() => (running ? f.pause() : f.start())}
              whileTap={{ scale: 0.94 }}
              transition={SPRING.press}
              aria-label={running ? 'Pausar' : touched ? 'Continuar' : 'Começar'}
            >
              <Icon name={running ? 'Pause' : 'Play'} size={28} strokeWidth={2.4} />
            </motion.button>
            {s.phase !== 'stopwatch' && (
              <button type="button" className="icon-btn lg" onClick={f.skip} aria-label={isBreak ? 'Pular pausa' : 'Pular para a pausa'}>
                <Icon name="SkipForward" size={18} />
              </button>
            )}
          </div>
          <p className="field-hint text-center">
            {s.phase === 'stopwatch'
              ? 'O tempo conta até você encerrar. Ao encerrar, a sessão é registrada.'
              : `${st.focus} min de foco, ${st.short} de pausa. A cada ${st.longEvery} rodadas, ${st.long} min de pausa longa.`}
          </p>
        </section>

        <section className="focus-stats" aria-label="Estatísticas de foco">
          <div className="fstat-row">
            <div className="fstat">
              <span className="fstat-num">{stats.todayPomos}</span>
              <span className="fstat-label">Pomodoros hoje</span>
            </div>
            <div className="fstat">
              <span className="fstat-num">{fmtMinutes(stats.todayMinutes)}</span>
              <span className="fstat-label">Foco hoje</span>
            </div>
            <div className="fstat">
              <span className="fstat-num">{stats.totalMinutes >= 600 ? `${Math.round(stats.totalMinutes / 60)}h` : fmtMinutes(stats.totalMinutes)}</span>
              <span className="fstat-label">Total</span>
            </div>
          </div>

          <div className="panel">
            <div className="panel-head">
              <h2>Últimos 7 dias</h2>
              <span className="section-count">{fmtMinutes(stats.week.reduce((n, d) => n + d.minutes, 0))}</span>
            </div>
            <div className="fweek">
              {stats.week.map((d, i) => (
                <div key={d.key} className="fweek-col">
                  <span className="fweek-val">{d.minutes ? String(Math.round(d.minutes / 6) / 10).replace('.', ',') : ''}</span>
                  <span className="bar-track">
                    <motion.span className="bar-fill" initial={{ scaleY: 0 }} animate={{ scaleY: d.minutes / maxWeek }} transition={{ ...SPRING.progress, delay: i * 0.03 }} />
                  </span>
                  <span className={`bar-label${d.key === todayKey ? ' is-today' : ''}`}>{WD[new Date(`${d.key}T12:00`).getDay()]}</span>
                </div>
              ))}
            </div>
            <p className="field-hint">Horas de foco por dia.</p>
          </div>

          {stats.byTask.length > 0 && (
            <div className="panel">
              <div className="panel-head">
                <h2>Onde foi o seu foco</h2>
                <span className="section-count">30 dias</span>
              </div>
              <ul className="fby">
                {stats.byTask.map((b) => (
                  <li key={b.k}>
                    <span className="truncate flex-1">{nameFor(b.k)}</span>
                    <span className="fby-bar">
                      <i style={{ transform: `scaleX(${b.minutes / stats.byTask[0].minutes})` }} />
                    </span>
                    <span className="fby-min">{fmtMinutes(b.minutes)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="panel">
            <div className="panel-head">
              <h2>Sessões de hoje</h2>
            </div>
            {stats.todaySessions.length === 0 ? (
              <p className="panel-empty">Nenhuma sessão hoje. Comece um Pomodoro de {st.focus} minutos.</p>
            ) : (
              <ul className="fsess">
                {stats.todaySessions.map((x) => (
                  <li key={x.id}>
                    <span className="fsess-time">{new Date(x.startedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
                    <span className="truncate flex-1">{nameFor(x.taskId ? `t:${x.taskId}` : x.habitId ? `h:${x.habitId}` : 'none')}</span>
                    <span className="fsess-min">{x.minutes} min</span>
                    <button type="button" className="icon-btn ghost sm" onClick={() => f.removeSession(x.id)} aria-label="Remover sessão">
                      <Icon name="X" size={14} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>

      <AnimatePresence>
        {targetPop.state && (
          <Popover key="t" anchor={targetPop.state.anchor} desktop={desktop} onClose={targetPop.close} title="Focar em" width={300}>
            <MenuList
              items={[
                { key: 'none', label: 'Sem tarefa', icon: 'Crosshair', active: !task && !habit },
                ...(todayTasks.length ? [{ divider: true, key: 'd1' }] : []),
                ...todayTasks.map((t) => ({ key: `t:${t.id}`, label: t.title, icon: 'SquareCheckBig', hint: 'Hoje', active: s.taskId === t.id })),
                ...(otherTasks.length ? [{ divider: true, key: 'd2' }] : []),
                ...otherTasks.map((t) => ({ key: `t:${t.id}`, label: t.title, icon: 'Square', active: s.taskId === t.id })),
                ...(timedHabits.length ? [{ divider: true, key: 'd3' }] : []),
                ...timedHabits.map((h) => ({ key: `h:${h.id}`, label: h.name, dot: colorOf(h.color).value, hint: 'Hábito', active: s.habitId === h.id })),
              ]}
              onPick={(it) => {
                targetPop.close();
                if (it.key === 'none') f.setTarget(null);
                else if (it.key.startsWith('t:')) f.setTarget({ taskId: it.key.slice(2) });
                else f.setTarget({ habitId: it.key.slice(2) });
              }}
            />
          </Popover>
        )}
        {soundPop.state && (
          <Popover key="snd" anchor={soundPop.state.anchor} desktop={desktop} onClose={soundPop.close} title="Som ambiente" width={260} align="end">
            <MenuList
              items={AMBIENTS.map((a) => ({ key: a.id, label: a.label, icon: a.icon, active: ambient === a.id }))}
              onPick={(it) => store.setDevice({ ambient: it.key })}
            />
            <div className="fs-row px-3 pb-2">
              <Icon name="Volume1" size={16} />
              <input
                type="range"
                min="0.05"
                max="1"
                step="0.05"
                value={store.device.ambientVolume ?? 0.5}
                className="flex-1 accent-range"
                aria-label="Volume"
                onChange={(e) => {
                  const v = Number(e.target.value);
                  store.setDevice({ ambientVolume: v });
                  setAmbientVolume(v);
                }}
              />
            </div>
            <p className="field-hint px-3 pb-2">Toca só enquanto o foco está rodando.</p>
          </Popover>
        )}
        {setPop.state && (
          <Popover key="s" anchor={setPop.state.anchor} desktop={desktop} onClose={setPop.close} title="Ajustes do foco" width={300} align="end">
            <div className="fsettings">
              <NumberField label="Foco" value={st.focus} min={5} max={120} onChange={(v) => f.updateSettings({ focus: v })} />
              <NumberField label="Pausa curta" value={st.short} min={1} max={30} onChange={(v) => f.updateSettings({ short: v })} />
              <NumberField label="Pausa longa" value={st.long} min={5} max={60} onChange={(v) => f.updateSettings({ long: v })} />
              <NumberField label="Pausa longa a cada" value={st.longEvery} min={2} max={8} suffix="rodadas" onChange={(v) => f.updateSettings({ longEvery: v })} />
              <div className="fs-row">
                <span className="flex-1">Começar a pausa sozinho</span>
                <button type="button" className={`switch${st.autoBreak ? ' is-on' : ''}`} role="switch" aria-checked={st.autoBreak} onClick={() => f.updateSettings({ autoBreak: !st.autoBreak })}>
                  <span className="switch-knob" />
                  <span className="sr-only">Começar a pausa sozinho</span>
                </button>
              </div>
            </div>
          </Popover>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {full && (
          <FullFocus
            key="full"
            label={task || habit ? targetLabel : ''}
            phase={s.phase}
            ms={ms}
            progress={progress}
            running={running}
            onToggle={() => (running ? f.pause() : f.start())}
            onExit={() => setFull(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

export const focusKey = keyOf;
