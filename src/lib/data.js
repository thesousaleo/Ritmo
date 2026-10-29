/* Estado completo do app (hábitos + tarefas + agenda + foco): normalização, exemplos e armazenamento local. */
import { normalizeData, buildSeed, keyOf, addDays, todayDate, ALL_DAYS } from './habits.js';
import { normalizeTask, normalizeList, normalizeEvent, defaultLists } from './tasks.js';

export function normalizeAll(d) {
  const base = normalizeData(d);
  const lists = Array.isArray(d.lists) && d.lists.length ? d.lists.map(normalizeList) : defaultLists();
  if (!lists.some((l) => l.id === 'inbox')) lists.unshift(defaultLists()[0]);
  return {
    ...base,
    lists,
    tasks: (d.tasks || []).map(normalizeTask),
    events: (d.events || []).map(normalizeEvent),
    focus: d.focus || [],
    settings: d.settings && typeof d.settings === 'object' ? d.settings : {},
  };
}

/** Exemplos de tarefas, eventos e foco, relativos a hoje, para o app nascer utilizável. */
export function plannerSeed(today = todayDate()) {
  const k = (n) => keyOf(addDays(today, n));
  const iso = (n, h, m = 0) => {
    const d = addDays(today, n);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, m).toISOString();
  };
  const nextDow = (dow) => {
    for (let i = 0; i < 7; i++) if (addDays(today, i).getDay() === dow) return k(i);
    return k(0);
  };
  const lists = [
    ...defaultLists(),
    { id: 'compras', name: 'Compras', color: 'rose', icon: 'ShoppingCart', position: 3, sections: [], view: 'list' },
  ];
  const work = lists.find((l) => l.id === 'trabalho');
  work.sections = [
    { id: 's-fazer', name: 'A fazer' },
    { id: 's-andamento', name: 'Em andamento' },
    { id: 's-revisao', name: 'Revisão' },
  ];
  let pos = 0;
  const T = (t) => normalizeTask({ position: pos++, createdAt: iso(-3, 9), ...t });
  const tasks = [
    T({ id: 'ex-proposta', listId: 'trabalho', title: 'Revisar proposta do cliente', date: k(0), time: '10:00', duration: 60, priority: 3, tags: ['cliente'], sectionId: 's-andamento', reminder: 15,
      checklist: [{ id: 'c1', text: 'Conferir valores', done: true }, { id: 'c2', text: 'Ajustar prazos', done: false }, { id: 'c3', text: 'Enviar para aprovação', done: false }] }),
    T({ id: 'ex-emails', listId: 'trabalho', title: 'Responder e-mails pendentes', date: k(0), priority: 2, sectionId: 's-fazer' }),
    T({ id: 'ex-luz', listId: 'pessoal', title: 'Pagar conta de luz', date: k(0), priority: 3, tags: ['contas'], reminder: 0 }),
    T({ id: 'ex-mercado', listId: 'compras', title: 'Lista do mercado', date: k(0), priority: 0,
      checklist: [{ id: 'm1', text: 'Arroz', done: true }, { id: 'm2', text: 'Feijão', done: true }, { id: 'm3', text: 'Café', done: false }, { id: 'm4', text: 'Frutas', done: false }] }),
    T({ id: 'ex-carro', listId: 'pessoal', title: 'Agendar revisão do carro', date: k(-1), priority: 1 }),
    T({ id: 'ex-presente', listId: 'compras', title: 'Comprar presente de aniversário', date: k(1), priority: 2, tags: ['presentes'] }),
    T({ id: 'ex-apresentacao', listId: 'trabalho', title: 'Preparar apresentação de resultados', date: k(2), time: '14:00', duration: 90, priority: 3, tags: ['projeto'], sectionId: 's-fazer',
      notes: 'Mostrar os números do trimestre e o plano para o próximo.' }),
    T({ id: 'ex-relatorio', listId: 'trabalho', title: 'Consolidar relatório mensal', date: k(4), priority: 2, sectionId: 's-revisao', tags: ['projeto'] }),
    T({ id: 'ex-livro', listId: 'pessoal', title: 'Ler capítulo 5', date: k(3), priority: 0 }),
    T({ id: 'ex-backup', listId: 'pessoal', title: 'Backup do notebook', date: nextDow(6), repeat: 'weekly', priority: 1 }),
    T({ id: 'ex-gastos', listId: 'pessoal', title: 'Atualizar planilha de gastos', date: k(6), repeat: 'monthly', priority: 2, tags: ['contas'] }),
    T({ id: 'ex-ideias', listId: 'inbox', title: 'Organizar ideias do projeto pessoal', priority: 0 }),
    T({ id: 'ex-encanador', listId: 'inbox', title: 'Ligar para o encanador', priority: 2 }),
    T({ id: 'ex-semanal', listId: 'trabalho', title: 'Enviar relatório semanal', date: k(-1), priority: 2, done: true, completedAt: iso(-1, 17, 20), sectionId: 's-revisao' }),
    T({ id: 'ex-assinatura', listId: 'pessoal', title: 'Renovar assinatura do streaming', date: k(0), priority: 0, done: true, completedAt: iso(0, 8, 40) }),
  ];
  const E = (e) => normalizeEvent(e);
  const events = [
    E({ id: 'ex-equipe', title: 'Reunião de equipe', date: k(-21), endDate: k(-21), start: '09:30', end: '10:15', allDay: false, color: 'cobalt', repeat: 'weekly:1,3', reminder: 10 }),
    E({ id: 'ex-ingles', title: 'Aula de inglês', date: k(-14), endDate: k(-14), start: '19:00', end: '20:00', allDay: false, color: 'violet', repeat: 'weekly:2,4' }),
    E({ id: 'ex-cafe', title: 'Café com fornecedor', date: k(0), endDate: k(0), start: '15:00', end: '15:45', allDay: false, color: 'amber', location: 'Padaria da esquina' }),
    E({ id: 'ex-dentista', title: 'Dentista', date: k(2), endDate: k(2), start: '16:00', end: '17:00', allDay: false, color: 'rose', location: 'Clínica Sorriso', reminder: 60 }),
    E({ id: 'ex-familia', title: 'Almoço em família', date: nextDow(0) === k(0) ? k(7) : nextDow(0), start: '12:30', end: '14:30', allDay: false, color: 'mint' }),
    E({ id: 'ex-praia', title: 'Viagem para a praia', date: k(8), endDate: k(10), allDay: true, color: 'sky' }),
  ].map((e) => ({ ...e, endDate: e.endDate || e.date }));

  const focus = [];
  const plan = [3, 5, 2, 4, 6, 3, 2];
  const taskIds = ['ex-proposta', 'ex-apresentacao', 'ex-relatorio', 'ex-livro'];
  plan.forEach((n, i) => {
    const day = -(plan.length - 1 - i) - 1;
    for (let j = 0; j < n; j++) {
      focus.push({ id: `ex-f${i}-${j}`, startedAt: iso(day, 9 + j, j % 2 ? 30 : 0), minutes: 25, kind: 'pomo', taskId: taskIds[(i + j) % taskIds.length], habitId: null });
    }
  });
  focus.push({ id: 'ex-f-hoje', startedAt: iso(0, 8, 0), minutes: 25, kind: 'pomo', taskId: 'ex-proposta', habitId: null });
  return { lists, tasks, events, focus };
}

export function buildFullSeed(today = todayDate()) {
  return normalizeAll({ ...buildSeed(today), ...plannerSeed(today), settings: {} });
}

/* ---------- persistência local ---------- */
const STORAGE_KEY = 'ritmo.v2';
const LEGACY_KEY = 'ritmo.v1';

export function loadLocal() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY) || localStorage.getItem(LEGACY_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.habits) && parsed.log) return normalizeAll(parsed);
    }
  } catch (e) {
    /* storage indisponível */
  }
  return buildFullSeed();
}

export function saveLocal(data) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (e) {
    /* modo privado ou storage cheio */
  }
}

export { ALL_DAYS };
