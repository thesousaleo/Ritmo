import React, { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Icon, Popover, MenuList, usePopover, Segmented, EASE_OUT, SPRING } from '../ui.jsx';
import { PageHeader } from '../Today.jsx';
import { TaskRow } from './TaskRow.jsx';
import { QuickAdd } from './QuickAdd.jsx';
import { KanbanBoard } from './KanbanBoard.jsx';
import { colorOf, fromKey, fmtLong, greetingFor, isListed, countOf, activeHabits, isAvoid } from '../../lib/habits.js';
import { groupsFor, viewMeta, INBOX_ID } from '../../lib/tasks.js';
import { eventOccurrences } from '../../lib/calendar.js';
import { useDragMonitor } from '../../lib/dnd.js';

function TodayAgenda({ data, todayKey, onOpenEvent }) {
  const occ = eventOccurrences(data.events, todayKey, todayKey).sort((a, b) => (a.ev.allDay ? -1 : a.ev.start.localeCompare(b.ev.start)));
  if (!occ.length) return null;
  const now = new Date();
  const nowStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  return (
    <section className="tgroup">
      <div className="tgroup-head is-static">
        <span className="tgroup-title">Agenda de hoje</span>
        <span className="tgroup-count">{occ.length}</span>
      </div>
      <div className="agenda-strip">
        {occ.map((o) => {
          const past = !o.ev.allDay && o.ev.end && o.ev.end < nowStr && o.date === todayKey;
          return (
            <button key={o.id} type="button" className={`ev-pill${past ? ' is-past' : ''}`} style={{ '--c': colorOf(o.ev.color).value }} onClick={() => onOpenEvent(o)}>
              <span className="ev-time">{o.ev.allDay ? 'Dia todo' : `${o.ev.start}${o.ev.end ? `–${o.ev.end}` : ''}`}</span>
              <span className="ev-title">{o.ev.title}</span>
              {o.ev.location && <span className="ev-loc">{o.ev.location}</span>}
            </button>
          );
        })}
      </div>
    </section>
  );
}

function TodayHabits({ data, todayKey, onHabit }) {
  const day = fromKey(todayKey);
  const list = activeHabits(data).filter((h) => isListed(h, day));
  if (!list.length) return null;
  const done = list.filter((h) => countOf(data.log, todayKey, h.id) >= h.target).length;
  return (
    <section className="tgroup">
      <div className="tgroup-head is-static">
        <span className="tgroup-title">Hábitos de hoje</span>
        <span className="tgroup-count">
          {done}/{list.length}
        </span>
      </div>
      <div className="habit-strip">
        {list.map((h) => {
          const c = countOf(data.log, todayKey, h.id);
          const ok = c >= h.target;
          return (
            <motion.button
              key={h.id}
              type="button"
              className={`hchip${ok ? ' is-done' : ''}${isAvoid(h) ? ' is-avoid' : ''}`}
              style={{ '--c': colorOf(h.color).value, '--on': colorOf(h.color).on }}
              onClick={() => onHabit(h)}
              whileTap={{ scale: 0.95 }}
              transition={SPRING.press}
              aria-pressed={ok}
              aria-label={`${h.name}${h.target > 1 ? `: ${c} de ${h.target}` : ''}`}
            >
              <span className="hchip-dot">{ok ? <Icon name="Check" size={13} strokeWidth={3} /> : h.target > 1 ? c : <Icon name={h.icon} size={13} />}</span>
              <span className="hchip-name">{h.name}</span>
            </motion.button>
          );
        })}
      </div>
    </section>
  );
}

