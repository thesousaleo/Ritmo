import React, { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Icon, Sheet, swapProps } from '../ui.jsx';
import { COLORS, colorOf } from '../../lib/habits.js';
import { REPEAT_OPTIONS, reminderOptions, repeatText, minutesOf, hhmm } from '../../lib/tasks.js';

/** Criar ou editar um evento da agenda. */
export function EventSheet({ desktop, initial, onClose, onSave, onDelete }) {
  const [form, setForm] = useState({ title: '', notes: '', location: '', allDay: false, start: '09:00', end: '10:00', color: 'cobalt', repeat: '', reminder: -1, ...initial, endDate: initial.endDate || initial.date });
  const [confirm, setConfirm] = useState(false);
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const c = colorOf(form.color);
  const endBeforeStart = !form.allDay && form.endDate === form.date && form.end && form.start && form.end <= form.start;
  const valid = form.title.trim() && form.date && form.endDate >= form.date && !endBeforeStart;
  const repeatOptions = REPEAT_OPTIONS.some((o) => o.value === (form.repeat || '')) ? REPEAT_OPTIONS : [...REPEAT_OPTIONS, { value: form.repeat, label: repeatText(form.repeat) }];

  const setStart = (start) => {
    // Mantém a duração ao mudar o início
    const dur = form.start && form.end ? minutesOf(form.end) - minutesOf(form.start) : 60;
    const endM = minutesOf(start) + Math.max(15, dur);
    set({ start, end: endM >= 1440 ? '23:59' : hhmm(endM) });
  };

  return (
    <Sheet
      desktop={desktop}
      as="form"
      title={initial.id ? 'Editar evento' : 'Novo evento'}
      onClose={onClose}
      style={{ '--c': c.value, '--on': c.on }}
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) onSave({ ...form, title: form.title.trim() });
      }}
      footer={
        <AnimatePresence mode="wait" initial={false}>
          {!confirm ? (
            <motion.div key="a" className={desktop ? 'foot-row' : 'flex flex-col gap-2'} {...swapProps}>
              {initial.id && (
                <button type="button" className="btn-text-danger" onClick={() => setConfirm(true)}>
                  <Icon name="Trash2" size={16} /> Excluir
                </button>
              )}
              <button type="submit" className="btn-primary" disabled={!valid}>
                {initial.id ? 'Salvar' : 'Criar evento'}
              </button>
            </motion.div>
          ) : (
            <motion.div key="c" className="flex flex-col gap-3" {...swapProps}>
              <p className="confirm-text">{form.repeat ? 'Excluir este evento e todas as repetições?' : `Excluir “${initial.title}”?`} Você pode desfazer logo depois.</p>
              <div className="grid grid-cols-2 gap-2">
                <button type="button" className="btn-secondary justify-center" onClick={() => setConfirm(false)}>
                  Cancelar
                </button>
                <button type="button" className="btn-danger justify-center" onClick={() => onDelete(initial.id)}>
                  Excluir
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      }
    >
      <label className="sr-only" htmlFor="ev-title">
        Título
      </label>
      <input id="ev-title" className="text-input lg" value={form.title} onChange={(e) => set({ title: e.target.value })} placeholder="Título do evento" maxLength={200} autoFocus={desktop} autoComplete="off" />

      <div className="field">
        <div className="reminder-row">
          <button type="button" className={`switch${form.allDay ? ' is-on' : ''}`} role="switch" aria-checked={form.allDay} onClick={() => set({ allDay: !form.allDay })}>
            <span className="switch-knob" />
            <span className="sr-only">Dia inteiro</span>
          </button>
          <span className="field-hint flex-1">Dia inteiro</span>
        </div>
        <div className="ev-when">
          <label className="date-field" htmlFor="ev-sd">
            <span>Início</span>
            <div className="flex gap-2">
              <input id="ev-sd" type="date" className="text-input" value={form.date} onChange={(e) => set({ date: e.target.value, endDate: form.endDate < e.target.value ? e.target.value : form.endDate })} required />
              {!form.allDay && <input type="time" className="text-input time-input" value={form.start} onChange={(e) => setStart(e.target.value)} aria-label="Hora de início" required />}
            </div>
          </label>
          <label className="date-field" htmlFor="ev-ed">
            <span>Fim</span>
            <div className="flex gap-2">
              <input id="ev-ed" type="date" className="text-input" value={form.endDate} min={form.date} onChange={(e) => set({ endDate: e.target.value })} required />
              {!form.allDay && <input type="time" className="text-input time-input" value={form.end} onChange={(e) => set({ end: e.target.value })} aria-label="Hora de fim" required />}
            </div>
          </label>
        </div>
        {endBeforeStart && <p className="field-error">O fim precisa ser depois do início.</p>}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <label className="date-field" htmlFor="ev-rep">
          <span>Repetir</span>
          <select id="ev-rep" className="text-input" value={form.repeat || ''} onChange={(e) => set({ repeat: e.target.value })}>
            {repeatOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label className="date-field" htmlFor="ev-rem">
          <span>Lembrete</span>
          <select id="ev-rem" className="text-input" value={form.reminder} onChange={(e) => set({ reminder: Number(e.target.value) })}>
            {reminderOptions(!form.allDay).map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <fieldset className="field">
        <legend className="field-label">Cor</legend>
        <div className="swatches">
          {COLORS.map((col) => (
            <button key={col.id} type="button" className={`swatch${form.color === col.id ? ' is-on' : ''}`} style={{ '--sw': col.value }} onClick={() => set({ color: col.id })} aria-pressed={form.color === col.id} aria-label={col.name} />
          ))}
        </div>
      </fieldset>

      <label className="field" htmlFor="ev-loc">
        <span className="field-label">Local</span>
        <input id="ev-loc" className="text-input" value={form.location} onChange={(e) => set({ location: e.target.value })} placeholder="Opcional" maxLength={200} autoComplete="off" />
      </label>
      <label className="field" htmlFor="ev-notes">
        <span className="field-label">Notas</span>
        <textarea id="ev-notes" className="text-input note-input" value={form.notes} onChange={(e) => set({ notes: e.target.value })} rows={3} maxLength={5000} />
      </label>
    </Sheet>
  );
}

/** Criação rápida a partir de um dia ou horário da agenda: tarefa ou evento. */
export function CreateSheet({ desktop, slot, onClose, onCreateTask, onCreateEvent, onMore }) {
  const [kind, setKind] = useState(slot.kind || (slot.time ? 'event' : 'task'));
  const [title, setTitle] = useState('');
  const [time, setTime] = useState(slot.time || '');
  const label = new Date(`${slot.date}T12:00`).toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
  const submit = () => {
    const t = title.trim();
    if (!t) return;
    if (kind === 'task') onCreateTask({ title: t, date: slot.date, time, duration: time ? 30 : 0 });
    else {
      const s = time || '09:00';
      onCreateEvent({ title: t, date: slot.date, endDate: slot.date, start: s, end: hhmm(Math.min(1439, minutesOf(s) + 60)), allDay: !time });
    }
  };
  return (
    <Sheet
      desktop={desktop}
      as="form"
      title="Adicionar"
      onClose={onClose}
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      footer={
        <div className="foot-row">
          {kind === 'event' && (
            <button type="button" className="btn-text" onClick={() => onMore({ title: title.trim(), date: slot.date, endDate: slot.date, start: time || '09:00', end: hhmm(Math.min(1439, minutesOf(time || '09:00') + 60)), allDay: !time })}>
              Mais opções
            </button>
          )}
          <button type="submit" className="btn-primary" disabled={!title.trim()}>
            {kind === 'task' ? 'Criar tarefa' : 'Criar evento'}
          </button>
        </div>
      }
    >
      <div className="seg" role="radiogroup" aria-label="Tipo" style={{ gridTemplateColumns: '1fr 1fr' }}>
        {[
          ['task', 'Tarefa'],
          ['event', 'Evento'],
        ].map(([id, l]) => (
          <button key={id} type="button" role="radio" aria-checked={kind === id} className={kind === id ? 'is-on' : ''} onClick={() => setKind(id)}>
            {kind === id && <motion.span layoutId="seg-create" className="seg-pill" transition={{ type: 'spring', stiffness: 520, damping: 40 }} />}
            <span className="relative">{l}</span>
          </button>
        ))}
      </div>
      <label className="sr-only" htmlFor="cr-title">
        Título
      </label>
      <input id="cr-title" className="text-input lg" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={kind === 'task' ? 'O que precisa ser feito?' : 'Nome do evento'} autoFocus autoComplete="off" enterKeyHint="done" />
      <div className="reminder-row">
        <Icon name="Calendar" size={17} />
        <span className="flex-1 first-up">{label}</span>
        <input type="time" className="text-input time-input" value={time} onChange={(e) => setTime(e.target.value)} aria-label="Hora" />
      </div>
    </Sheet>
  );
}
