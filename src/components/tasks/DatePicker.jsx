import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Icon, EASE_OUT } from '../ui.jsx';
import { keyOf, fromKey, addDays } from '../../lib/habits.js';
import { monthGrid, monthTitle } from '../../lib/calendar.js';
import { REPEAT_OPTIONS, reminderOptions, repeatText } from '../../lib/tasks.js';

const WD = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
const DURATIONS = [0, 15, 30, 45, 60, 90, 120];

/**
 * Conteúdo do seletor de data. As mudanças valem na hora (onChange); o botão Pronto só fecha.
 * value: { date, time, duration, repeat, reminder }
 */
export function DatePickerBody({ value, onChange, todayKey, onDone, allowDuration = true }) {
  const base = value.date ? fromKey(value.date) : fromKey(todayKey);
  const [month, setMonth] = useState({ y: base.getFullYear(), m: base.getMonth(), dir: 0 });
  const days = monthGrid(month.y, month.m);
  const shift = (n) => {
    const d = new Date(month.y, month.m + n, 1);
    setMonth({ y: d.getFullYear(), m: d.getMonth(), dir: n });
  };
  const t = fromKey(todayKey);
  const nextMonday = (() => {
    for (let i = 1; i <= 7; i++) if (addDays(t, i).getDay() === 1) return keyOf(addDays(t, i));
    return todayKey;
  })();
  const quick = [
    { id: 'today', label: 'Hoje', icon: 'Sun', date: todayKey },
    { id: 'tomorrow', label: 'Amanhã', icon: 'Sunrise', date: keyOf(addDays(t, 1)) },
    { id: 'monday', label: 'Segunda', icon: 'CalendarArrowUp', date: nextMonday },
    { id: 'none', label: 'Sem data', icon: 'CalendarOff', date: '' },
  ];
  const setDate = (date) => onChange(date ? { date } : { date: '', time: '', repeat: '', reminder: -1, duration: 0 });
  const hasTime = !!value.time;
  const reminders = reminderOptions(hasTime);
  // Lembrete fora das opções do modo atual (com/sem hora) volta para o mais próximo
  const reminderValue = reminders.some((o) => o.value === value.reminder) ? value.reminder : -1;
  // Repetição semanal por dias aparece como opção própria quando veio da entrada rápida
  const repeatOptions = REPEAT_OPTIONS.some((o) => o.value === (value.repeat || ''))
    ? REPEAT_OPTIONS
    : [...REPEAT_OPTIONS, { value: value.repeat, label: repeatText(value.repeat) }];

  return (
    <div className="dp">
      <div className="dp-quick">
        {quick.map((q) => (
          <button key={q.id} type="button" className={`dp-q${value.date === q.date ? ' is-on' : ''}`} onClick={() => setDate(q.date)}>
            <Icon name={q.icon} size={18} />
            <span>{q.label}</span>
          </button>
        ))}
      </div>

      <div className="dp-month">
        <div className="dp-head">
          <span className="dp-title">{monthTitle(new Date(month.y, month.m, 1))}</span>
          <div className="flex gap-1">
            <button type="button" className="icon-btn sm" onClick={() => shift(-1)} aria-label="Mês anterior">
              <Icon name="ChevronLeft" size={16} />
            </button>
            <button type="button" className="icon-btn sm" onClick={() => shift(1)} aria-label="Próximo mês">
              <Icon name="ChevronRight" size={16} />
            </button>
          </div>
        </div>
        <div className="dp-grid dp-wd" aria-hidden="true">
          {WD.map((w, i) => (
            <span key={i}>{w}</span>
          ))}
        </div>
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.div
            key={`${month.y}-${month.m}`}
            className="dp-grid"
            initial={{ opacity: 0, x: month.dir * 12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: month.dir * -12, transition: { duration: 0.1 } }}
            transition={{ duration: 0.16, ease: EASE_OUT }}
          >
            {days.map((d) => (
              <button
                key={d.key}
                type="button"
                className={`dp-day${d.inMonth ? '' : ' is-out'}${d.key === value.date ? ' is-on' : ''}${d.key === todayKey ? ' is-today' : ''}`}
                onClick={() => setDate(d.key)}
                aria-label={d.key}
                aria-pressed={d.key === value.date}
              >
                {d.date.getDate()}
              </button>
            ))}
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="dp-rows">
        <div className="dp-row">
          <Icon name="Clock" size={17} />
          <span className="dp-label">Hora</span>
          {hasTime ? (
            <>
              <input
                type="time"
                className="dp-input"
                value={value.time}
                onChange={(e) => onChange({ time: e.target.value, date: value.date || todayKey })}
                aria-label="Hora"
              />
              <button type="button" className="icon-btn sm" onClick={() => onChange({ time: '', duration: 0, reminder: value.reminder >= 0 ? 0 : -1 })} aria-label="Remover hora">
                <Icon name="X" size={14} />
              </button>
            </>
          ) : (
            <button type="button" className="dp-link" onClick={() => onChange({ time: '09:00', date: value.date || todayKey, reminder: value.reminder >= 0 ? 0 : value.reminder })}>
              Adicionar
            </button>
          )}
        </div>
        {hasTime && allowDuration && (
          <div className="dp-row">
            <Icon name="Hourglass" size={17} />
            <span className="dp-label">Duração</span>
            <select className="dp-select" value={value.duration || 0} onChange={(e) => onChange({ duration: Number(e.target.value) })} aria-label="Duração">
              {DURATIONS.map((m) => (
                <option key={m} value={m}>
                  {m === 0 ? 'Sem duração' : m < 60 ? `${m} min` : `${m / 60} h`.replace('.5', ',5')}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="dp-row">
          <Icon name="Bell" size={17} />
          <span className="dp-label">Lembrete</span>
          <select className="dp-select" value={reminderValue} onChange={(e) => onChange({ reminder: Number(e.target.value), date: value.date || todayKey })} aria-label="Lembrete">
            {reminders.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div className="dp-row">
          <Icon name="Repeat" size={17} />
          <span className="dp-label">Repetir</span>
          <select className="dp-select" value={value.repeat || ''} onChange={(e) => onChange({ repeat: e.target.value, date: value.date || todayKey })} aria-label="Repetir">
            {repeatOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {onDone && (
        <div className="dp-foot">
          <button type="button" className="btn-text sm" onClick={() => setDate('')}>
            Limpar
          </button>
          <button type="button" className="btn-primary sm" onClick={onDone}>
            Pronto
          </button>
        </div>
      )}
    </div>
  );
}