function EmptyState({ view, kind }) {
  const copy = {
    today: ['Nada para hoje', 'Adicione uma tarefa acima ou arraste algo de outra lista para cá.'],
    tomorrow: ['Amanhã está livre', 'Escreva “amanhã” no campo de nova tarefa para planejar o dia.'],
    next7: ['Semana livre', 'Tarefas com data nos próximos 7 dias aparecem aqui.'],
    done: ['Nenhuma tarefa concluída', 'As tarefas que você concluir ficam guardadas aqui.'],
    list: ['Lista vazia', 'Adicione a primeira tarefa no campo acima.'],
    tag: ['Nenhuma tarefa com esta etiqueta', 'Escreva #etiqueta ao criar uma tarefa.'],
    all: ['Tudo em dia', 'Não há tarefas pendentes em nenhuma lista.'],
  }[view === 'today' || view === 'tomorrow' || view === 'next7' || view === 'done' ? view : kind] || ['Nada aqui', ''];
  return (
    <div className="empty tasks-empty">
      <Icon name={view === 'done' ? 'CircleCheck' : 'Sparkles'} size={28} className="empty-icon" />
      <p className="empty-title">{copy[0]}</p>
      <p className="empty-text">{copy[1]}</p>
    </div>
  );
}

export function TasksView({ store, view, todayKey, desktop, selectedId, onOpen, onOpenLists, onEditList, onOpenEvent, onHabit, headerRight }) {
  const data = store.data;
  const meta = viewMeta(view, data);
  const list = meta.list;
  const kanban = !!(list && list.view === 'kanban');
  const groups = useMemo(() => groupsFor(view, data, todayKey), [view, data, todayKey]);
  const [collapsed, setCollapsed] = useState({ done: true });
  const listMenu = usePopover();
  const toggleGroup = (id) => setCollapsed((c) => ({ ...c, [id]: !c[id] }));
  const pendingCount = groups.filter((g) => !g.done).reduce((n, g) => n + g.tasks.length, 0);

  // Soltar uma tarefa sobre um dia (Próximos 7 dias) muda a data
  useDragMonitor((e) => {
    if (e.phase !== 'drop' || !e.data || e.data.type !== 'task' || !e.target) return;
    const day = e.target.dataset.setdate;
    if (day) store.tasks.update(e.data.id, { date: day });
  });

  const title = meta.title;
  const subtitle =
    view === 'today'
      ? `${greetingFor(new Date())}${data.name ? `, ${data.name}` : ''}. ${fmtLong.format(fromKey(todayKey)).replace(/^./, (c) => c.toUpperCase())}`
      : list
        ? `${pendingCount} ${pendingCount === 1 ? 'tarefa' : 'tarefas'}`
        : '';

  // Lista/Kanban e menu da lista: no cabeçalho no computador; numa linha própria no celular,
  // para o título da lista ficar com a largura toda.
  const listControls = list && (
    <div className="list-controls">
      <Segmented
        id={`view-${list.id}`}
        label="Modo de exibição"
        value={list.view || 'list'}
        onChange={(v) => store.lists.update(list.id, { view: v })}
        options={[
          { id: 'list', label: <Icon name="List" size={16} />, ariaLabel: 'Lista' },
          { id: 'kanban', label: <Icon name="Kanban" size={16} />, ariaLabel: 'Kanban' },
        ]}
      />
      <button type="button" className="icon-btn ghost" onClick={(e) => listMenu.open(e)} aria-label="Opções da lista">
        <Icon name="Ellipsis" size={18} />
      </button>
    </div>
  );
  const splitBar = !desktop && !!list;

  return (
    <div className={`tasks${kanban ? ' is-kanban' : ''}`}>
      <PageHeader
        title={
          <span className="tasks-title">
            {!desktop && (
              <button type="button" className="icon-btn ghost lead" onClick={onOpenLists} aria-label="Listas">
                <Icon name="Menu" size={20} />
              </button>
            )}
            {list && <i className="title-dot" style={{ background: colorOf(list.color).value }} />}
            <span className="tasks-title-text">{title}</span>
          </span>
        }
        subtitle={splitBar ? undefined : subtitle}
      >
        {!splitBar && listControls}
        {headerRight}
      </PageHeader>

      {splitBar && (
        <div className="list-bar">
          <span className="date-line">{subtitle}</span>
          {listControls}
        </div>
      )}

      {desktop && view !== 'done' && (
        <QuickAdd data={data} view={view} todayKey={todayKey} desktop onAdd={(fields) => store.tasks.add(fields)} />
      )}

      {kanban ? (
        <KanbanBoard list={list} data={data} todayKey={todayKey} desktop={desktop} store={store} onOpen={onOpen} />
      ) : (
        <div className="tgroups">
          {view === 'today' && <TodayAgenda data={data} todayKey={todayKey} onOpenEvent={onOpenEvent} />}
          {view === 'today' && <TodayHabits data={data} todayKey={todayKey} onHabit={onHabit} />}
          {pendingCount === 0 && !groups.some((g) => g.done && g.tasks.length) && <EmptyState view={view} kind={meta.kind} />}
          {groups.map((g) => {
            const isCollapsed = !!collapsed[g.id];
            if (g.compact && !g.tasks.length) {
              return (
                <section key={g.id} className="tgroup is-empty-day" data-drop data-setdate={g.date}>
                  <div className="tgroup-head is-static">
                    <span className="tgroup-title">{g.title}</span>
                    <span className="tgroup-count">0</span>
                  </div>
                </section>
              );
            }
            if (!g.tasks.length && g.id !== 'today') return null;
            return (
              <section key={g.id} className={`tgroup${g.tone === 'danger' ? ' is-danger' : ''}`} data-drop={g.date ? '' : undefined} data-setdate={g.date}>
                <button type="button" className="tgroup-head" onClick={() => toggleGroup(g.id)} aria-expanded={!isCollapsed}>
                  <motion.span className="tgroup-chev" animate={{ rotate: isCollapsed ? -90 : 0 }} transition={{ duration: 0.16, ease: EASE_OUT }}>
                    <Icon name="ChevronDown" size={15} />
                  </motion.span>
                  {g.color && <i className="title-dot sm" style={{ background: colorOf(g.color).value }} />}
                  <span className="tgroup-title">{g.title}</span>
                  <span className="tgroup-count">{g.tasks.length}</span>
                </button>
                {!isCollapsed && (
                  <div className="tgroup-body">
                    {g.tasks.length === 0 && <p className="tgroup-empty">Nenhuma tarefa. Tudo em dia por aqui.</p>}
                    <AnimatePresence initial={false} mode="popLayout">
                      {g.tasks.map((t) => (
                        <motion.div
                          key={t.id}
                          layout="position"
                          initial={{ opacity: 0, y: -4 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, scale: 0.98, transition: { duration: 0.14, ease: EASE_OUT } }}
                          transition={{ duration: 0.18, ease: EASE_OUT, layout: { type: 'spring', stiffness: 520, damping: 42 } }}
                        >
                          <TaskRow
                            task={t}
                            data={data}
                            todayKey={todayKey}
                            onToggle={store.tasks.toggle}
                            onOpen={onOpen}
                            selected={selectedId === t.id}
                            showList={!list}
                            hideDate={g.id === 'today' || !!g.date}
                            draggable={desktop}
                          />
                        </motion.div>
                      ))}
                    </AnimatePresence>
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}

      <AnimatePresence>
        {listMenu.state && list && (
          <Popover key="lm" anchor={listMenu.state.anchor} desktop={desktop} onClose={listMenu.close} title={list.name} width={220} align="end">
            <MenuList
              items={[
                { key: 'edit', label: 'Editar lista', icon: 'Pencil' },
                ...(list.id !== INBOX_ID ? [{ key: 'del', label: 'Excluir lista', icon: 'Trash2', danger: true }] : []),
              ]}
              onPick={(it) => {
                listMenu.close();
                if (it.key === 'edit') onEditList(list);
                if (it.key === 'del') store.lists.remove(list.id);
              }}
            />
          </Popover>
        )}
      </AnimatePresence>
    </div>
  );
}
