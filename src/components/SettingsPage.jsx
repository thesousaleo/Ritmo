/* Ajustes: tudo num só lugar, em abas (Conta e sincronização, aparência, navegação, datas, planejamento, lugares, aparelho, lembretes, backups). */
import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Icon, Segmented, EASE_OUT } from './ui.jsx';
import { COLORS, shortDate, colorOf } from '../lib/habits.js';
import { UF_NAMES, holidaysOf } from '../lib/holidays.js';
import { ALL_MODULES, isHex } from '../lib/settings.js';
import { MODULES } from './Nav.jsx';
import { isNative, notificationPermission, syncReminders } from '../lib/native.js';
import {
  isNativeAndroid, APP_ICONS, setAppIcon, biometricAvailable, authenticate, reminderDiagnostics,
  openBatterySettings, openExactAlarmSettings, openNotificationSettings, currentPosition, geofenceSupported,
} from '../lib/ritmoNative.js';
import { newId } from '../lib/tasks.js';
import { WIDGETS, taskSources } from '../lib/widgetData.js';
import { AccountPanel } from './AccountSheet.jsx';
import { statusText } from './Today.jsx';

export function Switch({ on, onChange, label }) {
  return (
    <button type="button" className={`switch${on ? ' is-on' : ''}`} role="switch" aria-checked={on} onClick={() => onChange(!on)}>
      <span className="switch-knob" />
      <span className="sr-only">{label}</span>
    </button>
  );
}

function Row({ label, hint, children, onClick, icon }) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag type={onClick ? 'button' : undefined} className={`set-row${onClick ? ' is-link' : ''}`} onClick={onClick}>
      {icon && <Icon name={icon} size={18} className="set-icon" />}
      <span className="set-text">
        <span className="set-label">{label}</span>
        {hint && <span className="set-hint">{hint}</span>}
      </span>
      {children}
      {onClick && <Icon name="ChevronRight" size={17} className="set-chev" />}
    </Tag>
  );
}

const Group = ({ title, children, foot }) => (
  <section className="set-group-wrap">
    {title && <h3 className="set-group-title">{title}</h3>}
    <div className="set-group">{children}</div>
    {foot && <p className="set-foot">{foot}</p>}
  </section>
);

const CATEGORIES = [
  { id: 'account', label: 'Conta', icon: 'CircleUser', hint: 'Sincronização, login e resumo por e-mail' },
  { id: 'look', label: 'Aparência', icon: 'Palette', hint: 'Tema, cor, densidade e texto' },
  { id: 'nav', label: 'Navegação', icon: 'LayoutGrid', hint: 'Módulos, ordem e tela inicial' },
  { id: 'time', label: 'Data e feriados', icon: 'CalendarDays', hint: 'Semana, relógio, estado e folgas' },
  { id: 'plan', label: 'Planejamento', icon: 'Sunrise', hint: 'Expediente, capacidade e rituais' },
  { id: 'places', label: 'Lugares', icon: 'MapPin', hint: 'Lembretes ao chegar em casa ou no trabalho' },
  { id: 'device', label: 'Aparelho', icon: 'Smartphone', hint: 'Sons, vibração, bloqueio e ícone' },
  { id: 'widgets', label: 'Widgets', icon: 'LayoutDashboard', hint: 'Tela inicial: tipos, fundo, cor e texto', android: true },
  { id: 'reminders', label: 'Lembretes', icon: 'BellRing', hint: 'Diagnóstico e permissões' },
  { id: 'backup', label: 'Backups', icon: 'ArchiveRestore', hint: 'Cópias automáticas e restauração' },
];

// Widgets só existem no app Android (no site, ?widgets mostra a seção para conferir o visual)
const SHOW_WIDGETS = isNativeAndroid || (typeof location !== 'undefined' && /[?&]widgets\b/.test(location.search));
const CATS = CATEGORIES.filter((c) => !c.android || SHOW_WIDGETS);

