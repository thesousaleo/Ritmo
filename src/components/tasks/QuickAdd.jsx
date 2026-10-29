import React, { useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Icon, Popover, MenuList, usePopover, EASE_OUT } from '../ui.jsx';
import { DatePickerBody } from './DatePicker.jsx';
import { colorOf } from '../../lib/habits.js';
import { parseQuickAdd, viewDefaults, PRIORITIES, priorityOf, dueLabel, repeatText, listById, INBOX_ID, minutesOf, hhmm } from '../../lib/tasks.js';
import { speechSupported, listen } from '../../lib/ritmoNative.js';

const TOKEN_ICON = {
  date: 'Calendar', time: 'Clock', priority: 'Flag', tag: 'Hash', list: 'List', repeat: 'Repeat',
  deadline: 'Flag', energy: 'BatteryMedium', someday: 'Cloud', event: 'CalendarClock', amount: 'Receipt', estimate: 'Hourglass',
};

/** Campos de uma tarefa a partir de uma linha de texto (usado ao colar várias linhas). */
export function fieldsFromLine(line, todayKey, lists, defaults = {}) {
  const r = parseQuickAdd(line, todayKey, lists);
  return {
    ...defaults,
    title: r.title || line.trim(),
    date: r.date || defaults.date || '',
    time: r.time || '',
    repeat: r.repeat || '',
    priority: r.priority ?? defaults.priority ?? 0,
    listId: r.listId || defaults.listId || INBOX_ID,
    tags: [...new Set([...(defaults.tags || []), ...r.tags])],
    deadline: r.deadline,
    energy: r.energy,
    someday: r.someday,
    amount: r.amount,
    duration: r.duration,
  };
}

/**
 * Campo de nova tarefa com leitura de frase ("amanhã 15h #trabalho !1").
 * O que foi reconhecido aparece em etiquetas abaixo; tocar numa etiqueta tira o trecho do texto.
 */
