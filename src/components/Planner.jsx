/*
 * Rituais e ferramentas de planejamento: Planejar o dia, Encerrar o dia, Revisão semanal,
 * "O que faço agora?", modelos e filtros. Tudo em folhas que só aparecem quando chamadas.
 */
import React, { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Sheet, Icon, Segmented, EASE_OUT, TaskCheck } from './ui.jsx';
import { keyOf, addDays, fromKey, colorOf, MOODS, shortDate } from '../lib/habits.js';
import { dayLabel, fmtMoney, PRIORITIES, ENERGY, FILTER_DUE, allTags, newId, filtersOf, viewCount } from '../lib/tasks.js';
import { dayLoad, autoSchedule, reorganizeOverdue, whatNow, taskMinutes } from '../lib/plan.js';
import { weekReview, procrastinationRadar, countdowns } from '../lib/insights.js';
import { BUILTIN_TEMPLATES } from '../lib/settings.js';
import { fmtMinutes } from '../lib/focus.js';
import { fmtTime } from '../lib/prefs.js';

const hours = (m) => fmtMinutes(Math.round(m));

/** Barra de carga do dia: tarefas contra o tempo livre. */
export function LoadBar({ load }) {
  const ratio = Math.min(1.4, load.ratio || 0);
  return (
    <div className={`loadbar${load.over ? ' is-over' : ''}`}>
      <div className="loadbar-track">
        <motion.span className="loadbar-fill" initial={false} animate={{ scaleX: Math.min(1, ratio) }} transition={{ type: 'spring', stiffness: 220, damping: 30 }} />
      </div>
      <span className="loadbar-text">
        {hours(load.taskMin)} de tarefas · {hours(load.capacity)} livres
      </span>
    </div>
  );
}