/* ---------- Aparência ---------- */
function Look({ s, set }) {
  const [hex, setHex] = useState(isHex(s.accent) ? s.accent : '#3450e6');
  return (
    <>
      <Group title="Tema">
        <div className="set-pad">
          <Segmented
            id="set-theme"
            label="Tema"
            value={s.theme}
            onChange={(v) => set({ theme: v })}
            options={[
              { id: 'auto', label: 'Auto' },
              { id: 'light', label: 'Claro' },
              { id: 'dark', label: 'Escuro' },
              { id: 'black', label: 'Preto' },
              { id: 'hour', label: <Icon name="Clock3" size={16} />, ariaLabel: 'Pelo horário' },
            ]}
          />
          <p className="set-hint mt-2">
            {s.theme === 'hour' ? 'Escuro das 19h às 7h, claro durante o dia.' : s.theme === 'black' ? 'Preto puro: economiza bateria em telas OLED.' : s.theme === 'auto' ? 'Segue o tema do aparelho.' : ''}
          </p>
        </div>
      </Group>
      <Group title="Cor de destaque">
        <div className="set-pad">
          <div className="swatches">
            <button type="button" className={`swatch is-default${!s.accent ? ' is-on' : ''}`} style={{ '--sw': 'var(--accent-default)' }} onClick={() => set({ accent: '' })} aria-label="Cor padrão" aria-pressed={!s.accent} />
            {COLORS.map((c) => (
              <button key={c.id} type="button" className={`swatch${s.accent === c.id ? ' is-on' : ''}`} style={{ '--sw': c.value }} onClick={() => set({ accent: c.id })} aria-label={c.name} aria-pressed={s.accent === c.id} />
            ))}
            <label className={`swatch is-custom${isHex(s.accent) ? ' is-on' : ''}`} style={{ '--sw': hex }} aria-label="Cor personalizada">
              <input
                type="color"
                value={hex}
                onChange={(e) => {
                  setHex(e.target.value);
                  set({ accent: e.target.value });
                }}
              />
              <Icon name="Pipette" size={15} />
            </label>
          </div>
        </div>
      </Group>
      <Group title="Densidade">
        <div className="set-pad">
          <Segmented
            id="set-density"
            label="Densidade"
            value={s.density}
            onChange={(v) => set({ density: v })}
            options={[
              { id: 'comfy', label: 'Confortável' },
              { id: 'compact', label: 'Compacta' },
            ]}
          />
        </div>
      </Group>
      <Group title="Tamanho do texto">
        <div className="set-pad">
          <div className="text-size">
            <span className="text-size-a sm">A</span>
            <input
              type="range"
              min="0"
              max="3"
              step="1"
              value={[0.9, 1, 1.1, 1.2].indexOf(s.textSize) < 0 ? 1 : [0.9, 1, 1.1, 1.2].indexOf(s.textSize)}
              onChange={(e) => set({ textSize: [0.9, 1, 1.1, 1.2][Number(e.target.value)] })}
              aria-label="Tamanho do texto"
            />
            <span className="text-size-a lg">A</span>
          </div>
        </div>
      </Group>
    </>
  );
}

/* ---------- Navegação ---------- */
function Nav({ s, set }) {
  const order = [...s.modules, ...ALL_MODULES.filter((m) => !s.modules.includes(m))];
  const meta = (id) => MODULES.find((m) => m.id === id) || { label: id, icon: 'Circle' };
  const move = (id, dir) => {
    const mods = [...s.modules];
    const i = mods.indexOf(id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= mods.length) return;
    [mods[i], mods[j]] = [mods[j], mods[i]];
    set({ modules: mods });
  };
  const toggle = (id) => {
    if (s.modules.includes(id)) {
      if (s.modules.length <= 1) return;
      set({ modules: s.modules.filter((m) => m !== id) });
    } else set({ modules: [...s.modules, id] });
  };
  return (
    <>
      <Group title="Módulos" foot="Os desligados somem da barra. Seus dados continuam guardados.">
        {order.map((id) => {
          const on = s.modules.includes(id);
          const i = s.modules.indexOf(id);
          return (
            <div key={id} className={`set-row${on ? '' : ' is-off'}`}>
              <Icon name={meta(id).icon} size={18} className="set-icon" />
              <span className="set-text">
                <span className="set-label">{meta(id).label}</span>
              </span>
              {on && (
                <span className="set-order">
                  <button type="button" className="icon-btn ghost sm" onClick={() => move(id, -1)} disabled={i === 0} aria-label={`Subir ${meta(id).label}`}>
                    <Icon name="ChevronUp" size={16} />
                  </button>
                  <button type="button" className="icon-btn ghost sm" onClick={() => move(id, 1)} disabled={i === s.modules.length - 1} aria-label={`Descer ${meta(id).label}`}>
                    <Icon name="ChevronDown" size={16} />
                  </button>
                </span>
              )}
              <Switch on={on} onChange={() => toggle(id)} label={meta(id).label} />
            </div>
          );
        })}
      </Group>
      <Group title="Abrir o app em">
        <div className="set-chips">
          {s.modules.map((id) => (
            <button key={id} type="button" className={`chip-toggle${s.startModule === id ? ' is-on' : ''}`} onClick={() => set({ startModule: id })}>
              {meta(id).label}
            </button>
          ))}
        </div>
      </Group>
    </>
  );
}