export function QuickAdd({ data, view, todayKey, desktop, onAdd, onAddMany, onAddEvent, autoFocus = false, onAdded, placeholder, extraDefaults }) {
  const [text, setText] = useState('');
  const [listening, setListening] = useState(false);
  const [overrides, setOverrides] = useState({});
  const inputRef = useRef(null);
  const datePop = usePopover();
  const prioPop = usePopover();
  const listPop = usePopover();

  const parsed = useMemo(() => parseQuickAdd(text, todayKey, data.lists), [text, todayKey, data.lists]);
  const defaults = { ...viewDefaults(view, todayKey), ...(extraDefaults || {}) };
  const effective = {
    date: overrides.date !== undefined ? overrides.date : parsed.date || defaults.date || '',
    time: overrides.time !== undefined ? overrides.time : parsed.time || '',
    duration: overrides.duration || parsed.duration || 0,
    repeat: overrides.repeat !== undefined ? overrides.repeat : parsed.repeat || '',
    reminder: overrides.reminder !== undefined ? overrides.reminder : -1,
    priority: overrides.priority !== undefined ? overrides.priority : parsed.priority ?? defaults.priority ?? 0,
    listId: overrides.listId || parsed.listId || defaults.listId || INBOX_ID,
    tags: [...new Set([...(defaults.tags || []), ...parsed.tags])],
    sectionId: defaults.sectionId || '',
    deadline: parsed.deadline || '',
    energy: parsed.energy || 0,
    someday: !!parsed.someday || !!defaults.someday,
    amount: parsed.amount,
  };

  const submit = () => {
    const title = parsed.title || text.trim();
    if (!title) return;
    if (parsed.asEvent && onAddEvent) {
      // "@agenda": vira compromisso na agenda em vez de tarefa
      const start = effective.time;
      const dur = effective.duration || 60;
      onAddEvent({
        title,
        date: effective.date || todayKey,
        endDate: effective.date || todayKey,
        allDay: !start,
        start: start || '',
        end: start ? hhmm(Math.min(1439, minutesOf(start) + dur)) : '',
        repeat: effective.repeat,
        reminder: start ? 10 : -1,
      });
    } else onAdd({ ...effective, title });
    setText('');
    setOverrides({});
    if (onAdded) onAdded();
    inputRef.current && inputRef.current.focus();
  };

  const removeToken = (tok) => {
    setText((t) => (t.slice(0, tok.start) + t.slice(tok.end)).replace(/\s{2,}/g, ' '));
    inputRef.current && inputRef.current.focus();
  };

  const list = listById(data, effective.listId);
  const p = priorityOf(effective.priority);
  const showChips = parsed.tokens.length > 0;

  return (
    <div className={`qa${desktop ? '' : ' is-sheet'}`}>
      <form
        className="qa-row"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <Icon name="Plus" size={18} className="qa-plus" />
        <label className="sr-only" htmlFor={`qa-${view}`}>
          Nova tarefa
        </label>
        <input
          id={`qa-${view}`}
          ref={inputRef}
          className="qa-input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onPaste={(e) => {
            // Colar várias linhas cria uma tarefa por linha
            const raw = e.clipboardData ? e.clipboardData.getData('text') : '';
            const lines = raw
              .split(/\r?\n/)
              .map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)]|\[[ x]\])\s*/i, '').trim())
              .filter(Boolean);
            if (lines.length < 2 || !onAddMany) return;
            e.preventDefault();
            const defaults = { ...viewDefaults(view, todayKey), ...(extraDefaults || {}) };
            onAddMany(lines.slice(0, 100).map((l) => fieldsFromLine(l, todayKey, data.lists, defaults)));
            setText('');
          }}
          placeholder={placeholder || 'Adicionar tarefa. Ex.: “Ligar para o banco amanhã 15h !1”'}
          autoComplete="off"
          autoCapitalize="sentences"
          enterKeyHint="done"
          autoFocus={autoFocus}
        />
        <div className="qa-tools">
          <button type="button" className={`qa-tool${effective.date ? ' is-set' : ''}`} onClick={(e) => datePop.open(e)} aria-label="Data">
            <Icon name="Calendar" size={17} />
            {effective.date && <span>{dueLabel(effective, todayKey)}</span>}
          </button>
          <button type="button" className="qa-tool" style={{ color: effective.priority ? p.color : undefined }} onClick={(e) => prioPop.open(e)} aria-label={`Prioridade: ${p.label}`}>
            <Icon name="Flag" size={17} />
          </button>
          <button type="button" className="qa-tool" onClick={(e) => listPop.open(e)} aria-label={`Lista: ${list ? list.name : 'Entrada'}`}>
            <i className="qa-dot" style={{ background: colorOf(list ? list.color : 'cobalt').value }} />
            {desktop && <span>{list ? list.name : 'Entrada'}</span>}
          </button>
          {speechSupported && !text.trim() && (
            <button
              type="button"
              className={`qa-tool${listening ? ' is-listening' : ''}`}
              aria-label={listening ? 'Ouvindo…' : 'Ditar tarefa'}
              onClick={async () => {
                if (listening) return;
                setListening(true);
                const said = await listen({ onPartial: (t) => setText(t) });
                setListening(false);
                if (said) setText(said);
                inputRef.current && inputRef.current.focus();
              }}
            >
              <Icon name={listening ? 'AudioLines' : 'Mic'} size={17} />
            </button>
          )}
          {!desktop && (text.trim() || !speechSupported) && (
            <button type="submit" className="qa-send" disabled={!text.trim()} aria-label="Adicionar">
              <Icon name={parsed.asEvent ? 'CalendarPlus' : 'ArrowUp'} size={18} strokeWidth={2.5} />
            </button>
          )}
        </div>
      </form>

      <AnimatePresence initial={false}>
        {showChips && (
          <motion.div
            className="qa-chips"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4, transition: { duration: 0.1 } }}
            transition={{ duration: 0.15, ease: EASE_OUT }}
          >
            {parsed.tokens.map((tok) => (
              <button key={`${tok.start}-${tok.type}`} type="button" className={`qa-chip is-${tok.type}`} onClick={() => removeToken(tok)} title="Tocar para remover">
                <Icon name={TOKEN_ICON[tok.type]} size={12} />
                {tok.label}
                <Icon name="X" size={11} className="qa-chip-x" />
              </button>
            ))}
            {effective.repeat && !parsed.tokens.some((t) => t.type === 'repeat') && (
              <span className="qa-chip is-repeat">
                <Icon name="Repeat" size={12} />
                {repeatText(effective.repeat)}
              </span>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {datePop.state && (
          <Popover key="d" anchor={datePop.state.anchor} desktop={desktop} onClose={datePop.close} title="Data" width={320}>
            <DatePickerBody value={effective} todayKey={todayKey} onChange={(patch) => setOverrides((o) => ({ ...o, ...patch }))} onDone={datePop.close} />
          </Popover>
        )}
        {prioPop.state && (
          <Popover key="p" anchor={prioPop.state.anchor} desktop={desktop} onClose={prioPop.close} title="Prioridade" width={220}>
            <MenuList
              items={PRIORITIES.map((x) => ({ value: x.value, label: x.label, icon: 'Flag', color: x.color, active: x.value === effective.priority }))}
              onPick={(it) => {
                setOverrides((o) => ({ ...o, priority: it.value }));
                prioPop.close();
              }}
            />
          </Popover>
        )}
        {listPop.state && (
          <Popover key="l" anchor={listPop.state.anchor} desktop={desktop} onClose={listPop.close} title="Lista" width={240}>
            <MenuList
              items={data.lists.map((l) => ({ value: l.id, label: l.name, dot: colorOf(l.color).value, active: l.id === effective.listId }))}
              onPick={(it) => {
                setOverrides((o) => ({ ...o, listId: it.value }));
                listPop.close();
              }}
            />
          </Popover>
        )}
      </AnimatePresence>
    </div>
  );
}
