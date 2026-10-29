import React, { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Icon, TaskCheck, Popover, MenuList, usePopover, EASE_OUT } from '../ui.jsx';
import { kanbanColumns, positionBetween, dueLabel, isOverdue, priorityOf } from '../../lib/tasks.js';
import { dragProps, useDragMonitor } from '../../lib/dnd.js';

function Card({ task, todayKey, onOpen, onToggle }) {
  const items = task.checklist || [];
  const p = priorityOf(task.priority);
  return (
    <motion.div
      layout="position"
      transition={{ type: 'spring', stiffness: 520, damping: 40 }}
      className="kcard"
      data-card-id={task.id}
      style={{ '--pc': p.color }}
      onClick={() => onOpen(task.id)}
      {...dragProps({ type: 'task', id: task.id })}
    >
      <TaskCheck checked={task.done} priority={task.priority} size={18} onToggle={() => onToggle(task.id)} label={`Concluir ${task.title}`} />
      <div className="min-w-0 flex-1">
        <p className="kcard-title">{task.title}</p>
        <p className="kcard-meta">
          {task.date && <span className={isOverdue(task, todayKey) ? 'is-late' : ''}>{dueLabel(task, todayKey)}</span>}
          {items.length > 0 && (
            <span>
              <Icon name="ListChecks" size={12} /> {items.filter((c) => c.done).length}/{items.length}
            </span>
          )}
          {(task.tags || []).slice(0, 2).map((t) => (
            <span key={t} className="tag-chip">
              #{t}
            </span>
          ))}
        </p>
      </div>
    </motion.div>
  );
}

function AddCard({ onAdd }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  if (!open)
    return (
      <button type="button" className="kadd" onClick={() => setOpen(true)}>
        <Icon name="Plus" size={15} /> Adicionar tarefa
      </button>
    );
  return (
    <form
      className="kadd-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (text.trim()) onAdd(text.trim());
        setText('');
      }}
    >
      <input className="text-input sm" autoFocus value={text} onChange={(e) => setText(e.target.value)} onBlur={() => !text && setOpen(false)} placeholder="Título da tarefa" enterKeyHint="done" aria-label="Título da tarefa" />
    </form>
  );
}

export function KanbanBoard({ list, data, todayKey, desktop, store, onOpen }) {
  const cols = kanbanColumns(list, data);
  const [hover, setHover] = useState(null); // { col, index }
  const [newCol, setNewCol] = useState(null);
  const [renaming, setRenaming] = useState(null);
  const colMenu = usePopover();

  const indexAt = (colEl, y, dragId) => {
    const cards = [...colEl.querySelectorAll('[data-card-id]')].filter((c) => c.dataset.cardId !== dragId);
    let i = 0;
    for (const c of cards) {
      const r = c.getBoundingClientRect();
      if (y > r.top + r.height / 2) i++;
    }
    return i;
  };

  useDragMonitor((e) => {
    if (!e.data || e.data.type !== 'task') return;
    const colEl = e.target && e.target.closest('[data-kcol]');
    if (e.phase === 'move') setHover(colEl ? { col: colEl.dataset.kcol, index: indexAt(colEl, e.y, e.data.id), dragId: e.data.id } : null);
    if (e.phase === 'cancel') setHover(null);
    if (e.phase === 'drop') {
      setHover(null);
      if (!colEl) return;
      const colId = colEl.dataset.kcol;
      const col = cols.find((c) => c.id === colId);
      if (!col) return;
      const rest = col.tasks.filter((t) => t.id !== e.data.id);
      const i = indexAt(colEl, e.y, e.data.id);
      const pos = positionBetween(rest[i - 1] && rest[i - 1].position, rest[i] && rest[i].position);
      store.tasks.update(e.data.id, { sectionId: colId, position: pos, listId: list.id });
    }
  });

  return (
    <div className="kanban" data-autoscroll>
      {cols.map((col) => (
        <section key={col.id || 'none'} className={`kcol${hover && hover.col === col.id ? ' is-over' : ''}`} data-drop data-kcol={col.id} aria-label={col.name}>
          <header className="kcol-head">
            {renaming === col.id ? (
              <form
                className="flex-1"
                onSubmit={(e) => {
                  e.preventDefault();
                  const v = e.currentTarget.elements.name.value.trim();
                  if (v) store.lists.renameSection(list.id, col.id, v);
                  setRenaming(null);
                }}
              >
                <input name="name" className="text-input sm" defaultValue={col.name} autoFocus onBlur={(e) => e.currentTarget.form.requestSubmit()} aria-label="Nome da coluna" />
              </form>
            ) : (
              <h3 className="kcol-title">{col.name}</h3>
            )}
            <span className="kcol-count">{col.tasks.length}</span>
            {!col.fixed && (
              <button type="button" className="icon-btn ghost sm" onClick={(e) => colMenu.open(e, col)} aria-label={`Opções da coluna ${col.name}`}>
                <Icon name="Ellipsis" size={16} />
              </button>
            )}
          </header>
          <div className="kcol-body">
            {(() => {
              const here = hover && hover.col === col.id;
              let n = 0;
              const out = col.tasks.map((t) => {
                const counts = !here || t.id !== hover.dragId;
                const line = here && counts && n === hover.index;
                if (counts) n++;
                return (
                  <React.Fragment key={t.id}>
                    {line && <div className="kdrop-line" />}
                    <Card task={t} todayKey={todayKey} onOpen={onOpen} onToggle={store.tasks.toggle} />
                  </React.Fragment>
                );
              });
              if (here && hover.index >= n) out.push(<div key="end-line" className="kdrop-line" />);
              return out;
            })()}
            {col.tasks.length === 0 && !hover && <p className="kcol-empty">Arraste tarefas para cá</p>}
          </div>
          <AddCard onAdd={(title) => store.tasks.add({ title, listId: list.id, sectionId: col.id, position: (col.tasks[col.tasks.length - 1]?.position || 0) + 1 })} />
        </section>
      ))}
      <div className="kcol is-new">
        {newCol !== null ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (newCol.trim()) store.lists.addSection(list.id, newCol.trim());
              setNewCol(null);
            }}
          >
            <input className="text-input sm" autoFocus value={newCol} onChange={(e) => setNewCol(e.target.value)} onBlur={() => !newCol && setNewCol(null)} placeholder="Nome da coluna" aria-label="Nome da coluna" enterKeyHint="done" />
          </form>
        ) : (
          <button type="button" className="kadd is-col" onClick={() => setNewCol('')}>
            <Icon name="Plus" size={16} /> Nova coluna
          </button>
        )}
      </div>

      <AnimatePresence>
        {colMenu.state && (
          <Popover key="c" anchor={colMenu.state.anchor} desktop={desktop} onClose={colMenu.close} title={colMenu.state.payload.name} width={220} align="end">
            <MenuList
              items={[
                { key: 'rename', label: 'Renomear', icon: 'Pencil' },
                { key: 'del', label: 'Excluir coluna', icon: 'Trash2', danger: true, hint: 'tarefas ficam' },
              ]}
              onPick={(it) => {
                const col = colMenu.state.payload;
                colMenu.close();
                if (it.key === 'rename') setRenaming(col.id);
                if (it.key === 'del') store.lists.removeSection(list.id, col.id);
              }}
            />
          </Popover>
        )}
      </AnimatePresence>
    </div>
  );
}

export const kanbanEase = EASE_OUT;
