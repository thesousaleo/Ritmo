import React, { useEffect, useRef, useState } from 'react';
import { Reorder, useDragControls } from 'framer-motion';
import { Icon, Sheet } from './ui.jsx';
import { colorOf, keyOf, addDays, shortDate, frequencyText, todayDate } from '../lib/habits.js';

function ReorderRow({ habit, onDragEnd }) {
  const controls = useDragControls();
  return (
    <Reorder.Item
      value={habit.id}
      dragListener={false}
      dragControls={controls}
      onDragEnd={onDragEnd}
      className="reorder-row"
      style={{ '--c': colorOf(habit.color).value }}
      whileDrag={{ scale: 1.02, boxShadow: 'var(--drag-shadow)' }}
      transition={{ type: 'spring', stiffness: 600, damping: 40 }}
    >
      <span className="tile sm">
        <Icon name={habit.icon} size={16} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-semibold">{habit.name}</span>
        <span className="block text-[13px] text-[color:var(--muted)] truncate">{frequencyText(habit)}</span>
      </span>
      <button type="button" className="drag-handle" onPointerDown={(e) => controls.start(e)} aria-label={`Arrastar ${habit.name}`}>
        <Icon name="GripVertical" size={18} />
      </button>
    </Reorder.Item>
  );
}

export function ManageSheet({ desktop, data, onClose, onOrder, onRestore, onAddBreak, onRemoveBreak }) {
  const active = data.habits.filter((h) => !h.archived);
  const archived = data.habits.filter((h) => h.archived);
  const [order, setOrder] = useState(active.map((h) => h.id));
  const orderRef = useRef(order);
  orderRef.current = order;
  const byId = new Map(data.habits.map((h) => [h.id, h]));

  // Hábitos criados ou restaurados enquanto o painel está aberto entram no fim da lista
  useEffect(() => {
    const ids = active.map((h) => h.id);
    setOrder((prev) => [...prev.filter((id) => ids.includes(id)), ...ids.filter((id) => !prev.includes(id))]);
  }, [data.habits]); // eslint-disable-line react-hooks/exhaustive-deps

  const todayKey = keyOf(todayDate());
  const [start, setStart] = useState(todayKey);
  const [end, setEnd] = useState(keyOf(addDays(todayDate(), 6)));
  const breaks = (data.breaks || []).filter((b) => b.end >= todayKey).sort((a, b) => a.start.localeCompare(b.start));
  const validBreak = start && end && end >= start;

  return (
    <Sheet desktop={desktop} title="Organizar" onClose={onClose} labelId="manage-title">
      <section className="field">
        <span className="field-label">Ordem dos hábitos</span>
        <p className="field-hint">Arraste pela alça para mudar a ordem dentro de cada período.</p>
        <Reorder.Group axis="y" values={order} onReorder={setOrder} className="reorder">
          {order.map((id) => byId.get(id) && <ReorderRow key={id} habit={byId.get(id)} onDragEnd={() => onOrder(orderRef.current)} />)}
        </Reorder.Group>
      </section>

      <section className="field">
        <span className="field-label">Pausas e férias</span>
        <p className="field-hint">Durante uma pausa nada é cobrado: as sequências ficam congeladas e os lembretes param.</p>
        {breaks.length > 0 && (
          <ul className="break-list">
            {breaks.map((b) => (
              <li key={b.id}>
                <Icon name="Palmtree" size={16} />
                <span className="flex-1">
                  {shortDate(b.start)} a {shortDate(b.end)}
                  {b.start <= todayKey ? ' (em andamento)' : ''}
                </span>
                <button type="button" className="btn-text sm" onClick={() => onRemoveBreak(b)}>
                  Remover
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="break-form">
          <label className="date-field" htmlFor="break-start">
            <span>De</span>
            <input id="break-start" type="date" className="text-input" value={start} min={todayKey} onChange={(e) => setStart(e.target.value)} />
          </label>
          <label className="date-field" htmlFor="break-end">
            <span>Até</span>
            <input id="break-end" type="date" className="text-input" value={end} min={start || todayKey} onChange={(e) => setEnd(e.target.value)} />
          </label>
        </div>
        <button type="button" className="btn-secondary self-start" disabled={!validBreak} onClick={() => onAddBreak(start, end)}>
          <Icon name="Plus" size={16} /> Adicionar pausa
        </button>
      </section>

      <section className="field">
        <span className="field-label">Arquivados</span>
        {archived.length === 0 ? (
          <p className="field-hint">Nenhum hábito arquivado. Arquivar tira o hábito da lista sem apagar o histórico.</p>
        ) : (
          <ul className="archived-list">
            {archived.map((h) => (
              <li key={h.id} style={{ '--c': colorOf(h.color).value }}>
                <span className="tile sm">
                  <Icon name={h.icon} size={16} />
                </span>
                <span className="flex-1 min-w-0 truncate">{h.name}</span>
                <button type="button" className="btn-secondary sm" onClick={() => onRestore(h)}>
                  Restaurar
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </Sheet>
  );
}
