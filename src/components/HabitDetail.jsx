import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Icon, Sheet, SPRING } from './ui.jsx';
import {
  WEEKDAY_SHORT, PERIOD_SHORT, colorOf, keyOf, addDays, fromKey, fmtShort, shortDate,
  currentStreak, bestStreak, habitRate, totalCompletions, weekdayRates, habitDayState, milestonesOf,
  frequencyText, isWeekly, isAvoid, noteOf, streakUnit,
} from '../lib/habits.js';

const WEEKS = 18;

function NoteField({ initialText, label, onSave }) {
  const [text, setText] = useState(initialText);
  const saved = useRef(initialText);
  const latest = useRef({ text: initialText, onSave });
  latest.current = { text, onSave };
  const commit = () => {
    const v = latest.current.text.trim();
    if (v !== saved.current) {
      saved.current = v;
      latest.current.onSave(v);
    }
  };
  // Fechar o painel também salva o que foi digitado
  useEffect(() => () => commit(), []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <label className="field" htmlFor="habit-note">
      <span className="field-label">{label}</span>
      <textarea
        id="habit-note"
        className="text-input note-input"
        value={text}
        maxLength={280}
        rows={2}
        placeholder="Como foi? Algo que vale lembrar."
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
      />
      <span className="field-hint text-right">{text.length}/280</span>
    </label>
  );
}

/** Parceiro de responsabilidade: a pessoa convidada vê a sequência e se o hábito foi feito hoje (só isso). */
function PartnerField({ habit, data, store }) {
  const [email, setEmail] = useState('');
  const [state, setState] = useState({ busy: false, msg: '', error: false });
  const partners = (data.partners || []).filter((p) => p.habitId === habit.id && store && p.ownerId === (store.user && store.user.id));
  if (!store) return null;
  const invite = async () => {
    if (!email.includes('@')) return;
    setState({ busy: true, msg: '', error: false });
    const r = await store.habits.invitePartner(habit.id, email);
    setState({ busy: false, msg: r.ok ? `${r.name} vai acompanhar este hábito.` : r.message, error: !r.ok });
    if (r.ok) setEmail('');
  };
  return (
    <section className="field" aria-labelledby="dh-partner">
      <span id="dh-partner" className="field-label">
        Parceiro de hábito
      </span>
      {!store.user ? (
        <p className="field-hint">Entre na sua conta para convidar alguém a acompanhar este hábito.</p>
      ) : (
        <>
          {partners.map((p) => (
            <div key={p.partnerId} className="member-row">
              <span className="mini-avatar lg">{(p.partnerName || p.partnerEmail || '?').charAt(0).toUpperCase()}</span>
              <span className="min-w-0 flex-1 truncate">{p.partnerName || p.partnerEmail}</span>
              <button type="button" className="icon-btn ghost sm" onClick={() => store.habits.removePartner(p)} aria-label={`Remover ${p.partnerEmail}`}>
                <Icon name="X" size={16} />
              </button>
            </div>
          ))}
          <div className="invite-row">
            <input className="text-input sm" type="email" value={email} placeholder="E-mail da conta Ritmo" onChange={(e) => setEmail(e.target.value)} aria-label="E-mail do parceiro" />
            <button type="button" className="btn-secondary sm" disabled={state.busy || !email.includes('@')} onClick={invite}>
              {state.busy ? 'Enviando…' : 'Convidar'}
            </button>
          </div>
          <p className="field-hint">Ele vê só este hábito: a sequência e se você fez hoje. Nada de notas ou outros dados.</p>
          {state.msg && <p className={state.error ? 'field-error' : 'notice'}>{state.msg}</p>}
        </>
      )}
    </section>
  );
}