/* ---------- Planejar o dia ---------- */
function PlanDay({ store, todayKey, onDone }) {
  const data = store.data;
  const s = store.settings;
  const now = new Date();
  const load = dayLoad(data, todayKey, s);
  const overdue = (data.tasks || []).filter((t) => !t.done && t.date && t.date < todayKey);
  const { placed, left } = useMemo(() => autoSchedule(data, todayKey, s, now), [data, todayKey, s]); // eslint-disable-line react-hooks/exhaustive-deps
  const cds = countdowns(data, todayKey, 2);
  return (
    <div className="ritual">
      <LoadBar load={load} />
      {load.over && <p className="soft-note">Mais tarefas do que tempo livre hoje. Escolha o que pode ir para outro dia.</p>}
      {overdue.length > 0 && (
        <div className="ritual-card">
          <div className="ritual-card-head">
            <Icon name="Undo2" size={17} />
            <span className="flex-1">
              {overdue.length} {overdue.length === 1 ? 'tarefa atrasada' : 'tarefas atrasadas'}
            </span>
            <button
              type="button"
              className="btn-secondary sm"
              onClick={() => store.tasks.applyPlan(reorganizeOverdue(data, todayKey, s), 'Atrasadas redistribuídas nos próximos dias')}
            >
              Reorganizar
            </button>
          </div>
          <p className="field-hint">Espalha pelos próximos dias úteis sem passar da sua capacidade diária.</p>
        </div>
      )}
      <div className="ritual-card">
        <div className="ritual-card-head">
          <Icon name="CalendarClock" size={17} />
          <span className="flex-1">Encaixar nos horários livres</span>
        </div>
        {placed.length ? (
          <ul className="plan-list">
            {placed.map((p) => (
              <li key={p.id}>
                <span className="plan-time">{fmtTime(p.time)}</span>
                <span className="truncate flex-1">{p.title}</span>
                <span className="field-hint">{fmtMinutes(p.minutes)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="field-hint">Nenhuma tarefa sem horário para hoje.</p>
        )}
        {left.length > 0 && <p className="field-hint">Não couberam: {left.map((t) => t.title).join(', ')}.</p>}
        {placed.length > 0 && (
          <button
            type="button"
            className="btn-primary sm self-start"
            onClick={() => {
              store.tasks.applyPlan(placed, 'Dia planejado');
              store.habits.setDay(todayKey, { planned: true });
              onDone();
            }}
          >
            Aplicar horários
          </button>
        )}
      </div>
      {cds.length > 0 && (
        <div className="ritual-cds">
          {cds.map((c) => (
            <span key={c.ev.id} className="cd-chip" style={{ '--c': colorOf(c.ev.color).value }}>
              <b>{c.days === 0 ? 'Hoje' : c.days}</b> {c.days === 0 ? '' : c.days === 1 ? 'dia para' : 'dias para'} {c.ev.title}
            </span>
          ))}
        </div>
      )}
      <button
        type="button"
        className="btn-link"
        onClick={() => {
          store.habits.setDay(todayKey, { planned: true });
          onDone();
        }}
      >
        Pronto, dia planejado
      </button>
    </div>
  );
}

/* ---------- Encerrar o dia ---------- */
function Shutdown({ store, todayKey, onDone }) {
  const data = store.data;
  const info = (data.days || {})[todayKey] || {};
  const [journal, setJournal] = useState(info.journal || '');
  const doneToday = (data.tasks || []).filter((t) => t.done && t.completedAt && keyOf(new Date(t.completedAt)) === todayKey);
  const open = (data.tasks || []).filter((t) => !t.done && t.date && t.date <= todayKey);
  const tomorrow = keyOf(addDays(fromKey(todayKey), 1));
  const mood = (data.moods || {})[todayKey] || 0;
  return (
    <div className="ritual">
      <div className="ritual-stat">
        <span className="big-num">{doneToday.length}</span>
        <span className="field-hint">{doneToday.length === 1 ? 'tarefa concluída hoje' : 'tarefas concluídas hoje'}</span>
      </div>
      {open.length > 0 && (
        <div className="ritual-card">
          <div className="ritual-card-head">
            <Icon name="ArrowRightToLine" size={17} />
            <span className="flex-1">
              {open.length} {open.length === 1 ? 'ficou aberta' : 'ficaram abertas'}
            </span>
            <button
              type="button"
              className="btn-secondary sm"
              onClick={() => store.tasks.applyPlan(open.map((t) => ({ id: t.id, date: tomorrow, time: t.time })), `${open.length} para amanhã`)}
            >
              Passar para amanhã
            </button>
          </div>
          <ul className="plan-list is-quiet">
            {open.slice(0, 5).map((t) => (
              <li key={t.id}>
                <TaskCheck checked={false} priority={t.priority} size={16} onToggle={() => store.tasks.toggle(t.id)} label={`Concluir ${t.title}`} />
                <span className="truncate flex-1">{t.title}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="field">
        <span className="field-label">Como foi o dia?</span>
        <div className="mood-row">
          {MOODS.map((m) => (
            <button key={m.value} type="button" className={`mood-btn${mood === m.value ? ' is-on' : ''}`} onClick={() => store.habits.setMood(todayKey, mood === m.value ? 0 : m.value)} aria-label={m.label} aria-pressed={mood === m.value}>
              <Icon name={m.icon} size={22} />
            </button>
          ))}
        </div>
      </div>
      <label className="field">
        <span className="field-label">Uma linha sobre hoje</span>
        <input className="text-input" value={journal} maxLength={280} placeholder="O que valeu a pena?" onChange={(e) => setJournal(e.target.value)} enterKeyHint="done" />
      </label>
      <button
        type="button"
        className="btn-primary"
        onClick={() => {
          store.habits.setDay(todayKey, { journal: journal.trim(), shutdown: true });
          onDone();
        }}
      >
        Encerrar o dia
      </button>
    </div>
  );
}

/* ---------- Revisão semanal ---------- */
function Review({ store, todayKey, onDone, onOpenTask }) {
  const data = store.data;
  const r = weekReview(data, fromKey(todayKey));
  const radar = procrastinationRadar(data, todayKey);
  return (
    <div className="ritual">
      <div className="review-stats">
        <div>
          <span className="mid-num">{r.done.length}</span>
          <span className="field-hint">tarefas concluídas</span>
        </div>
        <div>
          <span className="mid-num">{fmtMinutes(r.focusMin)}</span>
          <span className="field-hint">de foco</span>
        </div>
        <div>
          <span className="mid-num">{r.habitRate === null ? '–' : `${Math.round(r.habitRate * 100)}%`}</span>
          <span className="field-hint">dos hábitos</span>
        </div>
      </div>
      {r.inbox.length > 0 && (
        <div className="ritual-card">
          <div className="ritual-card-head">
            <Icon name="Inbox" size={17} />
            <span className="flex-1">Entrada para organizar: {r.inbox.length}</span>
          </div>
          <ul className="plan-list is-quiet">
            {r.inbox.slice(0, 6).map((t) => (
              <li key={t.id}>
                <button type="button" className="truncate flex-1 text-left" onClick={() => onOpenTask(t.id)}>
                  {t.title}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {radar.length > 0 && (
        <div className="ritual-card">
          <div className="ritual-card-head">
            <Icon name="Radar" size={17} />
            <span className="flex-1">Você vem adiando</span>
          </div>
          <ul className="plan-list is-quiet">
            {radar.map(({ t, postponed, late }) => (
              <li key={t.id}>
                <button type="button" className="truncate flex-1 text-left" onClick={() => onOpenTask(t.id)}>
                  {t.title}
                </button>
                <span className="field-hint">{postponed >= 3 ? `${postponed}× adiada` : `${late} dias atrasada`}</span>
              </li>
            ))}
          </ul>
          <p className="field-hint">Decida: fazer, dividir, delegar ou deixar para algum dia.</p>
        </div>
      )}
      {r.upcoming.length > 0 && (
        <div className="ritual-card">
          <div className="ritual-card-head">
            <Icon name="CalendarRange" size={17} />
            <span className="flex-1">Próximos 7 dias: {r.upcoming.length} tarefas</span>
          </div>
        </div>
      )}
      {r.journal.length > 0 && (
        <div className="ritual-card">
          <div className="ritual-card-head">
            <Icon name="NotebookPen" size={17} />
            <span className="flex-1">Seu diário da semana</span>
          </div>
          <ul className="journal-list">
            {r.journal.map((j) => (
              <li key={j.day}>
                <span className="field-hint">{shortDate(j.day)}</span> {j.text}
              </li>
            ))}
          </ul>
        </div>
      )}
      <button
        type="button"
        className="btn-primary"
        onClick={() => {
          store.updateSettings({ lastReview: todayKey });
          onDone();
        }}
      >
        Concluir revisão
      </button>
    </div>
  );
}

export function RitualSheet({ mode, desktop, store, todayKey, onClose, onOpenTask }) {
  const titles = { plan: 'Planejar o dia', shutdown: 'Encerrar o dia', review: 'Revisão semanal' };
  return (
    <Sheet desktop={desktop} title={titles[mode]} onClose={onClose} labelId="ritual-title">
      {mode === 'plan' && <PlanDay store={store} todayKey={todayKey} onDone={onClose} />}
      {mode === 'shutdown' && <Shutdown store={store} todayKey={todayKey} onDone={onClose} />}
      {mode === 'review' && <Review store={store} todayKey={todayKey} onDone={onClose} onOpenTask={onOpenTask} />}
    </Sheet>
  );
}

/** Qual ritual sugerir agora (um por vez, discreto). */
export function ritualFor(data, settings, todayKey, now = new Date()) {
  if (settings.rituals === false) return null;
  const info = (data.days || {})[todayKey] || {};
  const h = now.getHours();
  const wd = now.getDay();
  const reviewedRecently = settings.lastReview && Math.abs(fromKey(todayKey) - fromKey(settings.lastReview)) < 4 * 86400000;
  if ((wd === 5 && h >= 15) || (wd === 0 && h >= 10) || (wd === 1 && h < 11)) if (!reviewedRecently) return 'review';
  if (h >= 5 && h < 12 && !info.planned) return 'plan';
  if (h >= 17 && !info.shutdown) return 'shutdown';
  return null;
}

/* ---------- O que faço agora? ---------- */
export function WhatNowSheet({ desktop, store, onClose, onOpenTask, onFocus }) {
  const [skip, setSkip] = useState([]);
  const pick = whatNow(store.data, new Date(), store.settings, skip);
  return (
    <Sheet desktop={desktop} title="O que faço agora?" onClose={onClose} className="is-compact" labelId="whatnow-title">
      <AnimatePresence mode="wait" initial={false}>
        {pick ? (
          <motion.div key={pick.task.id} className="whatnow" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.16, ease: EASE_OUT }}>
            <button type="button" className="whatnow-task" onClick={() => onOpenTask(pick.task.id)}>
              <span className="whatnow-title">{pick.task.title}</span>
              <span className="field-hint">
                {fmtMinutes(taskMinutes(pick.task))}
                {pick.reason ? ` · ${pick.reason}` : ''}
              </span>
            </button>
            {pick.next && <p className="field-hint">Você tem {fmtMinutes(pick.gap)} até “{pick.next.title}”.</p>}
            <div className="flex gap-2">
              <button type="button" className="btn-primary sm" onClick={() => onFocus(pick.task)}>
                <Icon name="Timer" size={15} /> Começar foco
              </button>
              <button type="button" className="btn-secondary sm" onClick={() => setSkip((x) => [...x, pick.task.id])}>
                Outra
              </button>
            </div>
          </motion.div>
        ) : (
          <motion.p key="none" className="field-hint" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            {skip.length ? 'Acabaram as sugestões. Que tal uma pausa?' : 'Nada pendente para agora. Aproveite.'}
          </motion.p>
        )}
      </AnimatePresence>
    </Sheet>
  );
}

/* ---------- Modelos ---------- */
export function TemplateSheet({ desktop, store, todayKey, defaultListId, onClose }) {
  const custom = store.settings.templates || [];
  const all = [...custom, ...BUILTIN_TEMPLATES];
  const [sel, setSel] = useState(null);
  const [base, setBase] = useState(todayKey);
  const [listId, setListId] = useState(defaultListId || 'inbox');
  const t = all.find((x) => x.id === sel);
  return (
    <Sheet
      desktop={desktop}
      title={t ? t.name : 'Modelos'}
      onClose={onClose}
      labelId="tpl-title"
      footer={
        t && (
          <button
            type="button"
            className="btn-primary"
            onClick={() => {
              store.tasks.fromTemplate(t, base, listId);
              onClose();
            }}
          >
            Criar {t.tasks.length} tarefas
          </button>
        )
      }
    >
      {!t ? (
        <div className="tpl-grid">
          {all.map((x) => (
            <div key={x.id} className="tpl-card">
              <button type="button" className="tpl-main" onClick={() => setSel(x.id)}>
                <Icon name={x.icon || 'LayoutTemplate'} size={20} />
                <span className="tpl-name">{x.name}</span>
                <span className="field-hint">{x.tasks.length} tarefas</span>
              </button>
              {!x.builtin && (
                <button type="button" className="icon-btn ghost sm tpl-del" onClick={() => store.updateSettings({ templates: custom.filter((c) => c.id !== x.id) })} aria-label={`Excluir modelo ${x.name}`}>
                  <Icon name="Trash2" size={14} />
                </button>
              )}
            </div>
          ))}
          <p className="field-hint tpl-hint">Para criar os seus: no menu de uma lista ou tarefa, use “Salvar como modelo”.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <label className="dp-row">
            <span className="dp-label">Data base</span>
            <input type="date" className="dp-input" value={base} onChange={(e) => e.target.value && setBase(e.target.value)} />
          </label>
          <label className="dp-row">
            <span className="dp-label">Lista</span>
            <select className="dp-select" value={listId} onChange={(e) => setListId(e.target.value)}>
              {store.data.lists.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </label>
          <ul className="plan-list is-quiet">
            {t.tasks.map((x, i) => (
              <li key={i}>
                <span className="truncate flex-1">{x.title}</span>
                <span className="field-hint">{x.offset === null || x.offset === undefined ? 'sem data' : dayLabel(keyOf(addDays(fromKey(base), x.offset)), todayKey)}</span>
              </li>
            ))}
          </ul>
          <button type="button" className="btn-link self-start" onClick={() => setSel(null)}>
            Escolher outro modelo
          </button>
        </div>
      )}
    </Sheet>
  );
}

/* ---------- Filtros inteligentes ---------- */
const FILTER_ICONS = ['Filter', 'Zap', 'Star', 'Flame', 'Briefcase', 'House', 'Coffee', 'Target'];

export function FilterSheet({ desktop, store, todayKey, initial, onClose, onSaved }) {
  const data = store.data;
  const [f, setF] = useState(initial || { id: '', name: '', icon: 'Filter', rules: { lists: [], tags: [], priorities: [], energy: [], due: '', text: '' } });
  const rules = f.rules;
  const setRules = (patch) => setF((x) => ({ ...x, rules: { ...x.rules, ...patch } }));
  const toggleIn = (key, v) => setRules({ [key]: rules[key].includes(v) ? rules[key].filter((x) => x !== v) : [...rules[key], v] });
  const tags = allTags(data);
  const valid = f.name.trim().length > 0;
  const preview = viewCount(`filter:__preview`, { ...data, settings: { ...(data.settings || {}), filters: [{ ...f, id: '__preview' }] } }, todayKey);
  const save = () => {
    const list = filtersOf(data);
    const item = { ...f, name: f.name.trim(), id: f.id || newId('f') };
    store.updateSettings({ filters: f.id ? list.map((x) => (x.id === f.id ? item : x)) : [...list, item] });
    onSaved(item);
  };
  return (
    <Sheet
      desktop={desktop}
      title={initial ? 'Editar filtro' : 'Novo filtro'}
      onClose={onClose}
      labelId="filter-title"
      footer={
        <div className="flex gap-2 w-full">
          {initial && (
            <button
              type="button"
              className="btn-text-danger"
              onClick={() => {
                store.updateSettings({ filters: filtersOf(data).filter((x) => x.id !== initial.id) });
                onClose();
              }}
            >
              Excluir
            </button>
          )}
          <button type="button" className="btn-primary flex-1" disabled={!valid} onClick={save}>
            {preview} {preview === 1 ? 'tarefa' : 'tarefas'} · Salvar
          </button>
        </div>
      }
    >
      <div className="name-row">
        <span className="tile tile-lg">
          <Icon name={f.icon} size={22} />
        </span>
        <input className="text-input" value={f.name} placeholder="Ex.: Rápidas de alta prioridade" maxLength={40} onChange={(e) => setF((x) => ({ ...x, name: e.target.value }))} aria-label="Nome do filtro" />
      </div>
      <div className="icon-grid is-small">
        {FILTER_ICONS.map((n) => (
          <button key={n} type="button" className={`icon-choice${f.icon === n ? ' is-on' : ''}`} onClick={() => setF((x) => ({ ...x, icon: n }))} aria-label={n} aria-pressed={f.icon === n}>
            <Icon name={n} size={18} />
          </button>
        ))}
      </div>
      <div className="field">
        <span className="field-label">Quando</span>
        <div className="set-chips">
          {FILTER_DUE.map((d) => (
            <button key={d.value} type="button" className={`chip-toggle${rules.due === d.value ? ' is-on' : ''}`} onClick={() => setRules({ due: d.value })}>
              {d.label}
            </button>
          ))}
        </div>
      </div>
      <div className="field">
        <span className="field-label">Listas</span>
        <div className="set-chips">
          {data.lists.map((l) => (
            <button key={l.id} type="button" className={`chip-toggle${rules.lists.includes(l.id) ? ' is-on' : ''}`} onClick={() => toggleIn('lists', l.id)}>
              <i className="qa-dot" style={{ background: colorOf(l.color).value }} /> {l.name}
            </button>
          ))}
        </div>
      </div>
      <div className="field">
        <span className="field-label">Prioridade</span>
        <div className="set-chips">
          {PRIORITIES.map((p) => (
            <button key={p.value} type="button" className={`chip-toggle${rules.priorities.includes(p.value) ? ' is-on' : ''}`} onClick={() => toggleIn('priorities', p.value)}>
              <Icon name="Flag" size={13} style={{ color: p.color }} /> {p.short}
            </button>
          ))}
        </div>
      </div>
      <div className="field">
        <span className="field-label">Energia</span>
        <div className="set-chips">
          {ENERGY.slice(1).map((e) => (
            <button key={e.value} type="button" className={`chip-toggle${rules.energy.includes(e.value) ? ' is-on' : ''}`} onClick={() => toggleIn('energy', e.value)}>
              <Icon name={e.icon} size={13} /> {e.short}
            </button>
          ))}
        </div>
      </div>
      {tags.length > 0 && (
        <div className="field">
          <span className="field-label">Etiquetas</span>
          <div className="set-chips">
            {tags.map((t) => (
              <button key={t} type="button" className={`chip-toggle${rules.tags.includes(t) ? ' is-on' : ''}`} onClick={() => toggleIn('tags', t)}>
                #{t}
              </button>
            ))}
          </div>
        </div>
      )}
      <label className="field">
        <span className="field-label">Contém o texto</span>
        <input className="text-input sm" value={rules.text} onChange={(e) => setRules({ text: e.target.value })} placeholder="Opcional" />
      </label>
    </Sheet>
  );
}

export { fmtMoney };
