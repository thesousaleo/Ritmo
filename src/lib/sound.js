/*
 * Sons gerados na hora com Web Audio (nenhum arquivo para baixar):
 * toques curtos ao concluir e sons ambientes para o foco (chuva, ruído marrom, ondas, lareira).
 */
let ctx = null;
const audio = () => {
  if (typeof window === 'undefined') return null;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  if (!ctx) ctx = new AC();
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
};

/** Toque curto: 'done' (tarefa/hábito), 'soft' (versão mínima), 'focus' (fim do foco). */
export function playChime(kind = 'done') {
  const ac = audio();
  if (!ac) return;
  const notes = kind === 'focus' ? [659.25, 783.99, 1046.5] : kind === 'soft' ? [523.25] : [783.99, 1174.66];
  const t0 = ac.currentTime + 0.01;
  notes.forEach((f, i) => {
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.type = 'sine';
    o.frequency.value = f;
    const t = t0 + i * 0.09;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(kind === 'soft' ? 0.05 : 0.08, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + (kind === 'focus' ? 0.9 : 0.42));
    o.connect(g).connect(ac.destination);
    o.start(t);
    o.stop(t + 1);
  });
}

export const AMBIENTS = [
  { id: 'off', label: 'Silêncio', icon: 'VolumeX' },
  { id: 'rain', label: 'Chuva', icon: 'CloudRain' },
  { id: 'brown', label: 'Ruído marrom', icon: 'Waves' },
  { id: 'waves', label: 'Mar', icon: 'Wind' },
  { id: 'fire', label: 'Lareira', icon: 'Flame' },
];

function noiseBuffer(ac, type) {
  const len = ac.sampleRate * 4;
  const buf = ac.createBuffer(2, len, ac.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      if (type === 'brown') {
        last = (last + 0.02 * w) / 1.02;
        d[i] = last * 3.5;
      } else d[i] = w;
    }
  }
  return buf;
}

let current = null;

/** Liga (ou troca) o som ambiente. volume de 0 a 1. */
export function startAmbient(id, volume = 0.5) {
  stopAmbient();
  if (!id || id === 'off') return;
  const ac = audio();
  if (!ac) return;
  const master = ac.createGain();
  master.gain.value = 0;
  master.gain.linearRampToValueAtTime(volume * 0.6, ac.currentTime + 1.2);
  master.connect(ac.destination);
  const nodes = [master];
  const src = ac.createBufferSource();
  src.buffer = noiseBuffer(ac, id === 'brown' || id === 'waves' ? 'brown' : 'white');
  src.loop = true;
  nodes.push(src);
  let last = src;
  if (id === 'rain') {
    const hp = ac.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 900;
    const lp = ac.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 7000;
    const g = ac.createGain();
    g.gain.value = 0.35;
    last.connect(hp).connect(lp).connect(g);
    last = g;
    nodes.push(hp, lp, g);
  } else if (id === 'waves') {
    const lp = ac.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 600;
    const g = ac.createGain();
    g.gain.value = 0.5;
    // Ondas: o volume sobe e desce devagar
    const lfo = ac.createOscillator();
    lfo.frequency.value = 0.09;
    const depth = ac.createGain();
    depth.gain.value = 0.45;
    lfo.connect(depth).connect(g.gain);
    lfo.start();
    last.connect(lp).connect(g);
    last = g;
    nodes.push(lp, g, lfo, depth);
  } else if (id === 'fire') {
    const lp = ac.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 500;
    const g = ac.createGain();
    g.gain.value = 0.5;
    last.connect(lp).connect(g);
    last = g;
    nodes.push(lp, g);
    // Estalos da lenha
    const crackle = ac.createBufferSource();
    const len = ac.sampleRate * 3;
    const buf = ac.createBuffer(1, len, ac.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) if (Math.random() < 0.00035) for (let j = 0; j < 60 && i + j < len; j++) d[i + j] = (Math.random() * 2 - 1) * Math.exp(-j / 9);
    crackle.buffer = buf;
    crackle.loop = true;
    const cg = ac.createGain();
    cg.gain.value = 0.5;
    crackle.connect(cg).connect(master);
    crackle.start();
    nodes.push(crackle, cg);
  }
  last.connect(master);
  src.start();
  current = { nodes, master, ac };
}

export function setAmbientVolume(volume) {
  if (current) current.master.gain.linearRampToValueAtTime(volume * 0.6, current.ac.currentTime + 0.2);
}

export function stopAmbient() {
  if (!current) return;
  const { nodes, master, ac } = current;
  current = null;
  try {
    master.gain.cancelScheduledValues(ac.currentTime);
    master.gain.setValueAtTime(master.gain.value, ac.currentTime);
    master.gain.linearRampToValueAtTime(0, ac.currentTime + 0.4);
  } catch (e) {
    /* contexto fechado */
  }
  setTimeout(() => {
    for (const n of nodes) {
      try {
        if (n.stop) n.stop();
        n.disconnect();
      } catch (e) {
        /* já parado */
      }
    }
  }, 500);
}

export const ambientPlaying = () => !!current;
