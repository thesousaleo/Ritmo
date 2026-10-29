import React, { useState } from 'react';
import { Icon, Sheet, Segmented } from '../ui.jsx';
import { COLORS, colorOf } from '../../lib/habits.js';
import { LIST_ICONS, LIST_COVERS, INBOX_ID } from '../../lib/tasks.js';
import { isHex } from '../../lib/settings.js';

/** Pessoas com quem a lista é compartilhada (dono convida e remove; membro pode sair). */
function ShareSection({ list, data, store }) {
  const [email, setEmail] = useState('');
  const [state, setState] = useState({ busy: false, msg: '', error: false });
  const members = (data.shares || []).filter((x) => x.listId === list.id);
  if (!store.user)
    return (
      <div className="field">
        <span className="field-label">Compartilhar</span>
        <p className="field-hint">Entre na sua conta para editar esta lista junto com outras pessoas.</p>
      </div>
    );
  if (list.ownerId) {
    const owner = members.find((m) => m.ownerId === list.ownerId);
    return (
      <div className="field">
        <span className="field-label">Compartilhada com você</span>
        <p className="field-hint">Lista de {(owner && owner.ownerName) || 'outra pessoa'}. Você pode criar, editar e concluir tarefas nela.</p>
        <button type="button" className="btn-text-danger self-start" onClick={() => store.lists.leave(list)}>
          <Icon name="LogOut" size={16} /> Sair da lista
        </button>
      </div>
    );
  }
  const invite = async (e) => {
    e.preventDefault();
    if (!email.trim()) return;
    setState({ busy: true, msg: '', error: false });
    const r = await store.lists.share(list.id, email);
    setState({ busy: false, msg: r.ok ? `${r.name} agora participa da lista.` : r.message, error: !r.ok });
    if (r.ok) setEmail('');
  };
  return (
    <div className="field">
      <span className="field-label">Compartilhar</span>
      {members.map((m) => (
        <div key={m.memberId} className="member-row">
          <span className="mini-avatar lg">{(m.memberName || m.memberEmail || '?').charAt(0).toUpperCase()}</span>
          <span className="min-w-0 flex-1">
            <span className="block truncate font-semibold">{m.memberName || m.memberEmail}</span>
            {m.memberName && <span className="block truncate field-hint">{m.memberEmail}</span>}
          </span>
          <button type="button" className="icon-btn ghost sm" onClick={() => store.lists.unshare(list.id, m.memberId)} aria-label={`Remover ${m.memberEmail}`}>
            <Icon name="X" size={16} />
          </button>
        </div>
      ))}
      <div className="invite-row">
        <input
          className="text-input sm"
          type="email"
          value={email}
          placeholder="E-mail da conta Ritmo"
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && invite(e)}
          aria-label="E-mail para convidar"
          autoComplete="off"
        />
        <button type="button" className="btn-secondary sm" onClick={invite} disabled={state.busy || !email.includes('@')}>
          {state.busy ? 'Enviando…' : 'Convidar'}
        </button>
      </div>
      {state.msg && <p className={state.error ? 'field-error' : 'notice'}>{state.msg}</p>}
    </div>
  );
}

export function ListSheet({ desktop, initial, onClose, onSave, data, store }) {
  const [form, setForm] = useState(initial || { name: '', color: 'cobalt', icon: 'List', view: 'list', cover: '', kind: 'tasks' });
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const c = colorOf(form.color);
  const valid = form.name.trim().length > 0;
  const custom = isHex(form.color);
  return (
    <Sheet
      desktop={desktop}
      as="form"
      title={initial ? 'Editar lista' : 'Nova lista'}
      onClose={onClose}
      style={{ '--c': c.value, '--on': c.on }}
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) onSave({ ...form, name: form.name.trim() });
      }}
      footer={
        <button type="submit" className="btn-primary" disabled={!valid}>
          {initial ? 'Salvar' : 'Criar lista'}
        </button>
      }
    >
      <div className="name-row">
        <span className="tile tile-lg">
          <Icon name={form.icon} size={22} />
        </span>
        <label className="sr-only" htmlFor="list-name">
          Nome da lista
        </label>
        <input id="list-name" className="text-input" value={form.name} onChange={(e) => set({ name: e.target.value })} placeholder="Ex.: Faculdade" maxLength={60} autoFocus={desktop} autoComplete="off" enterKeyHint="done" />
      </div>
      <fieldset className="field">
        <legend className="field-label">Cor</legend>
        <div className="swatches">
          {COLORS.map((col) => (
            <button key={col.id} type="button" className={`swatch${form.color === col.id ? ' is-on' : ''}`} style={{ '--sw': col.value }} onClick={() => set({ color: col.id })} aria-pressed={form.color === col.id} aria-label={col.name} />
          ))}
          <label className={`swatch is-custom${custom ? ' is-on' : ''}`} style={{ '--sw': custom ? form.color : '#7a8a80' }} aria-label="Cor personalizada">
            <input type="color" value={custom ? form.color : '#7a8a80'} onChange={(e) => set({ color: e.target.value })} />
            <Icon name="Pipette" size={15} />
          </label>
        </div>
      </fieldset>
      <fieldset className="field">
        <legend className="field-label">Ícone</legend>
        <div className="icon-grid">
          {LIST_ICONS.map((name) => (
            <button key={name} type="button" className={`icon-choice${form.icon === name ? ' is-on' : ''}`} onClick={() => set({ icon: name })} aria-pressed={form.icon === name} aria-label={name}>
              <Icon name={name} size={20} />
            </button>
          ))}
        </div>
      </fieldset>
      <fieldset className="field">
        <legend className="field-label">Capa</legend>
        <div className="cover-choices">
          {LIST_COVERS.map((cv) => (
            <button key={cv || 'none'} type="button" className={`cover-choice cover-${cv || 'none'}${(form.cover || '') === cv ? ' is-on' : ''}`} onClick={() => set({ cover: cv })} aria-pressed={(form.cover || '') === cv} aria-label={cv ? `Capa ${cv}` : 'Sem capa'}>
              {!cv && <Icon name="Ban" size={15} />}
            </button>
          ))}
        </div>
      </fieldset>
      <div className="field">
        <span className="field-label">Exibir como</span>
        <Segmented
          id="list-view"
          label="Exibir como"
          value={form.view || 'list'}
          onChange={(view) => set({ view })}
          options={[
            { id: 'list', label: 'Lista' },
            { id: 'kanban', label: 'Kanban' },
          ]}
        />
      </div>
      {(!initial || initial.id !== INBOX_ID) && (
        <div className="field">
          <span className="field-label">Tipo</span>
          <Segmented
            id="list-kind"
            label="Tipo de lista"
            value={form.kind || 'tasks'}
            onChange={(kind) => set({ kind })}
            options={[
              { id: 'tasks', label: 'Tarefas' },
              { id: 'bills', label: 'Contas a pagar' },
            ]}
          />
          {form.kind === 'bills' && <p className="field-hint">Cada tarefa ganha um valor; a lista mostra o total do mês e o que falta pagar. Escreva “R$ 120” ao criar.</p>}
        </div>
      )}
      {initial && initial.id !== INBOX_ID && data && store && <ShareSection list={initial} data={data} store={store} />}
    </Sheet>
  );
}
