import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Icon, SPRING, EASE_OUT, useEscape, Portal, Popover, MenuList, usePopover } from './ui.jsx';
import { statusText } from './Today.jsx';
import { colorOf } from '../lib/habits.js';
import { SMART_VIEWS, viewCount, allTags, INBOX_ID, filtersOf } from '../lib/tasks.js';
import { useDragMonitor } from '../lib/dnd.js';
import { keyOf, addDays, fromKey } from '../lib/habits.js';

export const MODULES = [
  { id: 'tasks', label: 'Tarefas', icon: 'SquareCheckBig', key: '1' },
  { id: 'calendar', label: 'Agenda', icon: 'CalendarDays', key: '2' },
  { id: 'matrix', label: 'Matriz', icon: 'Grid2x2', key: '3' },
  { id: 'focus', label: 'Foco', icon: 'Timer', key: '4' },
  { id: 'habits', label: 'Hábitos', icon: 'Sprout', key: '5' },
  { id: 'stats', label: 'Consistência', short: 'Evolução', icon: 'Activity', key: '6' },
];

export function BrandMark({ size = 26 }) {
  const colors = ['#2A9FD6', '#1FAA78', '#E39A2A', '#E0507F', '#8A6BEF'];
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      {colors.map((c, i) => {
        const a0 = ((i * 72 + 9 - 90) * Math.PI) / 180;
        const a1 = ((i * 72 + 63 - 90) * Math.PI) / 180;
        const r = 12;
        return <path key={c} d={`M ${16 + r * Math.cos(a0)} ${16 + r * Math.sin(a0)} A ${r} ${r} 0 0 1 ${16 + r * Math.cos(a1)} ${16 + r * Math.sin(a1)}`} fill="none" stroke={c} strokeWidth="4.5" strokeLinecap="round" />;
      })}
    </svg>
  );
}

/** Módulos visíveis, na ordem escolhida nos Ajustes; atalho de teclado = posição. */
export const visibleModules = (ids) =>
  (ids && ids.length ? ids : MODULES.map((m) => m.id))
    .map((id) => MODULES.find((m) => m.id === id))
    .filter(Boolean)
    .map((m, i) => ({ ...m, key: String(i + 1) }));

/** Barra fina de módulos (desktop). */
export function Rail({ module, modules, onModule, onSearch, onSettings, settingsOpen, status, focusRunning }) {
  const active = settingsOpen ? null : module;
  return (
    <nav className="rail" aria-label="Módulos">
      <div className="rail-brand" title="Ritmo">
        <BrandMark size={28} />
      </div>
      <div className="rail-items">
        {visibleModules(modules).map((m) => (
          <button key={m.id} type="button" className={`rail-item${active === m.id ? ' is-on' : ''}`} onClick={() => onModule(m.id)} aria-current={active === m.id ? 'page' : undefined} title={`${m.label} (${m.key})`}>
            {active === m.id && <motion.span layoutId="rail-pill" className="rail-pill" transition={SPRING.indicator} />}
            <span className="rail-icon">
              <Icon name={m.icon} size={21} strokeWidth={active === m.id ? 2.3 : 1.9} />
              {m.id === 'focus' && focusRunning && <span className="run-dot" aria-label="Foco em andamento" />}
            </span>
            <span className="rail-label">{m.short || m.label}</span>
          </button>
        ))}
      </div>
      <div className="rail-bottom">
        <button type="button" className="rail-item" onClick={onSearch} title="Buscar (/)">
          <span className="rail-icon">
            <Icon name="Search" size={20} />
          </span>
          <span className="rail-label">Buscar</span>
        </button>
        <button
          type="button"
          className={`rail-item${settingsOpen ? ' is-on' : ''}`}
          onClick={onSettings}
          title={`Ajustes e conta (,) · ${statusText(status)}`}
          aria-current={settingsOpen ? 'page' : undefined}
        >
          {settingsOpen && <motion.span layoutId="rail-pill" className="rail-pill" transition={SPRING.indicator} />}
          <span className="rail-icon">
            <Icon name="Settings" size={20} strokeWidth={settingsOpen ? 2.3 : 1.9} />
            {(status === 'offline' || status === 'error') && <span className={`sync-dot is-${status}`} aria-hidden="true" />}
          </span>
          <span className="rail-label">Ajustes</span>
        </button>
      </div>
    </nav>
  );
}