/* ---------- Data, hora e feriados ---------- */
function Time({ s, set, todayKey }) {
  const [date, setDate] = useState('');
  const [name, setName] = useState('');
  const year = Number(todayKey.slice(0, 4));
  const upcoming = [...holidaysOf(year).entries(), ...holidaysOf(year + 1).entries()]
    .filter(([k]) => k >= todayKey)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(0, 4);
  return (
    <>
      <Group>
        <Row label="Semana começa no">
          <Segmented id="set-week" label="Início da semana" value={s.weekStart} onChange={(v) => set({ weekStart: v })} options={[{ id: 0, label: 'Dom' }, { id: 1, label: 'Seg' }]} />
        </Row>
        <Row label="Relógio">
          <Segmented id="set-clock" label="Formato da hora" value={s.clock24 ? 24 : 12} onChange={(v) => set({ clock24: v === 24 })} options={[{ id: 24, label: '24h' }, { id: 12, label: '12h' }]} />
        </Row>
      </Group>
      <Group title="Feriados" foot="Feriados contam nos dias úteis (“quinto dia útil”, contas no dia útil anterior) e aparecem na agenda.">
        <Row label="Estado" hint="Para os feriados estaduais">
          <select className="set-select" value={s.uf} onChange={(e) => set({ uf: e.target.value })} aria-label="Estado">
            <option value="">Só nacionais</option>
            {Object.entries(UF_NAMES).map(([uf, n]) => (
              <option key={uf} value={uf}>
                {n}
              </option>
            ))}
          </select>
        </Row>
        <Row label="Carnaval e Corpus Christi" hint="Pontos facultativos contam como folga">
          <Switch on={s.optionalHolidays} onChange={(v) => set({ optionalHolidays: v })} label="Pontos facultativos" />
        </Row>
        <Row label="Mostrar na agenda">
          <Switch on={s.showHolidays} onChange={(v) => set({ showHolidays: v })} label="Mostrar feriados na agenda" />
        </Row>
        {upcoming.length > 0 && (
          <div className="set-pad set-list">
            {upcoming.map(([k, h]) => (
              <div key={k} className="set-li">
                <span className="set-li-date">{shortDate(k)}</span>
                <span className="flex-1 min-w-0 truncate">{h.name}</span>
                <span className="set-hint">{h.kind}</span>
              </div>
            ))}
          </div>
        )}
      </Group>
      <Group title="Folgas e feriados municipais" foot="Datas suas que também não são dias úteis.">
        {(s.customHolidays || []).map((h) => (
          <div key={h.date} className="set-row">
            <span className="set-li-date">{shortDate(h.date)}</span>
            <span className="set-text">
              <span className="set-label">{h.name || 'Folga'}</span>
            </span>
            <button type="button" className="icon-btn ghost sm" onClick={() => set({ customHolidays: s.customHolidays.filter((x) => x.date !== h.date) })} aria-label={`Remover ${h.name}`}>
              <Icon name="X" size={16} />
            </button>
          </div>
        ))}
        <form
          className="set-row set-add"
          onSubmit={(e) => {
            e.preventDefault();
            if (!date) return;
            const list = [...(s.customHolidays || []).filter((x) => x.date !== date), { date, name: name.trim() || 'Folga' }].sort((a, b) => a.date.localeCompare(b.date));
            set({ customHolidays: list });
            setDate('');
            setName('');
          }}
        >
          <input type="date" className="set-input" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Data da folga" />
          <input className="set-input flex-1" value={name} placeholder="Nome (ex.: aniversário da cidade)" onChange={(e) => setName(e.target.value)} aria-label="Nome da folga" />
          <button type="submit" className="icon-btn" disabled={!date} aria-label="Adicionar folga">
            <Icon name="Plus" size={17} />
          </button>
        </form>
      </Group>
    </>
  );
}

