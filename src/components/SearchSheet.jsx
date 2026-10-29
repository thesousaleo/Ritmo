import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Icon, Portal, useEscape } from './ui.jsx';
import { colorOf } from '../lib/habits.js';
import { searchAll, dueLabel, dayLabel, listById, priorityOf } from '../lib/tasks.js';

/**
 * Busca em tarefas, eventos e hábitos. Abre por atalho de teclado (/) com frequência,
 * então aparece sem animação.
 */
export function SearchSheet({ data, todayKey, onClose, onOpenTask, onOpenEvent, onOpenHabit }) {
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef(null);
  useEscape(onClose);
  useEffect(() => {
    const id = setTimeout(() => inputRef.current && inputRef.current.focus(), 0);
    return () => clearTimeout(id);
  }, []);
  const res = useMemo(() => searchAll(data, q), [data, q]);
  const flat = [
    ...res.tasks.map((t) => ({ kind: 'task', id: t.id, item: t })),
    ...res.events.map((e) => ({ kind: 'event', id: e.id, item: e })),
    ...res.habits.map((h) => ({ kind: 'habit', id: h.id, item: h })),
  ];
  const open = (r) => {
    onClose();
    if (r.kind === 'task') onOpenTask(r.id);
    if (r.kind === 'event') onOpenEvent({ ev: r.item, date: r.item.date, endDate: r.item.endDate, id: `${r.item.id}@${r.item.date}` });
    if (r.kind === 'habit') onOpenHabit(r.item);
  };

  return (
    <Portal>
      <div className="backdrop is-instant" onClick={onClose} />
      <div className="search" role="dialog" aria-modal="true" aria-label="Buscar">
        <div className="search-bar">
          <Icon name="Search" size={18} />
          <input
            ref={inputRef}
            className="search-input"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setActive(0);
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setActive((a) => Math.min(flat.length - 1, a + 1));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setActive((a) => Math.max(0, a - 1));
              } else if (e.key === 'Enter' && flat[active]) open(flat[active]);
            }}
            placeholder="Buscar tarefas, eventos e hábitos"
            autoComplete="off"
            enterKeyHint="search"
            aria-label="Buscar"
          />
          <button type="button" className="icon-btn ghost sm" onClick={onClose} aria-label="Fechar">
            <Icon name="X" size={16} />
          </button>
        </div>
        <div className="search-results">
          {!q.trim() && <p className="search-hint">Procure por título, descrição, subtarefa ou #etiqueta.</p>}
          {q.trim() && flat.length === 0 && <p className="search-hint">Nada encontrado para “{q.trim()}”.</p>}
          {flat.map((r, i) => {
            if (r.kind === 'task') {
              const t = r.item;
              const l = listById(data, t.listId);
              return (
                <button key={`t${t.id}`} type="button" className={`sr${i === active ? ' is-on' : ''}${t.done ? ' is-done' : ''}`} onClick={() => open(r)} onMouseEnter={() => setActive(i)}>
                  <span className="sr-check" style={{ borderColor: priorityOf(t.priority).color }}>
                    {t.done && <Icon name="Check" size={11} strokeWidth={3} />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="sr-title">{t.title}</span>
                    <span className="sr-sub">
                      {l && <i style={{ background: colorOf(l.color).value }} />}
                      {l ? l.name : ''}
                      {t.date ? `${l ? ', ' : ''}${dueLabel(t, todayKey)}` : ''}
                    </span>
                  </span>
                </button>
              );
            }
            if (r.kind === 'event') {
              const e = r.item;
              return (
                <button key={`e${e.id}`} type="button" className={`sr${i === active ? ' is-on' : ''}`} onClick={() => open(r)} onMouseEnter={() => setActive(i)}>
                  <span className="sr-bar" style={{ background: colorOf(e.color).value }} />
                  <span className="min-w-0 flex-1">
                    <span className="sr-title">{e.title}</span>
                    <span className="sr-sub">
                      Evento, {dayLabel(e.date, todayKey)}
                      {e.allDay ? '' : `, ${e.start}`}
                    </span>
                  </span>
                </button>
              );
            }
            const h = r.item;
            return (
              <button key={`h${h.id}`} type="button" className={`sr${i === active ? ' is-on' : ''}`} onClick={() => open(r)} onMouseEnter={() => setActive(i)}>
                <span className="sr-habit" style={{ color: colorOf(h.color).value }}>
                  <Icon name={h.icon} size={15} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="sr-title">{h.name}</span>
                  <span className="sr-sub">Hábito</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </Portal>
  );
}
