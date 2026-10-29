/*
 * Ajustes do Ritmo. Ficam no perfil (settings) e sincronizam entre aparelhos,
 * exceto os de "deviceSettings", que são só deste aparelho (bloqueio, ícone, sons).
 */
import { setPrefs } from './prefs.js';

export const DEFAULT_SETTINGS = {
  theme: 'auto', // auto | light | dark | black | hour
  accent: '', // '' = cor padrão; id de COLORS ou hex
  density: 'comfy', // comfy | compact
  textSize: 1, // 0.9 | 1 | 1.1 | 1.2
  modules: ['tasks', 'calendar', 'matrix', 'focus', 'habits', 'stats'], // ordem; ausentes ficam ocultos
  startModule: 'tasks',
  weekStart: 0,
  clock24: true,
  uf: '',
  optionalHolidays: true,
  customHolidays: [],
  showHolidays: true,
  workStart: '09:00',
  workEnd: '18:00',
  dailyCapacity: 360, // minutos de tarefas por dia antes de avisar sobrecarga
  rituals: true, // planejar o dia / encerrar o dia / revisão semanal
  filters: [],
  templates: [],
  places: [], // [{ id, name, lat, lng, radius }]
  calendarHabits: false, // hábitos com horário aparecem na agenda
  calendarGaps: true, // mostra horários livres na agenda
};

export const ALL_MODULES = ['tasks', 'calendar', 'matrix', 'focus', 'habits', 'stats'];

export const settingsOf = (data) => {
  const s = { ...DEFAULT_SETTINGS, ...((data && data.settings) || {}) };
  const mods = (s.modules || []).filter((m) => ALL_MODULES.includes(m));
  s.modules = mods.length ? mods : DEFAULT_SETTINGS.modules;
  if (!s.modules.includes(s.startModule)) s.startModule = s.modules[0];
  return s;
};

/** Repassa para as bibliotecas o que muda cálculos (semana, relógio, feriados). */
export function applyPrefs(settings) {
  setPrefs({
    weekStart: settings.weekStart === 1 ? 1 : 0,
    clock24: settings.clock24 !== false,
    uf: settings.uf || '',
    optionalHolidays: settings.optionalHolidays !== false,
    customHolidays: Array.isArray(settings.customHolidays) ? settings.customHolidays : [],
  });
}

/* ---------- ajustes deste aparelho ---------- */
const DEVICE_KEY = 'ritmo.device.v1';
export const DEFAULT_DEVICE = {
  lock: false, // pedir digital/rosto ao abrir (APK)
  sounds: true, // sons ao concluir
  haptics: true,
  appIcon: 'default',
  lastBackup: null,
  autoBackup: true,
  ambient: 'off', // som ambiente do foco
  ambientVolume: 0.5,
};
export function loadDevice() {
  try {
    return { ...DEFAULT_DEVICE, ...(JSON.parse(localStorage.getItem(DEVICE_KEY)) || {}) };
  } catch (e) {
    return { ...DEFAULT_DEVICE };
  }
}
export function saveDevice(d) {
  try {
    localStorage.setItem(DEVICE_KEY, JSON.stringify(d));
  } catch (e) {
    /* sem storage */
  }
}

/* ---------- tema ---------- */
/** Tema efetivo agora: "hour" escurece das 19h às 7h. */
export function resolveTheme(theme, now = new Date(), prefersDark = false) {
  if (theme === 'light' || theme === 'dark' || theme === 'black') return theme;
  if (theme === 'hour') {
    const h = now.getHours();
    return h >= 19 || h < 7 ? 'dark' : 'light';
  }
  return prefersDark ? 'dark' : 'light';
}

export const isHex = (v) => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v);

/** Converte uma cor hex em texto legível por cima (preto ou branco). */
export function onColor(hex) {
  if (!isHex(hex)) return '#fff';
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return lum > 0.62 ? '#14161a' : '#fff';
}

/* ---------- modelos ---------- */
export const BUILTIN_TEMPLATES = [
  {
    id: 'tpl-viagem',
    name: 'Viagem',
    icon: 'Plane',
    builtin: true,
    tasks: [
      { title: 'Conferir documentos e passaporte', offset: -14 },
      { title: 'Reservar transporte até o aeroporto', offset: -3 },
      { title: 'Fazer as malas', offset: -1, checklist: ['Roupas', 'Carregadores', 'Remédios', 'Itens de higiene'] },
      { title: 'Check-in online', offset: -1 },
    ],
  },
  {
    id: 'tpl-mudanca',
    name: 'Mudança',
    icon: 'House',
    builtin: true,
    tasks: [
      { title: 'Orçar empresas de mudança', offset: -30 },
      { title: 'Transferir contas de luz, água e internet', offset: -10 },
      { title: 'Atualizar endereço nos cadastros', offset: 0 },
      { title: 'Separar caixas por cômodo', offset: -7 },
    ],
  },
  {
    id: 'tpl-semana',
    name: 'Revisão semanal',
    icon: 'CalendarCheck',
    builtin: true,
    tasks: [
      { title: 'Esvaziar a Entrada', offset: 0 },
      { title: 'Revisar a agenda da próxima semana', offset: 0 },
      { title: 'Escolher as 3 prioridades da semana', offset: 0 },
    ],
  },
  {
    id: 'tpl-projeto',
    name: 'Novo projeto',
    icon: 'Rocket',
    builtin: true,
    tasks: [
      { title: 'Definir objetivo e prazo', offset: 0 },
      { title: 'Listar as entregas', offset: 1 },
      { title: 'Marcar reunião de início', offset: 2 },
      { title: 'Revisão do andamento', offset: 7 },
    ],
  },
];
