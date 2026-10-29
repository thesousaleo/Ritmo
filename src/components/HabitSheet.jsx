import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Icon, Segmented, Sheet, swapProps } from './ui.jsx';
import { ALL_DAYS, COLORS, ICON_CHOICES, PERIODS, PERIOD_SHORT, WEEKDAY_LETTER, WEEKDAY_SHORT, colorOf } from '../lib/habits.js';
import { remindersSupported } from '../lib/native.js';

function Stepper({ label, value, min, max, step = 1, format = (v) => v, onChange }) {
  return (
    <div className="stepper" role="group" aria-label={label}>
      <button type="button" className="icon-btn" onClick={() => onChange(Math.max(min, value - step))} aria-label={`Diminuir ${label.toLowerCase()}`} disabled={value <= min}>
        <Icon name="Minus" size={16} />
      </button>
      <span className="stepper-val" aria-live="polite">
        {format(value)}
      </span>
      <button type="button" className="icon-btn" onClick={() => onChange(Math.min(max, value + step))} aria-label={`Aumentar ${label.toLowerCase()}`} disabled={value >= max}>
        <Icon name="Plus" size={16} />
      </button>
    </div>
  );
}

export function HabitSheet({ mode, initial, desktop, onClose, onSave, onDelete, onArchive }) {
  const [form, setForm] = useState(initial);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const c = colorOf(form.color);
  const freqMode = form.freq === 'weekly' ? 'weekly' : form.days.length === 7 ? 'daily' : 'custom';
  const avoid = form.kind === 'avoid';
  const timed = form.duration > 0;
  const valid = form.name.trim().length > 0 && (form.freq === 'weekly' || form.days.length > 0);
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  const toggleDay = (d) => {
    const days = form.days.includes(d) ? form.days.filter((x) => x !== d) : [...form.days, d].sort((a, b) => a - b);
    set({ days, freq: 'days' });
  };

  const submit = (e) => {
    e.preventDefault();
    if (!valid) return;
    const out = { ...form, name: form.name.trim(), unit: form.unit.trim(), minimum: (form.minimum || '').trim() };
    if (out.kind === 'avoid' || out.duration > 0) out.target = 1;
    if (out.kind === 'avoid') out.duration = 0;
    if (out.freq === 'weekly') out.days = ALL_DAYS;
    onSave(out);
  };

  const footer = (
    <AnimatePresence mode="wait" initial={false}>
      {!confirmDelete ? (
        <motion.div key="actions" className={desktop ? 'foot-row' : 'flex flex-col gap-2'} {...swapProps}>
          {mode === 'edit' && (
            <div className={desktop ? 'flex gap-1' : 'grid grid-cols-2 gap-2'}>
              <button type="button" className="btn-text" onClick={() => onArchive(initial)}>
                <Icon name="Archive" size={16} /> Arquivar
              </button>
              <button type="button" className="btn-text-danger" onClick={() => setConfirmDelete(true)}>
                <Icon name="Trash2" size={16} /> Excluir
              </button>
            </div>
          )}
          <button type="submit" className="btn-primary" disabled={!valid}>
            {mode === 'create' ? 'Criar hábito' : 'Salvar alterações'}
          </button>
        </motion.div>
      ) : (
        <motion.div key="confirm" className="flex flex-col gap-3" {...swapProps}>
          <p className="confirm-text">Excluir “{initial.name}”? Ele some de todos os aparelhos. Você ainda pode desfazer logo depois; se quiser só tirar da lista, use Arquivar.</p>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" className="btn-secondary justify-center" onClick={() => setConfirmDelete(false)}>
              Cancelar
            </button>
            <button type="button" className="btn-danger justify-center" onClick={() => onDelete(initial.id)}>
              Excluir
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  return (
    <Sheet
      desktop={desktop}
      as="form"
      onSubmit={submit}
      title={mode === 'create' ? 'Novo hábito' : 'Editar hábito'}
      onClose={onClose}
      footer={footer}
      style={{ '--c': c.value, '--on': c.on }}
    >
      <div className="name-row">
        <span className={`tile tile-lg${avoid ? ' is-avoid' : ''}`}>
          <Icon name={form.icon} size={24} />
        </span>
        <label className="sr-only" htmlFor="habit-name">
          Nome do hábito
        </label>
        <input
          id="habit-name"
          className="text-input"
          value={form.name}
          onChange={(e) => set({ name: e.target.value })}
          placeholder={avoid ? 'Ex.: Sem refrigerante' : 'Ex.: Alongar'}
          maxLength={40}
          autoComplete="off"
          autoCapitalize="sentences"
          enterKeyHint="done"
          autoFocus={desktop}
        />
      </div>

      <div className="field">
        <span className="field-label">Tipo</span>
        <Segmented
          id="kind"
          label="Tipo de hábito"
          value={form.kind}
          onChange={(kind) => set({ kind, ...(kind === 'avoid' ? { duration: 0, target: 1 } : {}) })}
          options={[
            { id: 'build', label: 'Construir' },
            { id: 'avoid', label: 'Evitar' },
          ]}
        />
        <p className="field-hint">
          {avoid ? 'Marque o dia em que conseguiu evitar. A sequência conta os dias seguidos sem o hábito.' : 'Algo que você quer fazer com regularidade.'}
        </p>
      </div>

      <fieldset className="field">
        <legend className="field-label">Ícone</legend>
        <div className="icon-grid">
          {ICON_CHOICES.map((name) => (
            <button
              key={name}
              type="button"
              className={`icon-choice${form.icon === name ? ' is-on' : ''}`}
              onClick={() => set({ icon: name })}
              aria-pressed={form.icon === name}
              aria-label={name}
            >
              <Icon name={name} size={20} />
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className="field">
        <legend className="field-label">Cor</legend>
        <div className="swatches">
          {COLORS.map((col) => (
            <button
              key={col.id}
              type="button"
              className={`swatch${form.color === col.id ? ' is-on' : ''}`}
              style={{ '--sw': col.value }}
              onClick={() => set({ color: col.id })}
              aria-pressed={form.color === col.id}
              aria-label={col.name}
            />
          ))}
        </div>
      </fieldset>

      <div className="field">
        <span className="field-label">Período</span>
        <Segmented id="period" label="Período" value={form.period} onChange={(period) => set({ period })} options={PERIODS.map((p) => ({ id: p.id, label: PERIOD_SHORT[p.id] }))} />
      </div>

      <div className="field">
        <span className="field-label">Frequência</span>
        <Segmented
          id="freq"
          label="Frequência"
          value={freqMode}
          onChange={(v) =>
            set(v === 'daily' ? { freq: 'days', days: ALL_DAYS } : v === 'custom' ? { freq: 'days', days: [1, 3, 5] } : { freq: 'weekly', days: ALL_DAYS })
          }
          options={[
            { id: 'daily', label: 'Todo dia' },
            { id: 'custom', label: 'Dias fixos' },
            { id: 'weekly', label: 'Por semana' },
          ]}
        />
        {freqMode === 'weekly' ? (
          <div className="goal">
            <Stepper label="Vezes por semana" value={form.perWeek} min={1} max={6} format={(v) => `${v}×`} onChange={(perWeek) => set({ perWeek })} />
            <p className="field-hint flex-1">Em qualquer dia. A sequência conta semanas em que você bateu a meta.</p>
          </div>
        ) : (
          <div className="weekdays" role="group" aria-label="Dias da semana">
            {WEEKDAY_LETTER.map((l, i) => (
              <button
                key={i}
                type="button"
                className={`wd${form.days.includes(i) ? ' is-on' : ''}`}
                onClick={() => toggleDay(i)}
                aria-pressed={form.days.includes(i)}
                aria-label={WEEKDAY_SHORT[i]}
              >
                {l}
              </button>
            ))}
          </div>
        )}
        {freqMode !== 'weekly' && form.days.length === 0 && <p className="field-error">Escolha ao menos um dia.</p>}
      </div>

      {!avoid && (
        <div className="field">
          <span className="field-label">Meta do dia</span>
          <div className="goal">
            <Stepper label="Temporizador" value={form.duration} min={0} max={120} step={5} format={(v) => (v ? `${v} min` : 'Sem timer')} onChange={(duration) => set({ duration, ...(duration ? { target: 1 } : {}) })} />
            {!timed && <Stepper label="Vezes por dia" value={form.target} min={1} max={20} format={(v) => `${v}×`} onChange={(target) => set({ target })} />}
          </div>
          <label className="sr-only" htmlFor="habit-unit">
            Descrição da meta
          </label>
          <input
            id="habit-unit"
            className="text-input"
            value={form.unit}
            onChange={(e) => set({ unit: e.target.value })}
            placeholder={form.target > 1 ? 'copos, séries…' : timed ? 'Ex.: respiração guiada' : 'Ex.: 20 páginas'}
            maxLength={24}
            autoComplete="off"
            enterKeyHint="done"
          />
          {timed && <p className="field-hint">Tocar no círculo abre o temporizador; ao terminar, o hábito é marcado sozinho.</p>}
        </div>
      )}

      {!avoid && (
        <label className="field" htmlFor="habit-min">
          <span className="field-label">Versão mínima (opcional)</span>
          <input
            id="habit-min"
            className="text-input"
            value={form.minimum || ''}
            onChange={(e) => set({ minimum: e.target.value })}
            placeholder="Ex.: 1 página, 5 minutos, só calçar o tênis"
            maxLength={40}
            autoComplete="off"
            enterKeyHint="done"
          />
          <span className="field-hint">Nos dias corridos, faça só isso: conta como feito e mantém a sequência.</span>
        </label>
      )}

      <div className="field">
        <span className="field-label">Lembrete</span>
        <div className="reminder-row">
          <button type="button" className={`switch${form.reminder ? ' is-on' : ''}`} role="switch" aria-checked={!!form.reminder} onClick={() => set({ reminder: form.reminder ? '' : '08:00' })}>
            <span className="switch-knob" />
            <span className="sr-only">Lembrete</span>
          </button>
          {form.reminder ? (
            <>
              <label className="sr-only" htmlFor="habit-reminder">
                Horário do lembrete
              </label>
              <input id="habit-reminder" type="time" className="text-input time-input" value={form.reminder} onChange={(e) => set({ reminder: e.target.value || '08:00' })} required />
            </>
          ) : (
            <span className="field-hint">Desligado</span>
          )}
        </div>
        {form.reminder && !remindersSupported && <p className="field-hint">Os lembretes tocam no app Android. O horário fica salvo e sincroniza.</p>}
      </div>
    </Sheet>
  );
}