/* ---------- Planejamento ---------- */
function Plan({ s, set }) {
  const hours = Math.round((s.dailyCapacity || 360) / 30) / 2;
  return (
    <>
      <Group title="Expediente" foot="Usado no “Planejar meu dia”, nos horários livres e no aviso de dia cheio.">
        <Row label="Começa">
          <input type="time" className="set-input" value={s.workStart} onChange={(e) => e.target.value && set({ workStart: e.target.value })} aria-label="Início do expediente" />
        </Row>
        <Row label="Termina">
          <input type="time" className="set-input" value={s.workEnd} onChange={(e) => e.target.value && set({ workEnd: e.target.value })} aria-label="Fim do expediente" />
        </Row>
        <Row label="Tarefas por dia" hint={`Aviso quando passar de ${hours}h`}>
          <span className="stepper sm">
            <button type="button" className="icon-btn sm" onClick={() => set({ dailyCapacity: Math.max(60, (s.dailyCapacity || 360) - 30) })} aria-label="Menos">
              <Icon name="Minus" size={15} />
            </button>
            <span className="stepper-val">{hours}h</span>
            <button type="button" className="icon-btn sm" onClick={() => set({ dailyCapacity: Math.min(900, (s.dailyCapacity || 360) + 30) })} aria-label="Mais">
              <Icon name="Plus" size={15} />
            </button>
          </span>
        </Row>
      </Group>
      <Group>
        <Row label="Rituais" hint="Sugestões discretas para planejar a manhã, encerrar o dia e revisar a semana">
          <Switch on={s.rituals} onChange={(v) => set({ rituals: v })} label="Rituais" />
        </Row>
        <Row label="Horários livres na agenda">
          <Switch on={s.calendarGaps} onChange={(v) => set({ calendarGaps: v })} label="Horários livres" />
        </Row>
        <Row label="Hábitos com horário na agenda">
          <Switch on={s.calendarHabits} onChange={(v) => set({ calendarHabits: v })} label="Hábitos na agenda" />
        </Row>
      </Group>
    </>
  );
}

/* ---------- Lugares ---------- */
function Places({ s, set }) {
  const [name, setName] = useState('');
  const [state, setState] = useState('');
  const add = async () => {
    setState('Procurando sua localização…');
    const pos = await currentPosition();
    if (!pos) {
      setState('Não foi possível obter a localização. Confira a permissão.');
      return;
    }
    set({ places: [...(s.places || []), { id: newId('p'), name: name.trim() || 'Lugar', lat: pos.lat, lng: pos.lng, radius: 150 }] });
    setName('');
    setState('');
  };
  return (
    <>
      <Group
        title="Seus lugares"
        foot={
          geofenceSupported
            ? 'Numa tarefa, escolha um lugar para ser lembrado ao chegar lá.'
            : 'Os lembretes ao chegar funcionam no app para Android. Aqui você já pode cadastrar os lugares.'
        }
      >
        {(s.places || []).map((p) => (
          <div key={p.id} className="set-row">
            <Icon name="MapPin" size={18} className="set-icon" />
            <span className="set-text">
              <span className="set-label">{p.name}</span>
              <span className="set-hint">Raio de {p.radius} m</span>
            </span>
            <select className="set-select sm" value={p.radius} onChange={(e) => set({ places: s.places.map((x) => (x.id === p.id ? { ...x, radius: Number(e.target.value) } : x)) })} aria-label="Raio">
              {[100, 150, 300, 500, 1000].map((r) => (
                <option key={r} value={r}>
                  {r} m
                </option>
              ))}
            </select>
            <button type="button" className="icon-btn ghost sm" onClick={() => set({ places: s.places.filter((x) => x.id !== p.id) })} aria-label={`Remover ${p.name}`}>
              <Icon name="X" size={16} />
            </button>
          </div>
        ))}
        <div className="set-row set-add">
          <input className="set-input flex-1" value={name} placeholder="Nome (Casa, Trabalho, Mercado…)" onChange={(e) => setName(e.target.value)} aria-label="Nome do lugar" />
          <button type="button" className="btn-secondary sm" onClick={add}>
            <Icon name="LocateFixed" size={15} /> Estou aqui
          </button>
        </div>
      </Group>
      {state && <p className="set-foot">{state}</p>}
    </>
  );
}

