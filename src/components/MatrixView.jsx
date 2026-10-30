import React, { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Icon, Segmented, EASE_OUT } from './ui.jsx';
import { PageHeader } from './Today.jsx';
import { TaskRow } from './tasks/TaskRow.jsx';
import { matrixTasks } from '../lib/tasks.js';
import { useDragMonitor } from '../lib/dnd.js';

function QuadAdd({ onAdd }) {
  const [text, setText] = useState('');
  return (
    <form
      className="quad-add"
      onSubmit={(e) => {
        e.preventDefault();
        if (text.trim()) onAdd(text.trim());
        setText('');
      }}
    >
      <Icon name="Plus" size={15} />
      <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Adicionar" aria-label="Adicionar tarefa neste quadrante" enterKeyHint="done" />
    </form>
  );
}

export function MatrixView({ store, todayKey, desktop, onOpenTask, selectedId, headerRight }) {
  const data = store.data;
  const [scope, setScope] = useState('all');
  const quads = matrixTasks(data, todayKey, scope);

  useDragMonitor((e) => {
    if (e.phase !== 'drop' || !e.data || e.data.type !== 'task' || !e.target) return;
    const q = e.target.closest('[data-quad]');
    if (q) store.tasks.update(e.data.id, { priority: Number(q.dataset.quad) });
  });

  return (
    <div className="matrix-page">
      <PageHeader title="Matriz">
        {headerRight}
      </PageHeader>
      <div className="cal-bar">
        <Segmented
          id="mscope"
          label="Período"
          value={scope}
          onChange={setScope}
          options={[
            { id: 'all', label: 'Todas' },
            { id: 'week', label: 'Até 7 dias' },
          ]}
        />
        <span className="field-hint">{desktop ? 'Arraste entre quadrantes para mudar a prioridade.' : 'Segure e arraste para mudar de quadrante.'}</span>
      </div>
      <div className="matrix">
        {quads.map((q) => (
          <section key={q.id} className="quad" style={{ '--qc': q.tone }} data-drop data-quad={q.priority} aria-label={q.title}>
            <header className="quad-head">
              <span className="quad-mark" aria-hidden="true">
                {q.id.slice(1)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="quad-title">{q.title}</span>
                <span className="quad-hint">{q.hint}</span>
              </span>
              <span className="quad-count">{q.tasks.length}</span>
            </header>
            <div className="quad-body" data-autoscroll>
              <AnimatePresence initial={false} mode="popLayout">
                {q.tasks.map((t) => (
                  <motion.div
                    key={t.id}
                    layout="position"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0, transition: { duration: 0.12 } }}
                    transition={{ duration: 0.16, ease: EASE_OUT, layout: { type: 'spring', stiffness: 520, damping: 42 } }}
                  >
                    <TaskRow task={t} data={data} todayKey={todayKey} onToggle={store.tasks.toggle} onOpen={onOpenTask} selected={selectedId === t.id} draggable compact={!desktop} />
                  </motion.div>
                ))}
              </AnimatePresence>
              {q.tasks.length === 0 && <p className="quad-empty">Nenhuma tarefa aqui.</p>}
            </div>
            <QuadAdd onAdd={(title) => store.tasks.add({ title, priority: q.priority, date: scope === 'week' ? todayKey : '' })} />
          </section>
        ))}
      </div>
    </div>
  );
}
