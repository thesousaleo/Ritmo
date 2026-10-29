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
  const [onlySome, setOnlySome] = useState(false);
  const [picked, setPicked] = useState([]);
  const togglePick = (id) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

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
        <span className="field-label">Pausas, férias e modo viagem</span>
        <p className="field-hint">Durante uma pausa nada é cobrado: as sequências ficam congeladas e os lembretes param. No modo viagem, escolha só os hábitos que não dá para manter fora de casa.</p>
        {breaks.length > 0 && (
          <ul className="break-list">
            {breaks.map((b) => (
              <li key={b.id}>
                <Icon name={b.habitIds && b.habitIds.length ? 'Luggage' : 'Palmtree'} size={16} />
                <span className="flex-1 min-w-0">
                  {shortDate(b.start)} a {shortDate(b.end)}
                  {b.start <= todayKey ? ' (em andamento)' : ''}
                  {b.habitIds && b.habitIds.length > 0 && (
                    <span className="block field-hint truncate">
                      Só: {b.habitIds.map((id) => (byId.get(id) || { name: '?' }).name).join(', ')}
                    </span>
                  )}
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
        <div className="reminder-row">
          <button type="button" className={`switch${onlySome ? ' is-on' : ''}`} role="switch" aria-checked={onlySome} onClick={() => setOnlySome((v) => !v)}>
            <span className="switch-knob" />
            <span className="sr-only">Modo viagem</span>
          </button>
          <span className="field-hint flex-1">{onlySome ? 'Modo viagem: pausar só alguns hábitos' : 'Pausar todos os hábitos'}</span>
        </div>
        {onlySome && (
          <div className="set-chips p-0">
            {active.map((h) => (
              <button key={h.id} type="button" className={`chip-toggle${picked.includes(h.id) ? ' is-on' : ''}`} onClick={() => togglePick(h.id)}>
                <Icon name={h.icon} size={13} /> {h.name}
              </button>
            ))}
          </div>
        )}
        <button
          type="button"
          className="btn-secondary self-start"
          disabled={!validBreak || (onlySome && !picked.length)}
          onClick={() => {
            onAddBreak(start, end, onlySome ? picked : []);
            setPicked([]);
            setOnlySome(false);
          }}
        >
          <Icon name="Plus" size={16} /> {onlySome ? 'Ativar modo viagem' : 'Adicionar pausa'}
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
