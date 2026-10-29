import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Icon, TaskCheck, Popover, MenuList, usePopover, AutoTextarea, Sheet, EASE_OUT, useEscape } from '../ui.jsx';
import { DatePickerBody } from './DatePicker.jsx';
import { colorOf } from '../../lib/habits.js';
import { PRIORITIES, priorityOf, dueLabel, repeatText, reminderText, listById, allTags, isOverdue, newId } from '../../lib/tasks.js';

const fmtStamp = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' }).replace('.', '') + ', ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
};

/** Campo de texto que grava ao sair do campo e após uma pausa na digitação. */
function useDraft(value, save, delay = 700) {
  const [draft, setDraft] = useState(value);
  const saved = useRef(value);
  const timer = useRef(null);
  const latest = useRef({ draft, save });
  latest.current = { draft, save };
  useEffect(() => {
    if (value !== saved.current) {
      saved.current = value;
      setDraft(value);
    }
  }, [value]);
  const flush = () => {
    clearTimeout(timer.current);
    const v = latest.current.draft;
    if (v !== saved.current) {
      saved.current = v;
      latest.current.save(v);
    }
  };
  useEffect(() => () => flush(), []); // eslint-disable-line react-hooks/exhaustive-deps
  return {
    value: draft,
    onChange: (e) => {
      setDraft(e.target.value);
      clearTimeout(timer.current);
      timer.current = setTimeout(flush, delay);
    },
    onBlur: flush,
  };
}

