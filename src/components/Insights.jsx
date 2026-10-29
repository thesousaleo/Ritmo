/* Jardim dos hábitos, insights e retrospectiva compartilhável. */
import React, { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Icon, SPRING } from './ui.jsx';
import { colorOf, keyOf, moodInsights } from '../lib/habits.js';
import { gardenOf, productiveHours, procrastinationRadar, estimateAccuracy, habitTaskCorrelation, retrospective } from '../lib/insights.js';
import { fmtMinutes } from '../lib/focus.js';
import { isNative } from '../lib/native.js';

/* ---------- jardim ---------- */
const STAGE_LABEL = ['Semente', 'Broto', 'Muda', 'Planta', 'Florida'];

function Plant({ stage, color, wilted }) {
  const leaf = wilted ? '#9AA38F' : '#3E9B5F';
  const stemH = [0, 14, 26, 38, 46][stage];
  const top = 76 - stemH;
  return (
    <svg viewBox="0 0 80 100" className={`plant${wilted ? ' is-wilted' : ''}`} aria-hidden="true">
      <motion.g initial={{ scaleY: 0.6, opacity: 0 }} animate={{ scaleY: 1, opacity: 1 }} transition={SPRING.progress} style={{ transformOrigin: '40px 78px' }}>
        {stage === 0 && <ellipse cx="40" cy="74" rx="5" ry="3.5" fill="#8A6A45" />}
        {stage >= 1 && <path d={`M40 78 Q${wilted ? 46 : 40} ${78 - stemH / 2} ${wilted ? 50 : 40} ${top}`} stroke={leaf} strokeWidth="3" fill="none" strokeLinecap="round" />}
        {stage >= 1 && <path d={`M40 ${78 - stemH * 0.35} q-10 -4 -13 -12 q10 0 13 9`} fill={leaf} />}
        {stage >= 2 && <path d={`M40 ${78 - stemH * 0.55} q10 -4 13 -12 q-10 0 -13 9`} fill={leaf} />}
        {stage >= 3 && <path d={`M40 ${78 - stemH * 0.78} q-9 -3 -12 -10 q9 0 12 8`} fill={leaf} />}
        {stage >= 4 && (
          <g transform={`translate(${wilted ? 50 : 40} ${top})`}>
            {[0, 72, 144, 216, 288].map((a) => (
              <ellipse key={a} cx="0" cy="-6" rx="4.2" ry="6.5" fill={wilted ? '#C9C2B4' : color} transform={`rotate(${a})`} />
            ))}
            <circle r="3.6" fill="#F2C14E" />
          </g>
        )}
        {stage === 3 && <circle cx={wilted ? 50 : 40} cy={top} r="4" fill={wilted ? '#C9C2B4' : color} opacity="0.85" />}
      </motion.g>
      <path d="M24 78 h32 l-4 18 h-24 z" fill="color-mix(in oklab, var(--muted) 35%, var(--surface-2))" />
      <rect x="22" y="75" width="36" height="6" rx="2" fill="color-mix(in oklab, var(--muted) 45%, var(--surface-2))" />
    </svg>
  );
}

export function Garden({ data, today, onOpen }) {
  const plants = gardenOf(data, today);
  if (!plants.length) return <p className="field-hint">Crie um hábito para plantar a primeira semente.</p>;
  const blooming = plants.filter((p) => p.stage === 4).length;
  return (
    <section className="panel" aria-labelledby="garden-title">
      <div className="panel-head">
        <h2 id="garden-title">Seu jardim</h2>
        <span className="section-count">{blooming ? `${blooming} florida${blooming > 1 ? 's' : ''}` : 'cresce com a constância'}</span>
      </div>
      <div className="garden">
        {plants.map((p) => (
          <button key={p.h.id} type="button" className="garden-item" onClick={() => onOpen(p.h)} title={`${p.h.name}: ${STAGE_LABEL[p.stage]}${p.wilted ? ', precisa de cuidado' : ''}`}>
            <Plant stage={p.stage} color={colorOf(p.h.color).value} wilted={p.wilted} />
            <span className="garden-name">{p.h.name}</span>
            <span className="garden-stage">{p.wilted ? 'Precisa de água' : STAGE_LABEL[p.stage]}</span>
          </button>
        ))}
      </div>
      <p className="field-hint">Cada sequência faz a planta crescer; 30 dias seguidos e ela floresce. Se a constância cair muito, ela murcha, mas volta com alguns dias de cuidado.</p>
    </section>
  );
}

