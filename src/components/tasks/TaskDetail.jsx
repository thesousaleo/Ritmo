import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Icon, TaskCheck, Popover, MenuList, usePopover, AutoTextarea, Sheet, EASE_OUT, useEscape } from '../ui.jsx';
import { DatePickerBody } from './DatePicker.jsx';
import { colorOf, keyOf, addDays, fromKey } from '../../lib/habits.js';
import { PRIORITIES, priorityOf, dueLabel, repeatText, reminderText, listById, allTags, isOverdue, newId, dayLabel, ENERGY, fmtMoney } from '../../lib/tasks.js';
import { focusOnTask } from '../../lib/insights.js';
import { fmtMinutes } from '../../lib/focus.js';
import { settingsOf } from '../../lib/settings.js';
import { memberName } from './TaskRow.jsx';

/** Propriedade da tarefa como um chip discreto: só aparece quando está definida. */
function PropChip({ icon, children, onClick, onClear, tone }) {
  return (
    <span className={`prop-chip${tone ? ` is-${tone}` : ''}`}>
      <button type="button" className="prop-chip-main" onClick={onClick}>
        <Icon name={icon} size={13} />
        {children}
      </button>
      {onClear && (
        <button type="button" className="prop-chip-x" onClick={onClear} aria-label="Remover">
          <Icon name="X" size={11} />
        </button>
      )}
    </span>
  );
}

function DeadlinePicker({ value, todayKey, onPick }) {
  const t = fromKey(todayKey);
  const friday = keyOf(addDays(t, (5 - t.getDay() + 7) % 7 || 7));
  const quick = [
    { k: todayKey, label: 'Hoje' },
    { k: keyOf(addDays(t, 1)), label: 'Amanhã' },
    { k: friday, label: 'Sexta' },
    { k: keyOf(addDays(t, 7)), label: 'Em uma semana' },
    { k: keyOf(new Date(t.getFullYear(), t.getMonth() + 1, 0)), label: 'Fim do mês' },
  ];
  return (
    <div className="flex flex-col gap-2">
      <MenuList items={quick.map((q) => ({ value: q.k, label: q.label, hint: dayLabel(q.k, todayKey), active: q.k === value }))} onPick={(it) => onPick(it.value)} />
      <label className="dp-row">
        <span className="dp-label">Outra data</span>
        <input type="date" className="dp-input" value={value || ''} onChange={(e) => e.target.value && onPick(e.target.value)} />
      </label>
      <p className="field-hint px-2 pb-1">O prazo é a data limite. A data da tarefa continua sendo quando você pretende fazer.</p>
    </div>
  );
}

function AmountEditor({ value, onSave }) {
  const [text, setText] = useState(value === null || value === undefined ? '' : String(value).replace('.', ','));
  return (
    <form
      className="flex items-center gap-2 p-1"
      onSubmit={(e) => {
        e.preventDefault();
        const n = Number(text.replace(/\./g, '').replace(',', '.'));
        onSave(text.trim() === '' || Number.isNaN(n) ? null : Math.round(n * 100) / 100);
      }}
    >
      <span className="field-hint">R$</span>
      <input className="text-input sm" inputMode="decimal" value={text} autoFocus onChange={(e) => setText(e.target.value)} placeholder="0,00" aria-label="Valor" />
      <button type="submit" className="btn-secondary sm">
        OK
      </button>
    </form>
  );
}