/** Listas inteligentes, listas do usuário e etiquetas. Também recebe tarefas arrastadas. */
export function ListsPanel({ data, view, todayKey, onView, onNewList, onNewFilter, onEditFilter, onTemplates, store }) {
  const [tagsOpen, setTagsOpen] = useState(true);
  const addMenu = usePopover();
  const tags = allTags(data);
  const userLists = data.lists.filter((l) => l.id !== INBOX_ID);
  const filters = filtersOf(data);
  const somedayCount = viewCount('someday', data, todayKey);
  const sharedIds = new Set((data.shares || []).map((x) => x.listId));

  useDragMonitor((e) => {
    if (e.phase !== 'drop' || !e.data || e.data.type !== 'task' || !e.target) return;
    const t = e.target.dataset;
    if (t.droplist) store.tasks.update(e.data.id, { listId: t.droplist, sectionId: '' });
    if (t.dropview === 'today') store.tasks.update(e.data.id, { date: todayKey });
    if (t.dropview === 'tomorrow') store.tasks.update(e.data.id, { date: keyOf(addDays(fromKey(todayKey), 1)) });
    if (t.droptag) {
      const task = data.tasks.find((x) => x.id === e.data.id);
      if (task && !(task.tags || []).includes(t.droptag)) store.tasks.update(task.id, { tags: [...(task.tags || []), t.droptag] });
    }
  });

  const Item = ({ id, label, icon, color, count, dropProps, shared, onContext }) => (
    <button
      type="button"
      className={`lp-item${view === id ? ' is-on' : ''}`}
      onClick={() => onView(id)}
      onContextMenu={onContext}
      aria-current={view === id ? 'page' : undefined}
      data-drop={dropProps && Object.keys(dropProps).length ? '' : undefined}
      {...dropProps}
    >
      {view === id && <motion.span layoutId="lp-pill" className="lp-pill" transition={SPRING.indicator} />}
      {color ? <i className="lp-dot" style={{ background: colorOf(color).value }} /> : <Icon name={icon} size={18} className="lp-icon" />}
      <span className="lp-label">{label}</span>
      {shared && <Icon name="Users" size={13} className="lp-shared" aria-label="Compartilhada" />}
      {count > 0 && <span className="lp-count">{count}</span>}
    </button>
  );

  return (
    <div className="lp">
      <div className="lp-group">
        {SMART_VIEWS.map((v) => (
          <Item
            key={v.id}
            id={v.id}
            label={v.label}
            icon={v.icon}
            count={viewCount(v.id, data, todayKey)}
            dropProps={v.id.startsWith('list:') ? { 'data-droplist': INBOX_ID } : v.id === 'today' || v.id === 'tomorrow' ? { 'data-dropview': v.id } : {}}
          />
        ))}
        {(somedayCount > 0 || view === 'someday') && <Item id="someday" label="Algum dia" icon="Cloud" count={somedayCount} />}
      </div>
      <div className="lp-group">
        <div className="lp-head">
          <span>Listas</span>
          <button type="button" className="icon-btn ghost sm" onClick={(e) => addMenu.open(e)} aria-label="Adicionar lista, modelo ou filtro">
            <Icon name="Plus" size={15} />
          </button>
        </div>
        {userLists.map((l) => (
          <Item
            key={l.id}
            id={`list:${l.id}`}
            label={l.name}
            color={l.color}
            shared={!!l.ownerId || sharedIds.has(l.id)}
            count={viewCount(`list:${l.id}`, data, todayKey)}
            dropProps={{ 'data-droplist': l.id }}
          />
        ))}
        {userLists.length === 0 && (
          <button type="button" className="lp-empty" onClick={onNewList}>
            Criar a primeira lista
          </button>
        )}
      </div>
      {filters.length > 0 && (
        <div className="lp-group">
          <div className="lp-head">
            <span>Filtros</span>
          </div>
          {filters.map((f) => (
            <Item
              key={f.id}
              id={`filter:${f.id}`}
              label={f.name}
              icon={f.icon || 'Filter'}
              count={viewCount(`filter:${f.id}`, data, todayKey)}
              onContext={(e) => {
                e.preventDefault();
                onEditFilter && onEditFilter(f);
              }}
            />
          ))}
        </div>
      )}
      {tags.length > 0 && (
        <div className="lp-group">
          <button type="button" className="lp-head is-btn" onClick={() => setTagsOpen((o) => !o)} aria-expanded={tagsOpen}>
            <span>Etiquetas</span>
            <motion.span animate={{ rotate: tagsOpen ? 0 : -90 }} transition={{ duration: 0.16, ease: EASE_OUT }}>
              <Icon name="ChevronDown" size={14} />
            </motion.span>
          </button>
          {tagsOpen && tags.map((t) => <Item key={t} id={`tag:${t}`} label={t} icon="Hash" count={viewCount(`tag:${t}`, data, todayKey)} dropProps={{ 'data-droptag': t }} />)}
        </div>
      )}
      <div className="lp-group">
        <Item id="all" label="Todas" icon="Layers" count={0} />
        <Item id="done" label="Concluídas" icon="CircleCheck" count={0} />
      </div>
      <AnimatePresence>
        {addMenu.state && (
          <Popover key="add" anchor={addMenu.state.anchor} desktop={!!(typeof window !== 'undefined' && window.innerWidth >= 1024)} onClose={addMenu.close} title="Adicionar" width={230}>
            <MenuList
              items={[
                { key: 'list', label: 'Nova lista', icon: 'ListPlus' },
                { key: 'tpl', label: 'Usar um modelo', icon: 'LayoutTemplate' },
                { key: 'filter', label: 'Novo filtro', icon: 'Filter' },
              ]}
              onPick={(it) => {
                addMenu.close();
                if (it.key === 'list') onNewList();
                if (it.key === 'tpl' && onTemplates) onTemplates();
                if (it.key === 'filter' && onNewFilter) onNewFilter();
              }}
            />
          </Popover>
        )}
      </AnimatePresence>
    </div>
  );
}

