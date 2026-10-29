import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Icon, Segmented, Sheet, swapProps } from './ui.jsx';
import { statusText } from './Today.jsx';
import { supabase, authMessage, SITE_URL } from '../lib/supabase.js';

function Field({ id, label, ...props }) {
  return (
    <label className="field" htmlFor={id}>
      <span className="field-label">{label}</span>
      <input id={id} className="text-input" {...props} />
    </label>
  );
}

function SignedOut({ localName, onLocalName }) {
  const [mode, setMode] = useState('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState(localName || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setNotice('');
    setBusy(true);
    try {
      if (mode === 'signin') {
        const { error: err } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (err) throw err;
      } else if (mode === 'signup') {
        if (name.trim()) onLocalName(name.trim());
        const { data, error: err } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { data: { name: name.trim() }, emailRedirectTo: SITE_URL },
        });
        if (err) throw err;
        if (!data.session) {
          setNotice(`Enviamos um link de confirmação para ${email.trim()}. Abra o link e depois entre aqui com sua senha.`);
          setMode('signin');
        }
      } else {
        const { error: err } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: SITE_URL });
        if (err) throw err;
        setNotice(`Se existir uma conta com ${email.trim()}, chega um e-mail com o link para criar uma nova senha.`);
      }
    } catch (err) {
      setError(authMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const cta = { signin: 'Entrar', signup: 'Criar conta', forgot: 'Enviar link' }[mode];

  return (
    <form className="flex flex-col gap-5" onSubmit={submit}>
      <p className="account-lede">
        Sem conta, seus hábitos ficam só neste aparelho. Entre para usar o Ritmo no celular e no computador com os mesmos dados.
      </p>

      {mode !== 'forgot' && (
        <Segmented
          id="auth"
          label="Entrar ou criar conta"
          value={mode}
          onChange={(m) => {
            setMode(m);
            setError('');
          }}
          options={[
            { id: 'signin', label: 'Entrar' },
            { id: 'signup', label: 'Criar conta' },
          ]}
        />
      )}

      {mode === 'signup' && (
        <Field id="acc-name" label="Como quer ser chamado" value={name} onChange={(e) => setName(e.target.value)} autoComplete="given-name" maxLength={40} placeholder="Seu nome" />
      )}
      <Field
        id="acc-email"
        label="E-mail"
        type="email"
        inputMode="email"
        autoCapitalize="none"
        autoCorrect="off"
        autoComplete="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="voce@email.com"
      />
      {mode !== 'forgot' && (
        <Field
          id="acc-pass"
          label="Senha"
          type="password"
          autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
          required
          minLength={6}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder={mode === 'signup' ? 'Pelo menos 6 caracteres' : ''}
          enterKeyHint="go"
        />
      )}

      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}

      <button type="submit" className="btn-primary" disabled={busy}>
        {busy ? 'Aguarde…' : cta}
      </button>
      <button
        type="button"
        className="btn-link"
        onClick={() => {
          setMode(mode === 'forgot' ? 'signin' : 'forgot');
          setError('');
          setNotice('');
        }}
      >
        {mode === 'forgot' ? 'Voltar para entrar' : 'Esqueci a senha'}
      </button>
    </form>
  );
}

function NewPassword({ onDone }) {
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    const { error: err } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (err) setError(authMessage(err));
    else onDone();
  };
  return (
    <form className="flex flex-col gap-5" onSubmit={submit}>
      <p className="account-lede">Escolha a nova senha da sua conta.</p>
      <Field id="new-pass" label="Nova senha" type="password" autoComplete="new-password" minLength={6} required value={password} onChange={(e) => setPassword(e.target.value)} />
      {error && <p className="field-error">{error}</p>}
      <button type="submit" className="btn-primary" disabled={busy}>
        {busy ? 'Salvando…' : 'Salvar nova senha'}
      </button>
    </form>
  );
}

function WeeklyEmail({ email, enabled, onToggle, onTest }) {
  const [state, setState] = useState({ busy: false, msg: '', error: false });
  const test = async () => {
    setState({ busy: true, msg: '', error: false });
    const res = await onTest();
    setState({ busy: false, msg: res.message, error: !res.ok });
  };
  return (
    <div className="field">
      <span className="field-label">Resumo semanal por e-mail</span>
      <div className="reminder-row">
        <button type="button" className={`switch${enabled ? ' is-on' : ''}`} role="switch" aria-checked={enabled} onClick={() => onToggle(!enabled)}>
          <span className="switch-knob" />
          <span className="sr-only">Resumo semanal por e-mail</span>
        </button>
        <span className="field-hint flex-1">{enabled ? `Todo domingo às 19h, para ${email}` : 'Desligado'}</span>
      </div>
      <button type="button" className="btn-link self-start" onClick={test} disabled={state.busy}>
        {state.busy ? 'Enviando…' : 'Enviar um resumo de teste agora'}
      </button>
      {state.msg && <p className={state.error ? 'field-error' : 'notice'}>{state.msg}</p>}
    </div>
  );
}

