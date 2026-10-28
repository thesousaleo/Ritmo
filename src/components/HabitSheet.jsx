import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Icon, Segmented, Sheet, swapProps } from './ui.jsx';
import { ALL_DAYS, COLORS, ICON_CHOICES, PERIODS, PERIOD_SHORT, WEEKDAY_LETTER, WEEKDAY_SHORT, colorOf } from '../lib/habits.js';

export function HabitSheet({ mode, initial, desktop, onClose, onSave, onDelete }) {
  const [form, setForm] = useState(initial);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const c = colorOf(form.color);
  const daily = form.days.length === 7;
  const valid = form.name.trim().length > 0 && form.days.length > 0;
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  const toggleDay = (d) => {
    const days = form.days.includes(d) ? form.days.filter((x) => x !== d) : [...form.days, d].sort((a, b) => a - b);
    set({ days });
  };

  const submit = (e) => {
    e.preventDefault();
    if (!valid) return;
    onSave({ ...form, name: form.name.trim(), unit: form.unit.trim() });
  };

  const footer = (
    <AnimatePresence mode="wait" initial={false}>
      {!confirmDelete ? (
        <motion.div key="actions" className={desktop ? 'foot-row' : 'flex flex-col gap-2'} {...swapProps}>
          {mode === 'edit' && (
            <button type="button" className="btn-text-danger" onClick={() => setConfirmDelete(true)}>
              <Icon name="Trash2" size={16} /> Excluir hábito
            </button>
          )}
          <button type="submit" className="btn-primary" disabled={!valid}>
            {mode === 'create' ? 'Criar hábito' : 'Salvar alterações'}
          </button>
        </motion.div>
      ) : (
        <motion.div key="confirm" className="flex flex-col gap-3" {...swapProps}>
          <p className="confirm-text">Excluir “{initial.name}” e todo o histórico dele, em todos os aparelhos? Não dá para desfazer.</p>
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
        <span className="tile tile-lg">
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
          placeholder="Ex.: Alongar"
          maxLength={40}
          autoComplete="off"
          autoCapitalize="sentences"
          enterKeyHint="done"
          autoFocus={desktop}
        />
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
        <Segmented
          id="period"
          label="Período"
          value={form.period}
          onChange={(period) => set({ period })}
          options={PERIODS.map((p) => ({ id: p.id, label: PERIOD_SHORT[p.id] }))}
        />
      </div>

      <div className="field">
        <span className="field-label">Frequência</span>
        <Segmented
          id="freq"
          label="Frequência"
          value={daily ? 'daily' : 'custom'}
          onChange={(v) => set({ days: v === 'daily' ? ALL_DAYS : [1, 3, 5] })}
          options={[
            { id: 'daily', label: 'Todos os dias' },
            { id: 'custom', label: 'Dias específicos' },
          ]}
        />
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
        {form.days.length === 0 && <p className="field-error">Escolha ao menos um dia.</p>}
      </div>

      <div className="field">
        <span className="field-label">Meta diária</span>
        <div className="goal">
          <div className="stepper" role="group" aria-label="Vezes por dia">
            <button type="button" className="icon-btn" onClick={() => set({ target: Math.max(1, form.target - 1) })} aria-label="Diminuir" disabled={form.target <= 1}>
              <Icon name="Minus" size={16} />
            </button>
            <span className="stepper-val" aria-live="polite">
              {form.target}×
            </span>
            <button type="button" className="icon-btn" onClick={() => set({ target: Math.min(20, form.target + 1) })} aria-label="Aumentar" disabled={form.target >= 20}>
              <Icon name="Plus" size={16} />
            </button>
          </div>
          <label className="sr-only" htmlFor="habit-unit">
            Descrição da meta
          </label>
          <input
            id="habit-unit"
            className="text-input"
            value={form.unit}
            onChange={(e) => set({ unit: e.target.value })}
            placeholder={form.target > 1 ? 'copos, séries…' : '10 minutos'}
            maxLength={24}
            autoComplete="off"
            enterKeyHint="done"
          />
        </div>
      </div>
    </Sheet>
  );
}