export function HabitDetail({ desktop, habit, data, today, dayKey, onClose, onEdit, onNote, store }) {
  const h = habit;
  const c = colorOf(h.color);
  const todayKey = keyOf(today);
  const current = currentStreak(h, data, today);
  const best = bestStreak(h, data, today);
  const rate = habitRate(h, data, today);
  const total = totalCompletions(h, data);
  const weekday = useMemo(() => weekdayRates(h, data, today), [h, data, today]);
  const unitShort = isWeekly(h) ? 'sem' : 'd';

  const cells = useMemo(() => {
    const end = addDays(today, 6 - today.getDay());
    const start = addDays(end, -(WEEKS * 7 - 1));
    const out = [];
    for (let w = 0; w < WEEKS; w++)
      for (let dow = 0; dow < 7; dow++) {
        const d = addDays(start, w * 7 + dow);
        out.push({ k: keyOf(d), d, w, dow, state: habitDayState(h, data, d, todayKey) });
      }
    return out;
  }, [h, data, today, todayKey]);

  const notes = useMemo(
    () =>
      Object.keys(data.notes || {})
        .filter((k) => data.notes[k][h.id] && k !== dayKey)
        .sort()
        .reverse()
        .slice(0, 8)
        .map((k) => ({ k, text: data.notes[k][h.id] })),
    [data.notes, h.id, dayKey]
  );

  const noteLabel = dayKey === todayKey ? 'Nota de hoje' : `Nota de ${fmtShort.format(fromKey(dayKey)).replace(/\./g, '')}`;
  const maxRate = Math.max(...weekday.map((r) => r || 0), 0.01);

  return (
    <Sheet desktop={desktop} title={h.name} onClose={onClose} labelId="detail-title" style={{ '--c': c.value, '--on': c.on }} wide>
      <div className="detail-head">
        <span className={`tile tile-lg${isAvoid(h) ? ' is-avoid' : ''}`}>
          <Icon name={h.icon} size={24} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="detail-sub">
            {isAvoid(h) ? 'Evitar' : 'Construir'}, {frequencyText(h).toLowerCase()}
          </p>
          <p className="detail-sub muted">
            {PERIOD_SHORT[h.period]}
            {h.duration ? `, ${h.duration} min` : ''}
            {h.reminder ? `, lembrete às ${h.reminder}` : ''}
          </p>
        </div>
        <button type="button" className="btn-secondary" onClick={() => onEdit(h)}>
          <Icon name="Pencil" size={15} /> Editar
        </button>
      </div>

      <div className="detail-stats">
        <div>
          <span className="detail-num">
            {current}
            <small>{unitShort}</small>
          </span>
          <span className="detail-label">Sequência atual</span>
        </div>
        <div>
          <span className="detail-num">
            {best}
            <small>{unitShort}</small>
          </span>
          <span className="detail-label">Recorde</span>
        </div>
        <div>
          <span className="detail-num">
            {Math.round(rate.rate * 100)}
            <small>%</small>
          </span>
          <span className="detail-label">{isWeekly(h) ? 'Últimas 4 semanas' : 'Últimos 30 dias'}</span>
        </div>
        <div>
          <span className="detail-num">{total}</span>
          <span className="detail-label">{total === 1 ? 'Vez no total' : 'Vezes no total'}</span>
        </div>
      </div>

      <NoteField key={`${h.id}|${dayKey}`} initialText={noteOf(data, dayKey, h.id)} label={noteLabel} onSave={(text) => onNote(h, dayKey, text)} />
      {h.minimum && <p className="field-hint">Versão mínima: {h.minimum}</p>}

      <section className="field" aria-labelledby="dh-heat">
        <span id="dh-heat" className="field-label">
          Últimas {WEEKS} semanas
        </span>
        <div className="heat-grid single" style={{ gridTemplateColumns: `repeat(${WEEKS}, 1fr)` }}>
          {cells.map((cell) => (
            <span
              key={cell.k}
              className={`hcell is-${cell.state}`}
              style={{ gridColumn: cell.w + 1, gridRow: cell.dow + 1 }}
              title={`${shortDate(cell.k)}`}
            />
          ))}
        </div>
        <p className="legend-row">
          <span><i className="hcell is-done" /> Feito</span>
          <span><i className="hcell is-miss" /> Não feito</span>
          <span><i className="hcell is-break" /> Pausa</span>
        </p>
      </section>

      <section className="field" aria-labelledby="dh-week">
        <span id="dh-week" className="field-label">
          Por dia da semana, últimas 12 semanas
        </span>
        <div className="wd-bars">
          {weekday.map((r, i) => (
            <div key={i} className={`wd-bar${r === null ? ' is-off' : ''}`}>
              <span className="wd-bar-track">
                <motion.span className="wd-bar-fill" initial={{ scaleY: 0 }} animate={{ scaleY: r === null ? 0 : r / maxRate }} transition={{ ...SPRING.progress, delay: i * 0.03 }} />
              </span>
              <span className="wd-bar-val">{r === null ? '–' : `${Math.round(r * 100)}%`}</span>
              <span className="wd-bar-label">{WEEKDAY_SHORT[i]}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="field" aria-labelledby="dh-marks">
        <span id="dh-marks" className="field-label">
          Marcos
        </span>
        <div className="marks-badges lg">
          {milestonesOf(h).map((m) => (
            <span key={m} className={`badge lg${best >= m ? ' is-on' : ''}`}>
              <Icon name={best >= m ? 'Award' : 'Lock'} size={14} />
              {m} {streakUnit(h, m)}
            </span>
          ))}
        </div>
      </section>

      <PartnerField habit={h} data={data} store={store} />

      {notes.length > 0 && (
        <section className="field" aria-labelledby="dh-notes">
          <span id="dh-notes" className="field-label">
            Notas anteriores
          </span>
          <ul className="note-list">
            {notes.map((n) => (
              <li key={n.k}>
                <span className="note-date">{shortDate(n.k)}</span>
                <span>{n.text}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </Sheet>
  );
}