function SignedIn({ user, name, status, hasPending, onRename, onSyncNow, onSignOut, weeklyEmail, onWeeklyEmail, onTestEmail }) {
  const [draft, setDraft] = useState(name || '');
  const [confirmOut, setConfirmOut] = useState(false);
  useEffect(() => setDraft(name || ''), [name]);

  const commit = () => {
    const v = draft.trim();
    if (v !== (name || '')) onRename(v);
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="account-card">
        <span className={`sync-dot is-${status} lg`} aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="account-status">{statusText(status)}</p>
          <p className="account-email truncate">{user.email}</p>
        </div>
        <button type="button" className="btn-secondary" onClick={onSyncNow} disabled={status === 'syncing'}>
          <Icon name="RefreshCw" size={16} /> Agora
        </button>
      </div>
      {status === 'offline' && <p className="notice">Sem internet. Tudo que você marcar fica guardado aqui e sobe quando a conexão voltar.</p>}
      {status === 'error' && <p className="field-error">O servidor recusou a última sincronização. O app tenta de novo sozinho em alguns segundos.</p>}

      <label className="field" htmlFor="acc-rename">
        <span className="field-label">Nome na saudação</span>
        <input
          id="acc-rename"
          className="text-input"
          value={draft}
          maxLength={40}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              e.currentTarget.blur();
            }
          }}
          enterKeyHint="done"
          placeholder="Seu nome"
        />
      </label>

      <WeeklyEmail email={user.email} enabled={weeklyEmail} onToggle={onWeeklyEmail} onTest={onTestEmail} />

      <AnimatePresence mode="wait" initial={false}>
        {!confirmOut ? (
          <motion.div key="out" {...swapProps}>
            <button type="button" className="btn-text-danger" onClick={() => setConfirmOut(true)}>
              <Icon name="LogOut" size={16} /> Sair deste aparelho
            </button>
          </motion.div>
        ) : (
          <motion.div key="confirm" className="flex flex-col gap-3" {...swapProps}>
            <p className="confirm-text">
              Seus hábitos continuam salvos na conta. Este aparelho volta para os dados de exemplo.
              {hasPending ? ' Há alterações que ainda não foram enviadas e vão se perder.' : ''}
            </p>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" className="btn-secondary justify-center" onClick={() => setConfirmOut(false)}>
                Cancelar
              </button>
              <button type="button" className="btn-danger justify-center" onClick={onSignOut}>
                Sair
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ExportButton({ onExport }) {
  const [msg, setMsg] = useState('');
  const run = async () => {
    setMsg('');
    try {
      const r = await onExport();
      if (r === 'downloaded') setMsg('Arquivo baixado.');
    } catch (e) {
      setMsg('Não deu para gerar o arquivo agora. Tente de novo.');
    }
  };
  return (
    <div className="field">
      <span className="field-label">Seus dados</span>
      <button type="button" className="btn-secondary self-start" onClick={run}>
        <Icon name="Download" size={16} /> Exportar histórico (CSV)
      </button>
      <p className="field-hint">Uma linha por hábito e dia, com notas e humor. Abre no Excel e no Google Planilhas.</p>
      {msg && <p className="field-hint">{msg}</p>}
    </div>
  );
}

export function AccountSheet({
  desktop, user, recovery, name, status, hasPending, weeklyEmail,
  onClose, onRename, onLocalName, onSyncNow, onSignOut, onRecoveryDone, onExport, onWeeklyEmail, onTestEmail, onSettings,
}) {
  const title = recovery ? 'Nova senha' : user ? 'Sua conta' : 'Sincronizar aparelhos';
  return (
    <Sheet desktop={desktop} title={title} onClose={onClose} labelId="account-title">
      {recovery ? (
        <NewPassword onDone={onRecoveryDone} />
      ) : user ? (
        <SignedIn
          user={user}
          name={name}
          status={status}
          hasPending={hasPending}
          onRename={onRename}
          onSyncNow={onSyncNow}
          onSignOut={onSignOut}
          weeklyEmail={weeklyEmail}
          onWeeklyEmail={onWeeklyEmail}
          onTestEmail={onTestEmail}
        />
      ) : (
        <SignedOut localName={name} onLocalName={onLocalName} />
      )}
      {!recovery && <ExportButton onExport={onExport} />}
      {!recovery && onSettings && (
        <button type="button" className="settings-link" onClick={onSettings}>
          <Icon name="Settings2" size={18} />
          <span className="flex-1 text-left">Ajustes</span>
          <span className="field-hint">Tema, módulos, feriados, backups</span>
          <Icon name="ChevronRight" size={16} />
        </button>
      )}
    </Sheet>
  );
}
