/*
 * Teste de ponta a ponta no navegador (roda no GitHub Actions).
 * Abre o app em tamanho de celular e de computador, faz os fluxos principais,
 * confere o que foi gravado e salva capturas em shots/. Falha se houver erro no console.
 */
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';

const URL = process.env.APP_URL || 'http://localhost:4173/';
const OUT = 'shots';
mkdirSync(OUT, { recursive: true });

const problems = [];
const checks = [];
const ok = (name, cond, detail = '') => {
  checks.push({ name, ok: !!cond, detail });
  if (!cond) problems.push(`Falhou: ${name} ${detail}`);
};

const browser = await chromium.launch();
let step = '';
let curPage = null;

async function session(name, opts) {
  curPage = null;
  const ctx = await browser.newContext({ locale: 'pt-BR', timezoneId: 'America/Sao_Paulo', ...opts });
  const page = await ctx.newPage();
  page.on('console', (m) => {
    if (m.type() === 'error' && !/fonts\.g|favicon|supabase|Failed to load resource/i.test(m.text())) problems.push(`[${name}] console: ${m.text().slice(0, 300)}`);
  });
  page.on('pageerror', (e) => problems.push(`[${name}] erro: ${String(e.message || e).slice(0, 300)}`));
  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.waitForSelector('.page', { timeout: 15000 });
  curPage = page;
  return { ctx, page };
}

const shot = async (page, file) => {
  await page.waitForTimeout(450);
  await page.screenshot({ path: `${OUT}/${file}.png` });
};
const store = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('ritmo.v2') || '{}'));
const center = async (loc) => {
  const b = await loc.boundingBox();
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
};
async function mouseDrag(page, from, to) {
  const a = await center(from);
  const b = typeof to.x === 'number' ? to : await center(to);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  for (let i = 1; i <= 16; i++) await page.mouse.move(a.x + ((b.x - a.x) * i) / 16, a.y + ((b.y - a.y) * i) / 16);
  await page.waitForTimeout(120);
  await page.mouse.up();
  await page.waitForTimeout(350);
}