function Attachments({ task, store }) {
  const [busy, setBusy] = useState('');
  const files = task.attachments || [];
  if (!files.length && !busy) return null;
  return (
    <section className="td-section">
      <div className="td-section-head">
        <span>Anexos</span>
      </div>
      <ul className="attach-list">
        {files.map((a) => (
          <li key={a.id} className="attach-item">
            <button
              type="button"
              className="attach-open"
              onClick={async () => {
                const url = await store.tasks.openAttachment(a);
                if (url) window.open(url, '_blank', 'noopener');
              }}
            >
              <Icon name={/^image\//.test(a.type) ? 'Image' : /pdf/.test(a.type) ? 'FileText' : 'File'} size={16} />
              <span className="truncate">{a.name}</span>
              <span className="field-hint">{a.size > 1048576 ? `${(a.size / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(a.size / 1024))} KB`}</span>
            </button>
            <button type="button" className="icon-btn ghost sm" onClick={() => store.tasks.removeAttachment(task.id, a)} aria-label={`Remover ${a.name}`}>
              <Icon name="X" size={14} />
            </button>
          </li>
        ))}
        {busy && <li className="attach-item field-hint">{busy}</li>}
      </ul>
    </section>
  );
}

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
  const list = listById(data, task.listId);
  const propPop = usePopover();
  const fileRef = useRef(null);
  const [attachMsg, setAttachMsg] = useState('');
  const update = (patch) => store.tasks.update(task.id, patch);
  const settings = settingsOf(data);
  const members = list ? membersOf(data, list) : [];
  const focused = task.duration > 0 ? focusOnTask(data, task.id) : 0;
  const place = (settings.places || []).find((x) => x.id === task.place);
  const openProp = (e, kind) => propPop.open(e, kind);
  const title = useDraft(task.title, (v) => update({ title: v.trim() || task.title }));
  const notes = useDraft(task.notes || '', (v) => update({ notes: v }));
  const p = priorityOf(task.priority);
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
        {(task.deadline || task.energy > 0 || task.amount !== null || task.place || task.assignee || task.someday || task.nag || focused > 0) && (
          <div className="td-props">
            {task.deadline && (
              <PropChip icon="Flag" tone={task.deadline <= todayKey && !task.done ? 'late' : ''} onClick={(e) => openProp(e, 'deadline')} onClear={() => update({ deadline: '' })}>
                Prazo {dayLabel(task.deadline, todayKey).toLowerCase()}
              </PropChip>
            )}
            {task.energy > 0 && (
              <PropChip icon={ENERGY[task.energy].icon} onClick={(e) => openProp(e, 'energy')} onClear={() => update({ energy: 0 })}>
                {ENERGY[task.energy].short}
              </PropChip>
            )}
            {task.amount !== null && task.amount !== undefined && (
              <PropChip icon="Receipt" onClick={(e) => openProp(e, 'amount')} onClear={() => update({ amount: null })}>
                {fmtMoney(task.amount)}
              </PropChip>
            )}
            {task.place && (
              <PropChip icon="MapPin" onClick={(e) => openProp(e, 'place')} onClear={() => update({ place: '' })}>
                {place ? `Ao chegar: ${place.name}` : 'Lugar removido'}
              </PropChip>
            )}
            {task.assignee && (
              <PropChip icon="User" onClick={(e) => openProp(e, 'assignee')} onClear={() => update({ assignee: null })}>
                {memberName(data, task)}
              </PropChip>
            )}
            {task.someday && !task.date && (
              <PropChip icon="Cloud" onClear={() => update({ someday: false })}>
                Algum dia
              </PropChip>
            )}
            {task.nag && (
              <PropChip icon="BellRing" onClear={() => update({ nag: false })}>
                Insistir
              </PropChip>
            )}
            {task.duration > 0 && focused > 0 && (
              <PropChip icon="Timer" tone={focused > task.duration ? 'warn' : ''}>
                {fmtMinutes(focused)} de {fmtMinutes(task.duration)}
              </PropChip>
            )}
          </div>
        )}
        {(task.postponed || 0) >= 3 && !task.done && (
          <div className="soft-note">
            <Icon name="Redo2" size={16} />
            <p>
              Adiada {task.postponed} vezes. Que tal dividir em passos menores ou deixar para algum dia?
            </p>
            <button type="button" className="btn-link" onClick={() => update({ someday: true, date: '', time: '', reminder: -1, postponed: 0 })}>
              Algum dia
            </button>
          </div>
        )}
        <AutoTextarea className="td-notes" {...notes} aria-label="Descrição" placeholder="Descrição" minRows={2} maxLength={5000} />
        <Checklist task={task} onChange={update} />
        <Tags task={task} data={data} onChange={update} />
        <Attachments task={task} store={store} />
        {attachMsg && <p className="field-hint">{attachMsg}</p>}
        <input
          ref={fileRef}
          type="file"
          hidden
          onChange={async (e) => {
            const f = e.target.files && e.target.files[0];
            e.target.value = '';
            if (!f) return;
            setAttachMsg('Enviando…');
            const r = await store.tasks.attach(task.id, f);
            setAttachMsg(r.ok ? '' : r.message);
          }}
        />
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
                { key: 'deadline', label: 'Prazo final', icon: 'Flag', hint: task.deadline ? dayLabel(task.deadline, todayKey) : '' },
                { key: 'energy', label: 'Energia', icon: 'BatteryMedium', hint: task.energy ? ENERGY[task.energy].short : '' },
                { key: 'amount', label: 'Valor', icon: 'Receipt', hint: task.amount !== null ? fmtMoney(task.amount) : '' },
                { key: 'place', label: 'Lembrar ao chegar', icon: 'MapPin' },
                ...(members.length > 1 ? [{ key: 'assignee', label: 'Responsável', icon: 'User' }] : []),
                { key: 'attach', label: 'Anexar arquivo', icon: 'Paperclip' },
                { key: 'someday', label: task.someday ? 'Tirar de Algum dia' : 'Algum dia', icon: 'Cloud' },
                ...(task.reminder >= 0 ? [{ key: 'nag', label: task.nag ? 'Lembrete simples' : 'Insistir até concluir', icon: 'BellRing' }] : []),
                { divider: true, key: 'd0' },
                { key: 'dup', label: 'Duplicar', icon: 'Copy' },
                { key: 'tpl', label: 'Salvar como modelo', icon: 'LayoutTemplate' },
                { key: 'nodate', label: 'Remover data', icon: 'CalendarOff' },
                { divider: true, key: 'd1' },
                { key: 'del', label: 'Excluir', icon: 'Trash2', danger: true },
              ].filter((it) => (it.key !== 'nodate' || task.date) && (it.key !== 'focus' || (!task.done && onFocus)))}
              onPick={(it) => {
                morePop.close();
                if (['deadline', 'energy', 'amount', 'place', 'assignee'].includes(it.key)) {
                  propPop.open({ currentTarget: { getBoundingClientRect: () => morePop.state.anchor } }, it.key);
                }
                if (it.key === 'attach') {
                  if (!store.user) setAttachMsg('Entre na sua conta para anexar arquivos.');
                  else if (fileRef.current) fileRef.current.click();
                }
                if (it.key === 'someday') update(task.someday ? { someday: false } : { someday: true, date: '', time: '', repeat: '', reminder: -1 });
                if (it.key === 'nag') update({ nag: !task.nag });
                if (it.key === 'tpl') store.tasks.saveTemplate(task.title, 'LayoutTemplate', [task]);
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
        {propPop.state && (
          <Popover
            key="prop"
            anchor={propPop.state.anchor}
            desktop={desktop}
            onClose={propPop.close}
            title={{ deadline: 'Prazo final', energy: 'Energia', amount: 'Valor', place: 'Lembrar ao chegar', assignee: 'Responsável' }[propPop.state.payload]}
            width={280}
            align="end"
          >
            {propPop.state.payload === 'deadline' && (
              <DeadlinePicker
                value={task.deadline}
                todayKey={todayKey}
                onPick={(k) => {
                  update({ deadline: k });
                  propPop.close();
                }}
              />
            )}
            {propPop.state.payload === 'energy' && (
              <MenuList
                items={ENERGY.map((x) => ({ value: x.value, label: x.value ? x.label : 'Sem energia definida', icon: x.icon, active: (task.energy || 0) === x.value }))}
                onPick={(it) => {
                  update({ energy: it.value });
                  propPop.close();
                }}
              />
            )}
            {propPop.state.payload === 'amount' && (
              <AmountEditor
                value={task.amount}
                onSave={(v) => {
                  update({ amount: v });
                  propPop.close();
                }}
              />
            )}
            {propPop.state.payload === 'place' &&
              ((settings.places || []).length ? (
                <MenuList
                  items={[...settings.places.map((x) => ({ value: x.id, label: x.name, icon: 'MapPin', active: task.place === x.id })), { value: '', label: 'Nenhum lugar', icon: 'X' }]}
                  onPick={(it) => {
                    update({ place: it.value });
                    propPop.close();
                  }}
                />
              ) : (
                <p className="field-hint p-3">Cadastre seus lugares em Ajustes › Lugares. No app para Android, o Ritmo avisa quando você chega lá.</p>
              ))}
            {propPop.state.payload === 'assignee' && (
              <MenuList
                items={[...members.map((m) => ({ value: m.id, label: m.name, icon: 'User', active: task.assignee === m.id })), { value: null, label: 'Ninguém', icon: 'X' }]}
                onPick={(it) => {
                  update({ assignee: it.value });
                  propPop.close();
                }}
              />
            )}
          </Popover>
        )}
      </AnimatePresence>
    </div>
  );
}

/** Pessoas de uma lista compartilhada (dono + membros). */
function membersOf(data, list) {
  const shares = (data.shares || []).filter((x) => x.listId === list.id);
  if (!shares.length) return [];
  const owner = shares[0].ownerId;
  const out = [{ id: owner, name: list.ownerId ? shares[0].ownerName || 'Dono da lista' : 'Você' }];
  for (const s of shares) out.push({ id: s.memberId, name: s.memberName || s.memberEmail });
  return out;
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