/* ---------- insights ---------- */
const hourLabel = (h) => `${String(h).padStart(2, '0')}h`;

export function InsightsPanel({ data, today, onOpenTask }) {
  const todayKey = keyOf(today);
  const hours = useMemo(() => productiveHours(data, today), [data, today]);
  const radar = procrastinationRadar(data, todayKey);
  const acc = estimateAccuracy(data);
  const corr = habitTaskCorrelation(data, today);
  const mood = moodInsights(data, today).slice(0, 2);
  const max = Math.max(1, ...hours.score);
  const any = hours.window || radar.length || acc.ratio || corr.length || mood.length;
  return (
    <div className="flex flex-col gap-4">
      {!any && <p className="field-hint">Use o app por alguns dias: os padrões aparecem aqui conforme você conclui tarefas, faz foco e marca hábitos.</p>}
      {hours.window && (
        <section className="panel" aria-labelledby="ins-hours">
          <div className="panel-head">
            <h2 id="ins-hours">Seu melhor horário</h2>
            <span className="section-count">
              {hourLabel(hours.window[0])}–{hourLabel(hours.window[1])}
            </span>
          </div>
          <div className="hours-chart" aria-label="Atividade por hora do dia">
            {hours.score.map((v, h) => (
              <span key={h} className={`hours-bar${h >= hours.window[0] && h < hours.window[1] ? ' is-best' : ''}`} style={{ height: `${Math.max(4, (v / max) * 100)}%` }} title={`${hourLabel(h)}: ${Math.round(v)}`} />
            ))}
          </div>
          <div className="hours-axis" aria-hidden="true">
            <span>0h</span>
            <span>6h</span>
            <span>12h</span>
            <span>18h</span>
            <span>23h</span>
          </div>
          <p className="field-hint">É quando você mais conclui tarefas e faz foco. Reserve esse horário para o que é pesado.</p>
        </section>
      )}
      {radar.length > 0 && (
        <section className="panel" aria-labelledby="ins-radar">
          <div className="panel-head">
            <h2 id="ins-radar">Radar de adiamentos</h2>
          </div>
          <ul className="plan-list is-quiet">
            {radar.map(({ t, postponed, late }) => (
              <li key={t.id}>
                <button type="button" className="truncate flex-1 text-left" onClick={() => onOpenTask(t.id)}>
                  {t.title}
                </button>
                <span className="field-hint">{postponed >= 3 ? `adiada ${postponed}×` : `${late} dias atrasada`}</span>
              </li>
            ))}
          </ul>
          <p className="field-hint">Quando algo é adiado muitas vezes, quase sempre está grande demais ou não é mais importante.</p>
        </section>
      )}
      {acc.ratio && (
        <section className="panel" aria-labelledby="ins-acc">
          <div className="panel-head">
            <h2 id="ins-acc">Estimado × real</h2>
            <span className="section-count">{acc.pairs.length} tarefas</span>
          </div>
          <p className="mid-num sm">
            {acc.ratio >= 1 ? `${acc.ratio.toFixed(1).replace('.', ',')}×` : `${Math.round(acc.ratio * 100)}%`}
            <span className="mid-unit">{acc.ratio >= 1.1 ? 'do tempo que você estima' : acc.ratio <= 0.9 ? 'do tempo estimado' : 'na mosca'}</span>
          </p>
          <p className="field-hint">
            {acc.ratio >= 1.1
              ? `Suas tarefas levam mais do que você imagina. Experimente estimar ${Math.round((acc.ratio - 1) * 100)}% a mais.`
              : acc.ratio <= 0.9
                ? 'Você termina antes do previsto: dá para planejar mais coisas no dia.'
                : 'Suas estimativas estão ótimas.'}
          </p>
        </section>
      )}
      {(corr.length > 0 || mood.length > 0) && (
        <section className="panel" aria-labelledby="ins-corr">
          <div className="panel-head">
            <h2 id="ins-corr">O que anda junto</h2>
          </div>
          <ul className="insight-list">
            {corr.map((c) => (
              <li key={`c-${c.h.id}`}>
                <Icon name={c.h.icon} size={16} style={{ color: colorOf(c.h.color).value }} />
                <span>
                  Nos dias com <b>{c.h.name}</b> você conclui {c.ratio.toFixed(1).replace('.', ',')}× mais tarefas.
                </span>
              </li>
            ))}
            {mood.map((m) => (
              <li key={`m-${m.h.id}`}>
                <Icon name={m.h.icon} size={16} style={{ color: colorOf(m.h.color).value }} />
                <span>
                  {m.diff > 0 ? 'Seu humor costuma ser melhor' : 'Seu humor costuma ser pior'} nos dias com <b>{m.h.name}</b>.
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
      <RetroCard data={data} today={today} />
    </div>
  );
}

/* ---------- retrospectiva (imagem para compartilhar) ---------- */
function drawRetro(r, name, year) {
  const W = 1080;
  const H = 1350;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, W, H);
  grad.addColorStop(0, '#131A16');
  grad.addColorStop(1, '#1E2B49');
  g.fillStyle = grad;
  g.fillRect(0, 0, W, H);
  const colors = ['#2A9FD6', '#1FAA78', '#E39A2A', '#E0507F', '#8A6BEF'];
  colors.forEach((col, i) => {
    g.strokeStyle = col;
    g.lineWidth = 34;
    g.lineCap = 'round';
    g.beginPath();
    const a0 = ((i * 72 + 9 - 90) * Math.PI) / 180;
    const a1 = ((i * 72 + 63 - 90) * Math.PI) / 180;
    g.arc(W - 190, 210, 92, a0, a1);
    g.stroke();
  });
  g.fillStyle = '#F2F5F1';
  g.font = '700 64px system-ui, sans-serif';
  g.fillText(`Meu ${year}`, 90, 200);
  g.font = '500 36px system-ui, sans-serif';
  g.fillStyle = '#97A29B';
  g.fillText(name ? `${name} no Ritmo` : 'no Ritmo', 90, 256);
  const rows = [
    [String(r.done), 'tarefas concluídas'],
    [fmtMinutes(r.focusMin), 'de foco'],
    [String(r.checkins), 'hábitos marcados'],
    [String(r.activeDays), 'dias ativos'],
  ];
  rows.forEach(([v, label], i) => {
    const y = 470 + i * 200;
    g.fillStyle = '#F2F5F1';
    g.font = '800 120px system-ui, sans-serif';
    g.fillText(v, 90, y);
    g.fillStyle = '#97A29B';
    g.font = '500 40px system-ui, sans-serif';
    g.fillText(label, 90, y + 56);
  });
  if (r.best && r.best.s > 0) {
    g.fillStyle = '#F2F5F1';
    g.font = '600 40px system-ui, sans-serif';
    g.fillText(`Maior sequência atual: ${r.best.h.name}, ${r.best.s}`, 90, H - 110);
  }
  return c;
}

function RetroCard({ data, today }) {
  const [msg, setMsg] = useState('');
  const r = retrospective(data, today);
  const share = async () => {
    try {
      const canvas = drawRetro(r, data.name, today.getFullYear());
      const blob = await new Promise((res) => canvas.toBlob(res, 'image/png'));
      const file = new File([blob], `ritmo-${today.getFullYear()}.png`, { type: 'image/png' });
      if (!isNative && navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: 'Meu ano no Ritmo' });
        return;
      }
      if (isNative) {
        const { Filesystem, Directory } = await import('@capacitor/filesystem');
        const { Share } = await import('@capacitor/share');
        const dataUrl = canvas.toDataURL('image/png');
        const res = await Filesystem.writeFile({ path: file.name, data: dataUrl.split(',')[1], directory: Directory.Cache });
        await Share.share({ title: 'Meu ano no Ritmo', url: res.uri });
        return;
      }
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = file.name;
      a.click();
      setMsg('Imagem baixada.');
    } catch (e) {
      if (e && e.name !== 'AbortError') setMsg('Não foi possível gerar a imagem.');
    }
  };
  return (
    <section className="panel retro" aria-labelledby="ins-retro">
      <div className="panel-head">
        <h2 id="ins-retro">Retrospectiva de {today.getFullYear()}</h2>
      </div>
      <div className="retro-grid">
        <div>
          <span className="mid-num sm">{r.done}</span>
          <span className="field-hint">tarefas</span>
        </div>
        <div>
          <span className="mid-num sm">{fmtMinutes(r.focusMin)}</span>
          <span className="field-hint">de foco</span>
        </div>
        <div>
          <span className="mid-num sm">{r.checkins}</span>
          <span className="field-hint">hábitos</span>
        </div>
        <div>
          <span className="mid-num sm">{r.activeDays}</span>
          <span className="field-hint">dias ativos</span>
        </div>
      </div>
      <button type="button" className="btn-secondary sm self-start" onClick={share}>
        <Icon name="Share2" size={15} /> Compartilhar imagem
      </button>
      {msg && <p className="field-hint">{msg}</p>}
    </section>
  );
}