function Checklist({ task, onChange }) {
  const items = task.checklist || [];
  const [text, setText] = useState('');
  const set = (list) => onChange({ checklist: list });
  const add = () => {
    const v = text.trim();
    if (!v) return;
    set([...items, { id: newId('c'), text: v, done: false }]);
    setText('');
  };
  const done = items.filter((c) => c.done).length;
  return (
    <section className="td-section">
      <div className="td-section-head">
        <span>Subtarefas</span>
        {items.length > 0 && (
          <span className="td-progress">
            <span className="td-progress-bar">
              <motion.span initial={false} animate={{ scaleX: items.length ? done / items.length : 0 }} transition={{ type: 'spring', stiffness: 220, damping: 30 }} />
            </span>
            {done}/{items.length}
          </span>
        )}
      </div>
      <ul className="checklist">
        <AnimatePresence initial={false}>
          {items.map((c) => (
            <motion.li
              key={c.id}
              layout="position"
              className={`cl-item${c.done ? ' is-done' : ''}`}
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, transition: { duration: 0.12 } }}
              transition={{ duration: 0.16, ease: EASE_OUT }}
            >
              <TaskCheck checked={c.done} size={18} onToggle={() => set(items.map((x) => (x.id === c.id ? { ...x, done: !x.done } : x)))} label={c.done ? `Desmarcar ${c.text}` : `Concluir ${c.text}`} />
              <input
                className="cl-input"
                value={c.text}
                onChange={(e) => set(items.map((x) => (x.id === c.id ? { ...x, text: e.target.value } : x)))}
                onKeyDown={(e) => {
                  if (e.key === 'Backspace' && !c.text) set(items.filter((x) => x.id !== c.id));
                }}
                aria-label="Subtarefa"
              />
              <button type="button" className="icon-btn ghost sm" onClick={() => set(items.filter((x) => x.id !== c.id))} aria-label={`Remover ${c.text}`}>
                <Icon name="X" size={14} />
              </button>
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
      <form
        className="cl-add"
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <Icon name="Plus" size={16} />
        <input className="cl-input" value={text} onChange={(e) => setText(e.target.value)} placeholder="Adicionar subtarefa" enterKeyHint="done" aria-label="Nova subtarefa" />
      </form>
    </section>
  );
}

function Tags({ task, data, onChange }) {
  const [text, setText] = useState('');
  const tags = task.tags || [];
  const known = allTags(data).filter((t) => !tags.includes(t) && (!text || t.includes(text.toLowerCase().replace('#', '')))).slice(0, 6);
  const add = (t) => {
    const v = t.trim().toLowerCase().replace(/^#/, '').replace(/\s+/g, '-');
    if (v && !tags.includes(v)) onChange({ tags: [...tags, v] });
    setText('');
  };
  return (
    <section className="td-section">
      <div className="td-section-head">
        <span>Etiquetas</span>
      </div>
      <div className="tag-edit">
        {tags.map((t) => (
          <button key={t} type="button" className="tag-chip is-edit" onClick={() => onChange({ tags: tags.filter((x) => x !== t) })} aria-label={`Remover etiqueta ${t}`}>
            #{t} <Icon name="X" size={11} />
          </button>
        ))}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            add(text);
          }}
          className="tag-form"
        >
          <input className="tag-input" value={text} onChange={(e) => setText(e.target.value)} placeholder="Nova etiqueta" aria-label="Nova etiqueta" autoCapitalize="none" enterKeyHint="done" />
        </form>
      </div>
      {known.length > 0 && text && (
        <div className="tag-suggest">
          {known.map((t) => (
            <button key={t} type="button" className="tag-chip" onClick={() => add(t)}>
              #{t}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

export function TaskDetailBody({ task, data, todayKey, desktop, store, onClose, onFocus, variant }) {
  const datePop = usePopover();
  const prioPop = usePopover();
  const listPop = usePopover();
  const morePop = usePopover();
  const update = (patch) => store.tasks.update(task.id, patch);
  const title = useDraft(task.title, (v) => update({ title: v.trim() || task.title }));
  const notes = useDraft(task.notes || '', (v) => update({ notes: v }));
  const p = priorityOf(task.priority);
  const list = listById(data, task.listId);
  const overdue = isOverdue(task, todayKey);

  return (
    <div className={`td${variant === 'panel' ? ' is-panel' : ''}`}>
      <div className="td-bar">
        <TaskCheck checked={task.done} priority={task.priority} onToggle={() => store.tasks.toggle(task.id)} label={task.done ? 'Reabrir tarefa' : 'Concluir tarefa'} />
        <button type="button" className={`td-chip${task.date ? ' is-set' : ''}${overdue ? ' is-late' : ''}`} onClick={(e) => datePop.open(e)}>
          <Icon name="Calendar" size={15} />
          {task.date ? dueLabel(task, todayKey) : 'Data'}
          {task.repeat && <Icon name="Repeat" size={13} />}
        </button>
        <span className="flex-1" />
        <button type="button" className="icon-btn ghost" style={{ color: task.priority ? p.color : undefined }} onClick={(e) => prioPop.open(e)} aria-label={`Prioridade: ${p.label}`}>
          <Icon name="Flag" size={18} />
        </button>
        <button type="button" className="icon-btn ghost" onClick={(e) => morePop.open(e)} aria-label="Mais opções">
          <Icon name="Ellipsis" size={18} />
        </button>
        {onClose && (
          <button type="button" className="icon-btn ghost" onClick={onClose} aria-label="Fechar">
            <Icon name="X" size={18} />
          </button>
        )}
      </div>

      <div className="td-body">
        <AutoTextarea className="td-title" {...title} aria-label="Título" placeholder="Título" maxLength={300} />
        {(task.repeat || task.reminder >= 0) && (
          <p className="td-sub">
            {task.repeat && (
              <span>
                <Icon name="Repeat" size={13} /> {repeatText(task.repeat)}
              </span>
            )}
            {task.reminder >= 0 && task.date && (
              <span>
                <Icon name="Bell" size={13} /> {reminderText(task.reminder, !!task.time)}
              </span>
            )}
          </p>
        )}
        <AutoTextarea className="td-notes" {...notes} aria-label="Descrição" placeholder="Descrição" minRows={2} maxLength={5000} />
        <Checklist task={task} onChange={update} />
        <Tags task={task} data={data} onChange={update} />
      </div>

      <div className="td-foot">
        <button type="button" className="td-list" onClick={(e) => listPop.open(e)}>
          <i style={{ background: colorOf(list ? list.color : 'cobalt').value }} />
          {list ? list.name : 'Entrada'}
          <Icon name="ChevronDown" size={14} />
        </button>
        <span className="td-stamp">{task.done && task.completedAt ? `Concluída ${fmtStamp(task.completedAt)}` : `Criada ${fmtStamp(task.createdAt)}`}</span>
        {!task.done && onFocus && (
          <button type="button" className="btn-secondary sm" onClick={() => onFocus(task)}>
            <Icon name="Timer" size={15} /> Focar
          </button>
        )}
      </div>

      <AnimatePresence>
        {datePop.state && (
          <Popover key="d" anchor={datePop.state.anchor} desktop={desktop} onClose={datePop.close} title="Data" width={320}>
            <DatePickerBody value={task} todayKey={todayKey} onChange={update} onDone={datePop.close} />
          </Popover>
        )}
        {prioPop.state && (
          <Popover key="p" anchor={prioPop.state.anchor} desktop={desktop} onClose={prioPop.close} title="Prioridade" width={220} align="end">
            <MenuList
              items={PRIORITIES.map((x) => ({ value: x.value, label: x.label, icon: 'Flag', color: x.color, active: x.value === task.priority }))}
              onPick={(it) => {
                update({ priority: it.value });
                prioPop.close();
              }}
            />
          </Popover>
        )}
        {listPop.state && (
          <Popover key="l" anchor={listPop.state.anchor} desktop={desktop} onClose={listPop.close} title="Mover para" width={240}>
            <MenuList
              items={data.lists.map((l) => ({ value: l.id, label: l.name, dot: colorOf(l.color).value, active: l.id === task.listId }))}
              onPick={(it) => {
                if (it.value !== task.listId) update({ listId: it.value, sectionId: '' });
                listPop.close();
              }}
            />
          </Popover>
        )}
        {morePop.state && (
          <Popover key="m" anchor={morePop.state.anchor} desktop={desktop} onClose={morePop.close} title="Tarefa" width={220} align="end">
            <MenuList
              items={[
                { key: 'focus', label: 'Focar nesta tarefa', icon: 'Timer' },
                { key: 'dup', label: 'Duplicar', icon: 'Copy' },
                { key: 'nodate', label: 'Remover data', icon: 'CalendarOff' },
                { divider: true, key: 'd1' },
                { key: 'del', label: 'Excluir', icon: 'Trash2', danger: true },
              ].filter((it) => (it.key !== 'nodate' || task.date) && (it.key !== 'focus' || (!task.done && onFocus)))}
              onPick={(it) => {
                morePop.close();
                if (it.key === 'dup') store.tasks.duplicate(task.id);
                if (it.key === 'focus') onFocus(task);
                if (it.key === 'nodate') update({ date: '', time: '', repeat: '', reminder: -1, duration: 0 });
                if (it.key === 'del') {
                  store.tasks.remove(task.id);
                  if (onClose) onClose();
                }
              }}
            />
          </Popover>
        )}
      </AnimatePresence>
    </div>
  );
}

/** Painel lateral (desktop largo). */
export function TaskPanel({ task, ...rest }) {
  useEscape(rest.onClose);
  return (
    <motion.aside
      className="td-panel"
      aria-label="Detalhes da tarefa"
      initial={{ opacity: 0, x: 16 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 12, transition: { duration: 0.12, ease: EASE_OUT } }}
      transition={{ duration: 0.2, ease: EASE_OUT }}
    >
      <TaskDetailBody key={task.id} task={task} variant="panel" {...rest} />
    </motion.aside>
  );
}

/** Bottom sheet (celular) ou diálogo (desktop estreito). */
export function TaskSheet({ task, desktop, onClose, ...rest }) {
  return (
    <Sheet
      desktop={desktop}
      onClose={onClose}
      title="Tarefa"
      className="is-task"
      bodyClassName="is-flush"
      labelId="task-sheet-title"
      header={
        <h2 id="task-sheet-title" className="sr-only">
          Tarefa
        </h2>
      }
    >
      <TaskDetailBody key={task.id} task={task} desktop={desktop} onClose={onClose} {...rest} />
    </Sheet>
  );
}