/* ---------- Este aparelho ---------- */
function Device({ device, setDevice }) {
  const [bio, setBio] = useState(false);
  useEffect(() => {
    biometricAvailable().then(setBio);
  }, []);
  return (
    <>
      <Group>
        <Row label="Sons ao concluir">
          <Switch on={device.sounds !== false} onChange={(v) => setDevice({ sounds: v })} label="Sons" />
        </Row>
        <Row label="Vibração">
          <Switch on={device.haptics !== false} onChange={(v) => setDevice({ haptics: v })} label="Vibração" />
        </Row>
      </Group>
      {isNativeAndroid && (
        <Group foot={bio ? 'Pede a digital ou o rosto sempre que o app abrir.' : 'Cadastre uma digital ou rosto no Android para usar o bloqueio.'}>
          <Row label="Bloquear com digital">
            <Switch
              on={!!device.lock}
              onChange={async (v) => {
                if (v && !(await authenticate('Confirme para ativar o bloqueio'))) return;
                setDevice({ lock: v });
              }}
              label="Bloqueio"
            />
          </Row>
        </Group>
      )}
      {isNativeAndroid && (
        <Group title="Ícone do app" foot="O Android pode levar alguns segundos para trocar o ícone na tela inicial.">
          <div className="set-pad icon-choices">
            {APP_ICONS.map((ic) => (
              <button
                key={ic.id}
                type="button"
                className={`app-icon-choice${device.appIcon === ic.id ? ' is-on' : ''}`}
                onClick={() => {
                  setDevice({ appIcon: ic.id });
                  setAppIcon(ic.id);
                }}
              >
                <span className="app-icon-prev" style={{ background: ic.bg, color: ic.fg }}>
                  <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
                    <path d="M4 15c2.5 0 3-6 5.5-6S12 17 14.5 17 17 9 20 9" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
                  </svg>
                </span>
                <span>{ic.label}</span>
              </button>
            ))}
          </div>
        </Group>
      )}
    </>
  );
}