/** Gaveta lateral de listas (celular). */
export function ListsDrawer({ open, onClose, ...rest }) {
  useEscape(onClose, open);
  return (
    <Portal>
      <AnimatePresence>
        {open && (
          <>
            <motion.div
              key="bd"
              className="backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, transition: { duration: 0.16 } }}
              transition={{ duration: 0.2, ease: EASE_OUT }}
              onClick={onClose}
            />
            <motion.aside
              key="dr"
              className="drawer"
              aria-label="Listas"
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%', transition: { duration: 0.2, ease: EASE_OUT } }}
              transition={SPRING.sheet}
              drag="x"
              dragConstraints={{ left: 0, right: 0 }}
              dragElastic={{ left: 0.6, right: 0.02 }}
              onDragEnd={(e, info) => {
                if (info.offset.x < -80 || info.velocity.x < -500) onClose();
              }}
            >
              <div className="drawer-head">
                <BrandMark size={24} />
                <span>Ritmo</span>
              </div>
              <ListsPanel
                {...rest}
                onView={(v) => {
                  rest.onView(v);
                  onClose();
                }}
                onNewList={() => {
                  onClose();
                  rest.onNewList();
                }}
                onNewFilter={() => {
                  onClose();
                  rest.onNewFilter && rest.onNewFilter();
                }}
                onEditFilter={(f) => {
                  onClose();
                  rest.onEditFilter && rest.onEditFilter(f);
                }}
                onTemplates={() => {
                  onClose();
                  rest.onTemplates && rest.onTemplates();
                }}
              />
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </Portal>
  );
}

/** Abas do celular: até cinco; Evolução fica dentro de Hábitos quando os dois estão ligados. */
export function tabsFor(modules) {
  const ids = visibleModules(modules).map((m) => m.id);
  const tabs = ids.includes('habits') ? ids.filter((id) => id !== 'stats') : ids;
  return tabs.slice(0, 5);
}

export function TabBar({ module, modules, onModule, focusRunning }) {
  const tabs = tabsFor(modules);
  return (
    <nav className="tabbar" aria-label="Navegação">
      <div className="tabbar-inner is-five" style={{ gridTemplateColumns: `repeat(${tabs.length}, 1fr)` }}>
        {tabs.map((id) => {
          const m = MODULES.find((x) => x.id === id);
          const on = module === id || (id === 'habits' && module === 'stats' && !tabs.includes('stats'));
          return (
            <button key={id} type="button" className={`tab${on ? ' is-on' : ''}`} onClick={() => onModule(id)} aria-current={on ? 'page' : undefined}>
              <span className="tab-icon">
                <Icon name={m.icon} size={22} strokeWidth={on ? 2.3 : 1.9} />
                {on && <motion.span layoutId="tab-dot" className="tab-dot" transition={SPRING.indicator} />}
                {id === 'focus' && focusRunning && <span className="run-dot" aria-label="Foco em andamento" />}
              </span>
              <span className="tab-label">{m.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}

export function Fab({ onClick, label }) {
  return (
    <motion.button type="button" className="fab is-float" onClick={onClick} whileTap={{ scale: 0.92 }} transition={SPRING.press} aria-label={label}>
      <Icon name="Plus" size={26} strokeWidth={2.4} />
    </motion.button>
  );
}
