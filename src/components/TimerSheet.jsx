import React, { useEffect, useState } from 'react';
import { Icon, Sheet } from './ui.jsx';
import { colorOf } from '../lib/habits.js';

export const timerRemaining = (t, now = Date.now()) => (t.endAt ? Math.max(0, t.endAt - now) : t.remainingMs);

const fmt = (ms) => {
  const s = Math.ceil(ms / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};

export function TimerSheet({ desktop, habit, timer, onClose, onPause, onResume, onCancel, onFinishNow }) {
  const [now, setNow] = useState(Date.now());
  const running = !!timer.endAt;

  useEffect(() => {
    if (!running) return undefined;
    let raf;
    const loop = () => {
      setNow(Date.now());
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [running]);

  const c = colorOf(habit.color);
  const remaining = timerRemaining(timer, now);
  const frac = 1 - remaining / timer.durationMs;
  const R = 92;
  const C = 2 * Math.PI * R;

  return (
    <Sheet desktop={desktop} title={habit.name} onClose={onClose} labelId="timer-title" style={{ '--c': c.value, '--on': c.on }}>
      <div className="timer">
        <div className="timer-ring" role="timer" aria-label={`Faltam ${fmt(remaining)}`}>
          <svg viewBox="0 0 200 200" aria-hidden="true">
            <circle cx="100" cy="100" r={R} className="timer-track" />
            <circle cx="100" cy="100" r={R} className="timer-fill" strokeDasharray={C} strokeDashoffset={C * (1 - frac)} />
          </svg>
          <div className="timer-center">
            <span className="timer-time">{fmt(remaining)}</span>
            <span className="timer-sub">{running ? `de ${habit.duration} minutos` : 'Pausado'}</span>
          </div>
        </div>
        <p className="field-hint text-center">Pode fechar este painel ou o app: o tempo continua contando e o hábito é marcado no fim.</p>
        <div className="timer-actions">
          <button type="button" className="icon-btn lg" onClick={onCancel} aria-label="Cancelar temporizador">
            <Icon name="X" size={22} />
          </button>
          <button type="button" className="timer-main" onClick={running ? onPause : onResume}>
            <Icon name={running ? 'Pause' : 'Play'} size={26} strokeWidth={2.4} />
            <span className="sr-only">{running ? 'Pausar' : 'Retomar'}</span>
          </button>
          <button type="button" className="icon-btn lg" onClick={onFinishNow} aria-label="Concluir agora">
            <Icon name="Check" size={22} />
          </button>
        </div>
      </div>
    </Sheet>
  );
}