/* ---------- Widgets ---------- */
const SAMPLE_ROWS = [
  { id: 'a', title: 'Revisar a semana', meta: '09:00', color: '#D6453D' },
  { id: 'b', title: 'Comprar café', meta: '', color: '#A3ADA6' },
  { id: 'c', title: 'Ligar para a Ana', meta: '18:30', color: '#3F63E8' },
];
function Widgets({ store, todayKey }) {
  const w = store.device.widget || {};
  const setW = (patch) => store.setDevice({ widget: { ...w, ...patch } });
  const opacity = Math.max(20, Math.min(100, w.opacity ?? 100));
  const today = taskSources(store.data, todayKey)[0];
  const rows = today.tasks.length ? today.tasks.slice(0, 3) : SAMPLE_ROWS;
  const accent = w.accent ? colorOf(w.accent).value : 'var(--accent)';
  return (
    <>
      <div className="wprev-wall" aria-hidden="true">
        <div className={`wprev${w.textScale === 'large' ? ' is-large' : ''}`} style={{ '--wp-alpha': `${opacity}%`, '--wp-accent': accent }}>
          <div className="wprev-head">
            <b>Hoje</b>
            <span className="wprev-count">{today.count || ''}</span>
            <Icon name="Plus" size={17} />
          </div>
          {rows.map((t) => (
            <div className="wprev-row" key={t.id}>
              <span className="wprev-check" style={{ borderColor: t.color }} />
              <span className="wprev-title">{t.title}</span>
              {t.meta && <span className="wprev-meta">{t.meta}</span>}
            </div>
          ))}
        </div>
      </div>
      <Group title="Fundo">
        <div className="set-pad text-size">
          <span className="text-size-a sm">{opacity}%</span>
          <input
            type="range"
            min="20"
            max="100"
            step="10"
            value={opacity}
            onChange={(e) => setW({ opacity: Number(e.target.value) })}
            aria-label="Opacidade do fundo dos widgets"
          />
        </div>
      </Group>
      <Group title="Cor de destaque">
        <div className="set-pad">
          <div className="swatches">
            <button type="button" className={`swatch is-default${!w.accent ? ' is-on' : ''}`} style={{ '--sw': 'var(--accent)' }} onClick={() => setW({ accent: '' })} aria-label="Igual ao app" aria-pressed={!w.accent} />
            {COLORS.map((c) => (
              <button key={c.id} type="button" className={`swatch${w.accent === c.id ? ' is-on' : ''}`} style={{ '--sw': c.value }} onClick={() => setW({ accent: c.id })} aria-label={c.name} aria-pressed={w.accent === c.id} />
            ))}
          </div>
        </div>
      </Group>
      <Group title="Texto">
        <div className="set-pad">
          <Segmented
            id="set-wtext"
            label="Tamanho do texto dos widgets"
            value={w.textScale === 'large' ? 'large' : 'normal'}
            onChange={(v) => setW({ textScale: v })}
            options={[
              { id: 'normal', label: 'Normal' },
              { id: 'large', label: 'Grande' },
            ]}
          />
        </div>
      </Group>
      <Group
        title="Tipos de widget"
        foot="Para colocar: toque e segure num espaço vazio da tela inicial › Widgets › Ritmo. Ao soltar, o widget pergunta o que mostrar e a aparência (igual ao app, claro, escuro, preto ou transparente). Para mudar depois, toque e segure no widget › Reconfigurar."
      >
        {WIDGETS.map((x) => (
          <Row key={x.id} icon={x.icon} label={x.name} hint={`${x.desc} Tamanho inicial ${x.size}.`} />
        ))}
      </Group>
    </>
  );
}

/* ---------- Lembretes ---------- */
function Reminders({ data }) {
  const [diag, setDiag] = useState(null);
  const [perm, setPerm] = useState('');
  const load = async () => {
    setPerm(await notificationPermission(false));
    setDiag(await reminderDiagnostics());
  };
  useEffect(() => {
    load();
  }, []);
  if (!isNative)
    return (
      <Group foot="No site, lembretes não tocam com o navegador fechado. Instale o app para Android para receber avisos de hábitos, tarefas e eventos.">
        <Row label="Lembretes neste aparelho" hint="Disponíveis no app para Android" />
      </Group>
    );
  const ok = (v) => (v === true || v === 'granted' ? <span className="diag ok">OK</span> : <span className="diag bad">Ajustar</span>);
  return (
    <>
      <Group title="Diagnóstico">
        <Row label="Permissão de notificações" onClick={() => notificationPermission(true).then(load)}>
          {ok(perm)}
        </Row>
        {diag && (
          <>
            <Row label="Alarmes no horário exato" hint="Sem isso, lembretes podem atrasar" onClick={() => openExactAlarmSettings().then(load)}>
              {ok(diag.exactAlarms)}
            </Row>
            <Row label="Sem economia de bateria" hint="O Android pode silenciar apps em segundo plano" onClick={() => openBatterySettings().then(load)}>
              {ok(diag.ignoringBattery)}
            </Row>
            <Row label="Canal de notificações" onClick={openNotificationSettings}>
              {ok(diag.channelEnabled !== false)}
            </Row>
            <Row label="Lembretes agendados" hint={diag.pending !== undefined ? `${diag.pending} no aparelho` : undefined} />
          </>
        )}
      </Group>
      <button
        type="button"
        className="btn-secondary self-start"
        onClick={async () => {
          await syncReminders(data, { ask: true });
          load();
        }}
      >
        <Icon name="RefreshCw" size={15} /> Reagendar todos
      </button>
    </>
  );
}

