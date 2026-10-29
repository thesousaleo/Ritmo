/* Feriados brasileiros (nacionais, móveis e estaduais) e dias úteis. */
import { prefs } from './prefs.js';

const pad = (n) => String(n).padStart(2, '0');
const key = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;
const shift = (y, m, d, n) => {
  const dt = new Date(y, m - 1, d + n);
  return key(dt.getFullYear(), dt.getMonth() + 1, dt.getDate());
};

/** Domingo de Páscoa (algoritmo de Meeus/Jones/Butcher). */
export function easter(y) {
  const a = y % 19;
  const b = Math.floor(y / 100);
  const c = y % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return [month, day];
}

const NATIONAL = [
  [1, 1, 'Confraternização Universal'],
  [4, 21, 'Tiradentes'],
  [5, 1, 'Dia do Trabalho'],
  [9, 7, 'Independência do Brasil'],
  [10, 12, 'Nossa Senhora Aparecida'],
  [11, 2, 'Finados'],
  [11, 15, 'Proclamação da República'],
  [11, 20, 'Dia Nacional de Zumbi e da Consciência Negra'],
  [12, 25, 'Natal'],
];

// Feriados estaduais de data fixa (leis estaduais). Municípios têm os seus: use "Folgas e feriados extras".
export const STATE_HOLIDAYS = {
  AC: [[1, 23, 'Dia do Evangélico'], [6, 15, 'Aniversário do Acre'], [9, 5, 'Dia da Amazônia'], [11, 17, 'Tratado de Petrópolis']],
  AL: [[6, 24, 'São João'], [6, 29, 'São Pedro'], [9, 16, 'Emancipação Política de Alagoas']],
  AM: [[9, 5, 'Elevação do Amazonas à categoria de província']],
  AP: [[3, 19, 'Dia de São José'], [9, 13, 'Criação do Território do Amapá']],
  BA: [[7, 2, 'Independência da Bahia']],
  CE: [[3, 25, 'Data Magna do Ceará']],
  DF: [[11, 30, 'Dia do Evangélico']],
  MA: [[7, 28, 'Adesão do Maranhão à Independência']],
  MS: [[10, 11, 'Criação do Estado']],
  PA: [[8, 15, 'Adesão do Pará à Independência']],
  PB: [[8, 5, 'Fundação do Estado']],
  PE: [[3, 6, 'Revolução Pernambucana']],
  PI: [[10, 19, 'Dia do Piauí']],
  PR: [[12, 19, 'Emancipação Política do Paraná']],
  RJ: [[4, 23, 'Dia de São Jorge']],
  RN: [[10, 3, 'Mártires de Cunhaú e Uruaçu']],
  RO: [[1, 4, 'Criação do Estado'], [6, 18, 'Dia do Evangélico']],
  RR: [[10, 5, 'Criação do Estado']],
  RS: [[9, 20, 'Revolução Farroupilha']],
  SE: [[7, 8, 'Emancipação Política de Sergipe']],
  SP: [[7, 9, 'Revolução Constitucionalista']],
  TO: [[10, 5, 'Criação do Estado'], [9, 8, 'Nossa Senhora da Natividade']],
  ES: [],
  GO: [],
  MG: [],
  MT: [],
  SC: [],
};

export const UF_NAMES = {
  AC: 'Acre', AL: 'Alagoas', AP: 'Amapá', AM: 'Amazonas', BA: 'Bahia', CE: 'Ceará', DF: 'Distrito Federal', ES: 'Espírito Santo',
  GO: 'Goiás', MA: 'Maranhão', MT: 'Mato Grosso', MS: 'Mato Grosso do Sul', MG: 'Minas Gerais', PA: 'Pará', PB: 'Paraíba', PR: 'Paraná',
  PE: 'Pernambuco', PI: 'Piauí', RJ: 'Rio de Janeiro', RN: 'Rio Grande do Norte', RS: 'Rio Grande do Sul', RO: 'Rondônia', RR: 'Roraima',
  SC: 'Santa Catarina', SP: 'São Paulo', SE: 'Sergipe', TO: 'Tocantins',
};

const cache = new Map();

/** Mapa data -> { name, kind: 'nacional' | 'facultativo' | 'estadual' | 'pessoal' } de um ano. */
export function holidaysOf(year) {
  const sig = `${year}|${prefs.uf}|${prefs.optionalHolidays}|${JSON.stringify(prefs.customHolidays)}`;
  if (cache.has(sig)) return cache.get(sig);
  const map = new Map();
  for (const [m, d, name] of NATIONAL) map.set(key(year, m, d), { name, kind: 'nacional' });
  const [em, ed] = easter(year);
  map.set(shift(year, em, ed, -2), { name: 'Sexta-feira Santa', kind: 'nacional' });
  if (prefs.optionalHolidays) {
    map.set(shift(year, em, ed, -48), { name: 'Carnaval', kind: 'facultativo' });
    map.set(shift(year, em, ed, -47), { name: 'Carnaval', kind: 'facultativo' });
    map.set(shift(year, em, ed, 60), { name: 'Corpus Christi', kind: 'facultativo' });
  }
  for (const [m, d, name] of STATE_HOLIDAYS[prefs.uf] || []) if (!map.has(key(year, m, d))) map.set(key(year, m, d), { name, kind: 'estadual' });
  for (const h of prefs.customHolidays || []) if (h.date && h.date.startsWith(String(year))) map.set(h.date, { name: h.name || 'Folga', kind: 'pessoal' });
  if (cache.size > 40) cache.clear();
  cache.set(sig, map);
  return map;
}

export const holidayOn = (k) => holidaysOf(Number(k.slice(0, 4))).get(k) || null;

/** Dia útil: segunda a sexta e não feriado. */
export function isBusinessDay(k) {
  const [y, m, d] = k.split('-').map(Number);
  const wd = new Date(y, m - 1, d).getDay();
  return wd !== 0 && wd !== 6 && !holidayOn(k);
}

/** N-ésimo dia útil do mês (1 = primeiro). */
export function nthBusinessDay(y, m, n) {
  let count = 0;
  const last = new Date(y, m, 0).getDate();
  for (let d = 1; d <= last; d++) {
    const k = key(y, m, d);
    if (isBusinessDay(k) && ++count === n) return k;
  }
  return lastBusinessDay(y, m);
}

export function lastBusinessDay(y, m) {
  for (let d = new Date(y, m, 0).getDate(); d >= 1; d--) {
    const k = key(y, m, d);
    if (isBusinessDay(k)) return k;
  }
  return key(y, m, 1);
}

/** Dia útil anterior a uma data (para lembrar contas antes do vencimento). */
export function previousBusinessDay(k) {
  let [y, m, d] = k.split('-').map(Number);
  for (let i = 0; i < 15; i++) {
    const dt = new Date(y, m - 1, d - 1);
    [y, m, d] = [dt.getFullYear(), dt.getMonth() + 1, dt.getDate()];
    const kk = key(y, m, d);
    if (isBusinessDay(kk)) return kk;
  }
  return k;
}
