import React, { useState } from 'react';
import { Icon, Sheet, Segmented } from '../ui.jsx';
import { COLORS, colorOf } from '../../lib/habits.js';
import { LIST_ICONS } from '../../lib/tasks.js';

export function ListSheet({ desktop, initial, onClose, onSave }) {
  const [form, setForm] = useState(initial || { name: '', color: 'cobalt', icon: 'List', view: 'list' });
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const c = colorOf(form.color);
  const valid = form.name.trim().length > 0;
  return (
    <Sheet
      desktop={desktop}
      as="form"
      title={initial ? 'Editar lista' : 'Nova lista'}
      onClose={onClose}
      style={{ '--c': c.value, '--on': c.on }}
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) onSave({ ...form, name: form.name.trim() });
      }}
      footer={
        <button type="submit" className="btn-primary" disabled={!valid}>
          {initial ? 'Salvar' : 'Criar lista'}
        </button>
      }
    >
      <div className="name-row">
        <span className="tile tile-lg">
          <Icon name={form.icon} size={22} />
        </span>
        <label className="sr-only" htmlFor="list-name">
          Nome da lista
        </label>
        <input id="list-name" className="text-input" value={form.name} onChange={(e) => set({ name: e.target.value })} placeholder="Ex.: Faculdade" maxLength={60} autoFocus={desktop} autoComplete="off" enterKeyHint="done" />
      </div>
      <fieldset className="field">
        <legend className="field-label">Cor</legend>
        <div className="swatches">
          {COLORS.map((col) => (
            <button key={col.id} type="button" className={`swatch${form.color === col.id ? ' is-on' : ''}`} style={{ '--sw': col.value }} onClick={() => set({ color: col.id })} aria-pressed={form.color === col.id} aria-label={col.name} />
          ))}
        </div>
      </fieldset>
      <fieldset className="field">
        <legend className="field-label">Ícone</legend>
        <div className="icon-grid">
          {LIST_ICONS.map((name) => (
            <button key={name} type="button" className={`icon-choice${form.icon === name ? ' is-on' : ''}`} onClick={() => set({ icon: name })} aria-pressed={form.icon === name} aria-label={name}>
              <Icon name={name} size={20} />
            </button>
          ))}
        </div>
      </fieldset>
      <div className="field">
        <span className="field-label">Exibir como</span>
        <Segmented
          id="list-view"
          label="Exibir como"
          value={form.view || 'list'}
          onChange={(view) => set({ view })}
          options={[
            { id: 'list', label: 'Lista' },
            { id: 'kanban', label: 'Kanban' },
          ]}
        />
      </div>
    </Sheet>
  );
}