/* ---------- Backups ---------- */
function Backups({ store }) {
  const [list, setList] = useState(null);
  const [msg, setMsg] = useState('');
  const [confirm, setConfirm] = useState(null);
  const fileRef = useRef(null);
  const linked = !!store.user;
  const refresh = async () => {
    if (!linked) return;
    try {
      setList(await store.account.listBackups());
    } catch (e) {
      setList([]);
    }
  };
  useEffect(() => {
    refresh();
  }, [linked]); // eslint-disable-line react-hooks/exhaustive-deps
  const fmt = (iso) => new Date(iso).toLocaleString('pt-BR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  return (
    <>
      <Group foot={linked ? 'Uma cópia por dia fica guardada na sua conta (as 14 mais recentes).' : 'Entre na sua conta para guardar cópias automáticas. O arquivo de backup funciona sem conta.'}>
        {linked && (
          <Row label="Backup automático diário">
            <Switch on={store.device.autoBackup !== false} onChange={(v) => store.setDevice({ autoBackup: v })} label="Backup automático" />
          </Row>
        )}
        {linked && (
          <Row
            label="Fazer backup agora"
            hint={store.device.lastBackup ? `Último: ${fmt(store.device.lastBackup)}` : undefined}
            onClick={async () => {
              setMsg('Salvando…');
              const r = await store.account.backupNow();
              setMsg(r.ok ? 'Backup salvo.' : r.message);
              refresh();
            }}
          />
        )}
        <Row label="Baixar arquivo de backup" hint="Tudo em um arquivo .json" onClick={() => store.account.exportJson()} />
        <Row label="Restaurar de um arquivo" onClick={() => fileRef.current && fileRef.current.click()} />
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={async (e) => {
            const f = e.target.files && e.target.files[0];
            e.target.value = '';
            if (!f) return;
            const r = await store.account.importJson(await f.text());
            setMsg(r.ok ? 'Backup restaurado.' : r.message);
          }}
        />
      </Group>
      {msg && <p className="set-foot">{msg}</p>}
      {linked && list && list.length > 0 && (
        <Group title="Cópias na conta">
          {list.map((b) => (
            <div key={b.id} className="set-row">
              <Icon name="Archive" size={17} className="set-icon" />
              <span className="set-text">
                <span className="set-label">{fmt(b.created_at)}</span>
                <span className="set-hint">{Math.max(1, Math.round((b.size || 0) / 1024))} KB</span>
              </span>
              {confirm === b.id ? (
                <span className="flex items-center gap-1">
                  <button type="button" className="btn-link" onClick={() => setConfirm(null)}>
                    Cancelar
                  </button>
                  <button
                    type="button"
                    className="btn-danger sm"
                    onClick={async () => {
                      setConfirm(null);
                      setMsg('Restaurando…');
                      const ok = await store.account.restoreBackup(b.id);
                      setMsg(ok ? 'Backup restaurado.' : 'Não foi possível restaurar.');
                    }}
                  >
                    Restaurar
                  </button>
                </span>
              ) : (
                <button type="button" className="btn-link" onClick={() => setConfirm(b.id)}>
                  Restaurar
                </button>
              )}
            </div>
          ))}
        </Group>
      )}
      {confirm && <p className="set-foot">Restaurar substitui seus dados atuais pelos dessa cópia em todos os aparelhos.</p>}
    </>
  );
}

