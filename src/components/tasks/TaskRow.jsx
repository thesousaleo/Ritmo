import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Icon, TaskCheck, EASE_OUT } from '../ui.jsx';
import { colorOf } from '../../lib/habits.js';
import { dueLabel, isOverdue, minutesOf, listById, priorityOf, dayLabel, daysBetween, fmtMoney, ENERGY } from '../../lib/tasks.js';
import { dragProps } from '../../lib/dnd.js';

const nowMinutes = () => {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
};

/**
 * Linha de tarefa. Ao marcar, o check aparece na hora e a tarefa só muda de grupo
 * depois de um instante (dá para ver o que foi feito e desmarcar antes).
 */
export function TaskRow({ task, data, todayKey, onToggle, onOpen, selected, showList = false, hideDate = false, draggable = false, compact = false }) {
  const [pending, setPending] = useState(false);
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => {
    if (task.done) setPending(false);
  }, [task.done]);

  const checked = task.done || pending;
  const toggle = () => {
    if (task.done) {
      onToggle(task.id);
      return;
    }
    if (pending) {
      clearTimeout(timer.current);
      setPending(false);
      return;
    }
    setPending(true);
    timer.current = setTimeout(() => onToggle(task.id), 380);
  };

  const list = showList ? listById(data, task.listId) : null;
  const overdue = isOverdue(task, todayKey, nowMinutes());
  const items = task.checklist || [];
  const doneItems = items.filter((c) => c.done).length;
  const p = priorityOf(task.priority);
  const due = hideDate ? task.time || '' : dueLabel(task, todayKey);
  const deadlineSoon = task.deadline && !task.done && daysBetween(todayKey, task.deadline) <= 1;
  const assignee = task.assignee ? memberName(data, task) : '';
  const hasMeta =
    due || task.repeat || items.length || task.notes || (task.tags || []).length || list || task.reminder >= 0 || task.deadline || task.energy || task.amount !== null || (task.attachments || []).length || task.place;

  return (
    <div
      className={`trow${checked ? ' is-done' : ''}${selected ? ' is-selected' : ''}${compact ? ' is-compact' : ''}`}
      onClick={() => onOpen(task.id)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onOpen(task.id);
      }}
      aria-label={`${task.title}${due ? `, ${due}` : ''}${task.priority ? `, prioridade ${p.short.toLowerCase()}` : ''}`}
      {...dragProps({ type: 'task', id: task.id }, null, { disabled: !draggable })}
    >
      <TaskCheck checked={checked} priority={task.priority} onToggle={toggle} label={checked ? `Desmarcar ${task.title}` : `Concluir ${task.title}`} />
      <div className="trow-main">
        <span className="trow-title">
          <span className="trow-title-text">{task.title}</span>
          <motion.span className="strike" initial={false} animate={{ scaleX: checked ? 1 : 0 }} transition={{ duration: checked ? 0.22 : 0.12, ease: EASE_OUT }} />
        </span>
        {hasMeta && !compact && (
          <span className="trow-meta">
            {due && <span className={`tmeta${overdue ? ' is-late' : ''}`}>{due}</span>}
            {task.deadline && (
              <span className={`tmeta${deadlineSoon ? ' is-late' : ''}`} title="Prazo final">
                <Icon name="Flag" size={12} /> {dayLabel(task.deadline, todayKey)}
              </span>
            )}
            {task.amount !== null && task.amount !== undefined && <span className="tmeta is-money">{fmtMoney(task.amount)}</span>}
            {task.repeat && <Icon name="Repeat" size={12} className="tmeta-icon" aria-label="Repete" />}
            {task.energy > 0 && <Icon name={ENERGY[task.energy].icon} size={13} className="tmeta-icon" aria-label={`Energia ${ENERGY[task.energy].short.toLowerCase()}`} />}
            {task.place && <Icon name="MapPin" size={12} className="tmeta-icon" aria-label="Lembrete por lugar" />}
            {(task.attachments || []).length > 0 && <Icon name="Paperclip" size={12} className="tmeta-icon" aria-label="Tem anexos" />}
            {(task.postponed || 0) >= 3 && !task.done && (
              <span className="tmeta is-warn" title={`Adiada ${task.postponed} vezes`}>
                <Icon name="Redo2" size={12} /> {task.postponed}
              </span>
            )}
            {task.reminder >= 0 && !task.done && <Icon name="Bell" size={12} className="tmeta-icon" aria-label="Com lembrete" />}
            {items.length > 0 && (
              <span className="tmeta">
                <Icon name="ListChecks" size={12} /> {doneItems}/{items.length}
              </span>
            )}
            {task.notes && <Icon name="AlignLeft" size={12} className="tmeta-icon" aria-label="Tem descrição" />}
            {(task.tags || []).slice(0, 3).map((t) => (
              <span key={t} className="tag-chip">
                #{t}
              </span>
            ))}
            {list && (
              <span className="tmeta list-chip">
                <i style={{ background: colorOf(list.color).value }} />
                {list.name}
              </span>
            )}
          </span>
        )}
      </div>
      {compact && due && <span className={`tmeta${overdue ? ' is-late' : ''}`}>{due}</span>}
      {assignee && (
        <span className="mini-avatar" title={`Responsável: ${assignee}`}>
          {assignee.charAt(0).toUpperCase()}
        </span>
      )}
    </div>
  );
}

/** Nome de quem é responsável pela tarefa (lista compartilhada). */
export function memberName(data, task) {
  const id = task.assignee;
  if (!id) return '';
  const s = (data.shares || []).find((x) => x.memberId === id);
  if (s) return s.memberName || s.memberEmail || 'Membro';
  const o = (data.shares || []).find((x) => x.ownerId === id);
  if (o) return o.ownerName || 'Dono da lista';
  return 'Você';
}

export const taskTimeMinutes = (t) => (t.time ? minutesOf(t.time) : null);