/* ------------------------------------------------------------------ */
/* Celular                                                             */
/* ------------------------------------------------------------------ */
try {
  var { ctx, page } = await session('celular', { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await shot(page, '01-celular-hoje');

  // Entrada rápida pelo botão flutuante
  step = 'Entrada rápida pelo botão flutuante';
  await page.click('button.fab.is-float');
  await page.waitForSelector('.qa-input');
  await page.fill('.qa-input', 'Comprar café amanhã 9h #casa !1');
  await shot(page, '02-celular-entrada-rapida');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(300);
  const d1 = await store(page);
  const cafe = (d1.tasks || []).find((t) => t.title === 'Comprar café');
  ok('entrada rápida cria tarefa com data, hora, prioridade e etiqueta', cafe && cafe.time === '09:00' && cafe.priority === 3 && (cafe.tags || []).includes('casa') && !!cafe.date, JSON.stringify(cafe));
  // Entrada rápida: quinto dia útil + valor
  step = 'Entrada rápida: quinto dia útil + valor';
  await page.fill('.qa-input', 'Pagar aluguel todo quinto dia útil R$ 1.200');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(300);
  const dq = await store(page);
  const alug = (dq.tasks || []).find((t) => t.title === 'Pagar aluguel');
  ok('entrada rápida entende “todo quinto dia útil” e valor', alug && alug.repeat === 'monthly:biz5' && alug.amount === 1200, JSON.stringify(alug && { r: alug.repeat, a: alug.amount }));
  // Colar várias linhas cria várias tarefas
  step = 'Colar várias linhas cria várias tarefas';
  await page.evaluate(() => {
    const el = document.querySelector('.qa-input');
    const dt = new DataTransfer();
    dt.setData('text/plain', '- Comprar pão\n- Ligar para a escola\n- Levar o carro');
    el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
  });
  await page.waitForTimeout(500);
  const dp = await store(page);
  ok('colar várias linhas cria uma tarefa por linha', ['Comprar pão', 'Ligar para a escola', 'Levar o carro'].every((t) => (dp.tasks || []).some((x) => x.title === t)));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);

  // Planejar o dia (menu de Hoje)
  step = 'Planejar o dia (menu de Hoje)';
  await page.click('button[aria-label="Planejar"]');
  await page.waitForTimeout(300);
  await shot(page, '40-celular-menu-planejar');
  await page.click('.menu-item:has-text("Planejar o dia")');
  await page.waitForSelector('.ritual');
  await shot(page, '41-celular-planejar-dia');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);

  // Gaveta de listas
  step = 'Gaveta de listas';
  await page.click('button[aria-label="Listas"]');
  await page.waitForSelector('.drawer');
  await shot(page, '03-celular-gaveta-listas');
  await page.click('.drawer .lp-item:has-text("Amanhã")');
  await page.waitForTimeout(400);
  ok('tarefa nova aparece em Amanhã', await page.locator('.trow:has-text("Comprar café")').count());
  await shot(page, '04-celular-amanha');

  // Detalhe da tarefa
  step = 'Detalhe da tarefa';
  await page.click('.trow:has-text("Comprar café") .trow-main');
  await page.waitForSelector('.sheet.is-task');
  await shot(page, '05-celular-detalhe');
  await page.click('.td-bar .tcheck');
  await page.waitForTimeout(400);
  const d2 = await store(page);
  ok('concluir pelo detalhe grava done', (d2.tasks || []).some((t) => t.title === 'Comprar café' && t.done));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);

  // Concluir na lista (check aparece antes de mudar de grupo)
  step = 'Concluir na lista (check aparece antes de mudar de grupo)';
  await page.click('button[aria-label="Listas"]');
  await page.click('.drawer .lp-item:has-text("Hoje")');
  await page.waitForTimeout(400);
  const firstRow = page.locator('.tgroup:not(.is-danger) .trow').first();
  const firstTitle = (await firstRow.locator('.trow-title-text').textContent()) || '';
  await firstRow.locator('.tcheck').click();
  await page.waitForTimeout(700);
  const d3 = await store(page);
  ok('concluir na lista grava done', (d3.tasks || []).some((t) => t.title === firstTitle.trim() && t.done), firstTitle);
  await shot(page, '06-celular-hoje-concluida');

  // Lista no celular: título não pode ficar sob os controles de exibição
  step = 'Lista no celular: título não pode ficar sob os controles de exibição';
  await page.click('button[aria-label="Listas"]');
  await page.click('.drawer .lp-item:has-text("Trabalho")');
  await page.waitForSelector('.list-bar');
  await page.waitForTimeout(400);
  const tBox = await page.locator('.tasks-title-text').boundingBox();
  const cBox = await page.locator('.list-controls').boundingBox();
  const hBox = await page.locator('.page-header > .flex-none').boundingBox();
  const overlap = (a, b) => a && b && a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
  ok('título da lista não fica sob os controles (celular)', tBox && cBox && !overlap(tBox, cBox) && !overlap(tBox, hBox), JSON.stringify({ tBox, cBox, hBox }));
  ok('título da lista aparece inteiro (celular)', await page.evaluate(() => { const el = document.querySelector('.tasks-title-text'); return el && el.scrollWidth <= el.clientWidth + 1; }));
  await shot(page, '16-celular-lista');
  await page.click('.list-controls button[aria-label="Kanban"]');
  await page.waitForSelector('.kanban');
  await shot(page, '17-celular-kanban');
  await page.click('.list-controls button[aria-label="Lista"]');

  // Agenda
  step = 'Agenda';
  await page.click('nav.tabbar button:has-text("Agenda")');
  await page.waitForSelector('.cal');
  await shot(page, '07-celular-agenda-mes');
  await page.click('button[role="radio"]:has-text("3 dias")');
  await page.waitForSelector('.tg');
  await shot(page, '08-celular-agenda-3dias');
  await page.click('button[role="radio"]:has-text("Lista")');
  await shot(page, '09-celular-agenda-lista');
  await page.click('button[role="radio"]:has-text("Ano")');
  await page.waitForSelector('.year');
  ok('visão do ano mostra 12 meses', (await page.locator('.ymonth').count()) === 12);
  await shot(page, '42-celular-agenda-ano');

  // Matriz
  step = 'Matriz';
  await page.click('nav.tabbar button:has-text("Matriz")');
  await page.waitForSelector('.matrix');
  await shot(page, '10-celular-matriz');

  // Foco
  step = 'Foco';
  await page.click('nav.tabbar button:has-text("Foco")');
  await page.waitForSelector('.focus-ring');
  await page.click('button.focus-play');
  await page.waitForTimeout(2200);
  const time = await page.locator('.fr-time').textContent();
  ok('Pomodoro conta o tempo', time && time !== '25:00', time);
  await shot(page, '11-celular-foco');
  await page.click('button.focus-play');

  // Hábitos e consistência
  step = 'Hábitos e consistência';
  await page.click('nav.tabbar button:has-text("Hábitos")');
  await page.waitForSelector('.dayring');
  await shot(page, '12-celular-habitos');
  // O anel não pode ganhar o contorno azul do utilitário "ring" do Tailwind
  ok('anel do dia sem contorno extra', await page.evaluate(() => getComputedStyle(document.querySelector('.hsum .dayring')).boxShadow === 'none'));
  await page.click('button[aria-label="Mais opções de hábitos"]');
  await page.click('.menu-item:has-text("Dia difícil")');
  await page.waitForTimeout(300);
  const dh = await store(page);
  ok('dia difícil fica gravado no dia', Object.values(dh.days || {}).some((d) => d.hard));
  await page.click('button[aria-label="Mais opções de hábitos"]');
  await page.click('.menu-item:has-text("Desfazer dia difícil")');
  await page.waitForTimeout(300);
  ok('foco não fica preso no anel do dia', await page.evaluate(() => !(document.activeElement && document.activeElement.closest && document.activeElement.closest('.dayring'))));
  const routine = page.locator('.routine-btn').first();
  if (await routine.count()) {
    await routine.click();
    await page.waitForSelector('.runner');
    await shot(page, '43-celular-rotina');
    await page.click('.runner .btn-primary');
    await page.waitForTimeout(400);
    if (await page.locator('button[aria-label="Fechar rotina"]').count()) await page.click('button[aria-label="Fechar rotina"]');
    else await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
  }
  await page.click('button[aria-label="Mais opções de hábitos"]');
  await page.click('.menu-item:has-text("Evolução")');
  await page.waitForSelector('.stats');
  await shot(page, '13-celular-consistencia');
  await page.click('button[role="radio"]:has-text("Jardim")');
  await page.waitForSelector('.garden');
  await shot(page, '44-celular-jardim');
  await page.click('button[role="radio"]:has-text("Insights")');
  await page.waitForTimeout(300);
  await shot(page, '45-celular-insights');

  // Ajustes pela engrenagem do topo: lista vertical de seções, cada uma abre as opções
  step = 'Ajustes no celular';
  await page.click('button[aria-label^="Ajustes e conta"]');
  await page.waitForSelector('.set-menu');
  ok('engrenagem abre a lista vertical de seções', (await page.locator('.set-menu .set-row').count()) >= 9);
  await shot(page, '53-celular-ajustes-lista');
  await page.click('.set-menu .set-row:has-text("Conta")');
  await page.waitForTimeout(300);
  ok('seção Conta mostra o login', (await page.locator('.settings-page input[type="email"]').count()) > 0);
  await shot(page, '54-celular-ajustes-conta');
  await page.click('button[aria-label="Voltar para Ajustes"]');
  await page.click('.set-menu .set-row:has-text("Aparência")');
  await page.waitForTimeout(300);
  await shot(page, '55-celular-ajustes-aparencia');
  await page.click('button[aria-label="Voltar para Ajustes"]');
  await page.click('button[aria-label="Voltar"]');
  await page.waitForTimeout(300);

  // Escuro
  step = 'Escuro';
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.click('nav.tabbar button:has-text("Tarefas")');
  await shot(page, '14-celular-escuro-tarefas');
  await page.click('nav.tabbar button:has-text("Agenda")');
  await page.click('button[role="radio"]:has-text("Mês")');
  await shot(page, '15-celular-escuro-agenda');
  await ctx.close();
} catch (e) {
  if (curPage) await curPage.screenshot({ path: `${OUT}/99-falha-celular.png` }).catch(() => {});
  problems.push(`[celular] fluxo interrompido em "${step}": ${e.message.split('\n').slice(0, 9).join(' | ')}`);
}

