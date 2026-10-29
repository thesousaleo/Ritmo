/*
 * Preferências que afetam cálculos em vários módulos (semana, relógio, feriados).
 * O App chama setPrefs() sempre que os ajustes mudam; as bibliotecas leem daqui.
 */
const state = {
  weekStart: 0, // 0 = domingo, 1 = segunda
  clock24: true,
  uf: '', // estado para feriados estaduais
  optionalHolidays: true, // carnaval e Corpus Christi contam como folga
  customHolidays: [], // [{ date: 'YYYY-MM-DD', name }]
};

export function setPrefs(patch) {
  Object.assign(state, patch);
}
export const prefs = state;

/** "14:30" ou "2:30 PM" conforme o ajuste de relógio. */
export function fmtTime(hhmm) {
  if (!hhmm) return '';
  if (state.clock24) return hhmm;
  const [h, m] = hhmm.split(':').map(Number);
  const suffix = h < 12 ? 'AM' : 'PM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${suffix}`;
}

/** Índices dos dias da semana na ordem de exibição (domingo ou segunda primeiro). */
export const weekOrder = () => (state.weekStart === 1 ? [1, 2, 3, 4, 5, 6, 0] : [0, 1, 2, 3, 4, 5, 6]);