/** Página de Ajustes (tela inteira): abas à esquerda no computador, faixa de abas fixa no topo no celular. */
export function SettingsPage({ desktop, store, todayKey, onBack, initial = null, onSignedOut, backRef }) {
  // Celular: lista vertical das seções; tocar numa abre as opções dela (voltar retorna à lista).
  // Computador: a mesma lista fica à esquerda e as opções aparecem ao lado.
  const [page, setPage] = useState(initial || (desktop ? 'account' : null));
  const scrollTop = () => {
    const sc = document.querySelector('.scroll');
    if (sc) sc.scrollTo({ top: 0 });
  };
  const open = (id) => {
    setPage(id);
    scrollTop();
  };
  const s = store.settings;
  const set = store.updateSettings;
  const data = store.data;
  const shown = page || (desktop ? 'account' : null);
  const cat = CATS.find((c) => c.id === shown);

  useEffect(() => {
    if (initial) setPage(initial);
  }, [initial]);

  const list = (
    <div className={desktop ? 'set-tabs is-side' : 'set-group set-menu'} role="list" aria-label="Seções dos ajustes">
      {CATS.map((c) => (
        <button
          key={c.id}
          type="button"
          role="listitem"
          aria-current={desktop && shown === c.id ? 'page' : undefined}
          className={desktop ? `set-tab${shown === c.id ? ' is-on' : ''}` : 'set-row is-link'}
          onClick={() => open(c.id)}
        >
          <Icon name={c.icon} size={18} className={desktop ? undefined : 'set-icon'} />
          {desktop ? (
            <span className="set-tab-label">{c.label}</span>
          ) : (
            <span className="set-text">
              <span className="set-label">{c.label}</span>
              <span className="set-hint">{c.id === 'account' ? `${statusText(store.syncStatus)}${store.user ? ` · ${store.user.email}` : ''}` : c.hint}</span>
            </span>
          )}
          {c.id === 'account' && <span className={`sync-dot is-${store.syncStatus} inline`} aria-hidden="true" />}
          {!desktop && <Icon name="ChevronRight" size={17} className="set-chev" />}
        </button>
      ))}
    </div>
  );

  const options = cat && (
    <motion.section
      key={cat.id}
      className="settings set-main"
      aria-label={cat.label}
      initial={{ opacity: 0, x: desktop ? 0 : 14, y: desktop ? 6 : 0 }}
      animate={{ opacity: 1, x: 0, y: 0 }}
      transition={{ duration: 0.18, ease: EASE_OUT }}
    >
      {desktop && (
        <div className="set-main-head">
          <h2>{cat.label}</h2>
          <p className="set-hint">{cat.hint}</p>
        </div>
      )}
      {cat.id === 'account' && (
        <AccountPanel
          user={store.user}
          recovery={store.recovery}
          name={data.name}
          status={store.syncStatus}
          hasPending={store.account.hasPending()}
          weeklyEmail={!!data.weeklyEmail}
          onRename={store.account.rename}
          onLocalName={store.account.setLocalName}
          onSyncNow={store.account.syncNow}
          onSignOut={async () => {
            await store.account.signOut();
            if (onSignedOut) onSignedOut();
          }}
          onRecoveryDone={() => store.account.clearRecovery()}
          onExport={store.account.exportCsv}
          onWeeklyEmail={store.account.setWeeklyEmail}
          onTestEmail={store.account.testEmail}
        />
      )}
      {cat.id === 'look' && <Look s={s} set={set} />}
      {cat.id === 'nav' && <Nav s={s} set={set} />}
      {cat.id === 'time' && <Time s={s} set={set} todayKey={todayKey} />}
      {cat.id === 'plan' && <Plan s={s} set={set} />}
      {cat.id === 'places' && <Places s={s} set={set} />}
      {cat.id === 'device' && <Device device={store.device} setDevice={store.setDevice} />}
      {cat.id === 'widgets' && <Widgets store={store} todayKey={todayKey} />}
      {cat.id === 'reminders' && <Reminders data={data} />}
      {cat.id === 'backup' && <Backups store={store} />}
    </motion.section>
  );

  // Voltar: da seção para a lista; da lista para o app
  const back = !desktop && page ? () => open(null) : onBack;
  if (backRef) backRef.current = () => (!desktop && page ? (open(null), true) : false);
  const title = !desktop && cat ? cat.label : 'Ajustes';

  return (
    <div className="settings-page">
      <header className="page-header">
        <div className="flex items-center gap-1 min-w-0">
          {back && (
            <button type="button" className="icon-btn ghost lead" onClick={back} aria-label={!desktop && page ? 'Voltar para Ajustes' : 'Voltar'}>
              <Icon name="ChevronLeft" size={22} />
            </button>
          )}
          <h1 className="greet truncate">{title}</h1>
        </div>
      </header>
      {desktop ? (
        <div className="set-layout">
          <nav className="set-side">{list}</nav>
          {options}
        </div>
      ) : (
        cat ? options : list
      )}
    </div>
  );
}

/** Botão de engrenagem do topo (celular), com o ponto do estado da sincronização. */
export function SettingsButton({ status, onClick }) {
  return (
    <button type="button" className="icon-btn ghost settings-btn" onClick={onClick} aria-label={`Ajustes e conta: ${statusText(status)}`}>
      <Icon name="Settings" size={20} />
      <span className={`sync-dot is-${status}`} aria-hidden="true" />
    </button>
  );
}