/* ------------------------------------------------------------------ */
/* Computador                                                          */
/* ------------------------------------------------------------------ */
try {
  var { ctx, page } = await session('computador', { viewport: { width: 1440, height: 900 } });
  await shot(page, '20-desk-hoje');

  await page.fill('.qa-input', 'Revisar orçamento sexta 14h !2 ^trabalho');
  await shot(page, '21-desk-entrada-rapida');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(300);
  const d1 = await store(page);
  const orc = (d1.tasks || []).find((t) => t.title === 'Revisar orçamento');
  ok('entrada rápida (desktop) usa lista ^trabalho e prioridade !2', orc && orc.listId === 'trabalho' && orc.priority === 2 && orc.time === '14:00', JSON.stringify(orc));

  // Painel de detalhe
  step = 'Painel de detalhe';
  await page.click('.trow:has-text("Revisar proposta") .trow-main');
  await page.waitForSelector('.td-panel');
  await shot(page, '22-desk-painel-detalhe');
  await page.keyboard.press('Escape');

  // Lista Trabalho em Kanban e arrastar card
  step = 'Lista Trabalho em Kanban e arrastar card';
  await page.click('.lists-col .lp-item:has-text("Trabalho")');
  await page.click('button[aria-label="Kanban"]');
  await page.waitForSelector('.kanban');
  await shot(page, '23-desk-kanban');
  await mouseDrag(page, page.locator('.kcard:has-text("Preparar apresentação")'), page.locator('section.kcol[aria-label="Em andamento"] .kcol-body'));
  const d2 = await store(page);
  const ap = (d2.tasks || []).find((t) => t.id === 'ex-apresentacao');
  ok('arrastar no Kanban muda a coluna', ap && ap.sectionId === 's-andamento', JSON.stringify(ap && ap.sectionId));
  await shot(page, '24-desk-kanban-depois');
  await page.click('button[aria-label="Lista"]');

  // Arrastar tarefa para "Amanhã" na barra de listas
  step = 'Arrastar tarefa para "Amanhã" na barra de listas';
  await page.click('.lists-col .lp-item:has-text("Hoje")');
  await page.waitForTimeout(300);
  await mouseDrag(page, page.locator('.trow:has-text("Responder e-mails")'), page.locator('.lists-col .lp-item:has-text("Amanhã")'));
  const d3 = await store(page);
  const em = (d3.tasks || []).find((t) => t.id === 'ex-emails');
  ok('arrastar para Amanhã muda a data', em && em.date > new Date().toISOString().slice(0, 10), em && em.date);

  // Agenda semanal e arrastar bloco
  step = 'Agenda semanal e arrastar bloco';
  await page.click('.rail button:has-text("Agenda")');
  await page.waitForSelector('.cal');
  await shot(page, '25-desk-agenda-mes');
  await page.click('button[role="radio"]:has-text("Semana")');
  await page.waitForSelector('.tg-col');
  await shot(page, '26-desk-agenda-semana');
  // Rola a grade para as 8h: a posição inicial depende da hora em que o teste roda
  await page.evaluate(() => {
    document.querySelector('.tg-scroll').scrollTop = 52 * 8;
  });
  await page.waitForTimeout(250);
  const blk = page.locator('.blk.is-task:has-text("Revisar proposta")');
  if (await blk.count()) {
    const a = await center(blk);
    await mouseDrag(page, blk, { x: a.x, y: a.y + 104 });
    const d4 = await store(page);
    const pr = (d4.tasks || []).find((t) => t.id === 'ex-proposta');
    ok('arrastar bloco na semana muda a hora', pr && pr.time && pr.time !== '10:00', pr && pr.time);
    await shot(page, '27-desk-agenda-arrastada');
  } else ok('bloco da tarefa aparece na semana', false);
  // Criar evento clicando num horário vazio
  step = 'Criar evento clicando num horário vazio';
  await page.click('button[role="radio"]:has-text("Dia")');
  await page.waitForSelector('.tg-col');
  await page.evaluate(() => {
    document.querySelector('.tg-scroll').scrollTop = 52 * 18;
  });
  await page.waitForTimeout(200);
  const col = page.locator('.tg-col').first();
  const box = await col.boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + 52 * 20.5);
  await page.waitForSelector('#cr-title');
  await page.fill('#cr-title', 'Jantar com amigos');
  await shot(page, '28-desk-criar-evento');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(400);
  const d5 = await store(page);
  ok('criar evento pela grade', (d5.events || []).some((e) => e.title === 'Jantar com amigos' && e.start >= '20:00'));

  // Matriz: arrastar entre quadrantes
  step = 'Matriz: arrastar entre quadrantes';
  await page.click('.rail button:has-text("Matriz")');
  await page.waitForSelector('.matrix');
  await shot(page, '29-desk-matriz');
  const q1 = page.locator('.quad[data-quad="3"] .trow').first();
  const q1Title = ((await q1.locator('.trow-title-text').textContent()) || '').trim();
  await mouseDrag(page, q1, page.locator('.quad[data-quad="0"] .quad-body'));
  const d6 = await store(page);
  ok('arrastar na matriz muda a prioridade', (d6.tasks || []).some((t) => t.title === q1Title && t.priority === 0), q1Title);

  // Foco, hábitos, consistência
  step = 'Foco, hábitos, consistência';
  await page.click('.rail button:has-text("Foco")');
  await page.waitForSelector('.focus-ring');
  await shot(page, '30-desk-foco');
  await page.click('.rail button:has-text("Hábitos")');
  await page.waitForSelector('.dayring');
  await shot(page, '31-desk-habitos');
  await page.click('.rail button[title^="Consistência"]');
  await page.waitForSelector('.stats');
  await shot(page, '32-desk-consistencia');

  // Ajustes: tema preto
  step = 'Ajustes: tema preto';
  await page.keyboard.press(',');
  await page.waitForSelector('.settings-page');
  ok('Ajustes abre como página, na aba Conta', (await page.locator('.set-tab.is-on:has-text("Conta")').count()) === 1 && (await page.locator('.sheet').count()) === 0);
  await shot(page, '46-desk-ajustes');
  await page.click('.set-tab:has-text("Aparência")');
  await page.click('button[role="radio"]:has-text("Preto")');
  await page.waitForTimeout(300);
  ok('ajuste de tema aplica o preto', (await page.evaluate(() => document.documentElement.dataset.theme)) === 'black');
  await shot(page, '47-desk-ajustes-preto');
  await page.click('button[role="radio"]:has-text("Auto")');
  await page.click('.set-tab:has-text("Data e feriados")');
  await page.waitForTimeout(300);
  await shot(page, '48-desk-ajustes-feriados');

  // Modelos
  step = 'Modelos';
  await page.click('.rail button:has-text("Tarefas")');
  const before = ((await store(page)).tasks || []).length;
  await page.click('.lists-col button[aria-label="Adicionar lista, modelo ou filtro"]');
  await page.click('.menu-item:has-text("Usar um modelo")');
  await page.click('.tpl-main:has-text("Viagem")');
  await shot(page, '49-desk-modelo');
  await page.click('.sheet-foot .btn-primary');
  await page.waitForTimeout(400);
  ok('modelo cria as tarefas', ((await store(page)).tasks || []).length === before + 4);

  // Filtro inteligente
  step = 'Filtro inteligente';
  await page.click('.lists-col button[aria-label="Adicionar lista, modelo ou filtro"]');
  await page.click('.menu-item:has-text("Novo filtro")');
  await page.fill('input[aria-label="Nome do filtro"]', 'Alta prioridade');
  await page.click('.chip-toggle:has-text("Alta")');
  await shot(page, '50-desk-filtro');
  await page.click('.sheet-foot .btn-primary');
  await page.waitForTimeout(400);
  ok('filtro aparece na barra de listas', await page.locator('.lists-col .lp-item:has-text("Alta prioridade")').count());
  await shot(page, '51-desk-filtro-visao');

  // Agenda: ano e foco em tela cheia
  step = 'Agenda: ano e foco em tela cheia';
  await page.click('.rail button:has-text("Agenda")');
  await page.click('button[role="radio"]:has-text("Ano")');
  await page.waitForSelector('.year');
  await shot(page, '52-desk-agenda-ano');
  await page.click('button[role="radio"]:has-text("Mês")');

  // Busca por teclado
  step = 'Busca por teclado';
  await page.keyboard.press('/');
  await page.waitForSelector('.search-input');
  await page.keyboard.type('dentista');
  await shot(page, '33-desk-busca');
  ok('busca encontra o evento', await page.locator('.sr:has-text("Dentista")').count());
  await page.keyboard.press('Escape');

  // Escuro
  step = 'Escuro';
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.click('.rail button:has-text("Tarefas")');
  await page.click('.lists-col .lp-item:has-text("Hoje")');
  await page.waitForTimeout(300);
  await page.locator('.trow .trow-main').first().click();
  await shot(page, '34-desk-escuro-tarefas');
  await page.click('.rail button:has-text("Agenda")');
  await shot(page, '35-desk-escuro-agenda');
  await ctx.close();
} catch (e) {
  if (curPage) await curPage.screenshot({ path: `${OUT}/99-falha-computador.png` }).catch(() => {});
  problems.push(`[computador] fluxo interrompido em "${step}": ${e.message.split('\n').slice(0, 9).join(' | ')}`);
}

await browser.close();
writeFileSync(`${OUT}/resultado.json`, JSON.stringify({ checks, problems }, null, 2));
for (const c of checks) console.log(`${c.ok ? 'OK  ' : 'FALHA'} ${c.name}${c.ok ? '' : ` ${c.detail}`}`);
if (problems.length) {
  for (const p of problems) console.log(`::error title=E2E::${p.replace(/\n/g, ' ')}`);
  process.exit(1);
}
console.log('::notice title=E2E::Todos os fluxos passaram');
