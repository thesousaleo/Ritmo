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

async function session(name, opts) {
  const ctx = await browser.newContext({ locale: 'pt-BR', timezoneId: 'America/Sao_Paulo', ...opts });
  const page = await ctx.newPage();
  page.on('console', (m) => {
    if (m.type() === 'error' && !/fonts\.g|favicon|supabase|Failed to load resource/i.test(m.text())) problems.push(`[${name}] console: ${m.text().slice(0, 300)}`);
  });
  page.on('pageerror', (e) => problems.push(`[${name}] erro: ${String(e.message || e).slice(0, 300)}`));
  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.waitForSelector('.page', { timeout: 15000 });
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
  const { ctx, page } = await session('celular', { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await shot(page, '01-celular-hoje');

  // Entrada rápida pelo botão flutuante
  await page.click('button.fab.is-float');
  await page.waitForSelector('.qa-input');
  await page.fill('.qa-input', 'Comprar café amanhã 9h #casa !1');
  await shot(page, '02-celular-entrada-rapida');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(300);
  const d1 = await store(page);
  const cafe = (d1.tasks || []).find((t) => t.title === 'Comprar café');
  ok('entrada rápida cria tarefa com data, hora, prioridade e etiqueta', cafe && cafe.time === '09:00' && cafe.priority === 3 && (cafe.tags || []).includes('casa') && !!cafe.date, JSON.stringify(cafe));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);

  // Gaveta de listas
  await page.click('button[aria-label="Listas"]');
  await page.waitForSelector('.drawer');
  await shot(page, '03-celular-gaveta-listas');
  await page.click('.drawer .lp-item:has-text("Amanhã")');
  await page.waitForTimeout(400);
  ok('tarefa nova aparece em Amanhã', await page.locator('.trow:has-text("Comprar café")').count());
  await shot(page, '04-celular-amanha');

  // Detalhe da tarefa
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

  // Agenda
  await page.click('nav.tabbar button:has-text("Agenda")');
  await page.waitForSelector('.cal');
  await shot(page, '07-celular-agenda-mes');
  await page.click('button[role="radio"]:has-text("3 dias")');
  await page.waitForSelector('.tg');
  await shot(page, '08-celular-agenda-3dias');
  await page.click('button[role="radio"]:has-text("Lista")');
  await shot(page, '09-celular-agenda-lista');

  // Matriz
  await page.click('nav.tabbar button:has-text("Matriz")');
  await page.waitForSelector('.matrix');
  await shot(page, '10-celular-matriz');

  // Foco
  await page.click('nav.tabbar button:has-text("Foco")');
  await page.waitForSelector('.focus-ring');
  await page.click('button.focus-play');
  await page.waitForTimeout(2200);
  const time = await page.locator('.fr-time').textContent();
  ok('Pomodoro conta o tempo', time && time !== '25:00', time);
  await shot(page, '11-celular-foco');
  await page.click('button.focus-play');

  // Hábitos e consistência
  await page.click('nav.tabbar button:has-text("Hábitos")');
  await page.waitForSelector('.ring');
  await shot(page, '12-celular-habitos');
  await page.click('button[aria-label="Consistência"]');
  await page.waitForSelector('.stats');
  await shot(page, '13-celular-consistencia');

  // Escuro
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.click('nav.tabbar button:has-text("Tarefas")');
  await shot(page, '14-celular-escuro-tarefas');
  await page.click('nav.tabbar button:has-text("Agenda")');
  await page.click('button[role="radio"]:has-text("Mês")');
  await shot(page, '15-celular-escuro-agenda');
  await ctx.close();
} catch (e) {
  problems.push(`[celular] fluxo interrompido: ${e.message.split('\n')[0]}`);
}

/* ------------------------------------------------------------------ */
/* Computador                                                          */
/* ------------------------------------------------------------------ */
try {
  const { ctx, page } = await session('computador', { viewport: { width: 1440, height: 900 } });
  await shot(page, '20-desk-hoje');

  await page.fill('.qa-input', 'Revisar orçamento sexta 14h !2 ^trabalho');
  await shot(page, '21-desk-entrada-rapida');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(300);
  const d1 = await store(page);
  const orc = (d1.tasks || []).find((t) => t.title === 'Revisar orçamento');
  ok('entrada rápida (desktop) usa lista ^trabalho e prioridade !2', orc && orc.listId === 'trabalho' && orc.priority === 2 && orc.time === '14:00', JSON.stringify(orc));

  // Painel de detalhe
  await page.click('.trow:has-text("Revisar proposta") .trow-main');
  await page.waitForSelector('.td-panel');
  await shot(page, '22-desk-painel-detalhe');
  await page.keyboard.press('Escape');

  // Lista Trabalho em Kanban e arrastar card
  await page.click('.lists-col .lp-item:has-text("Trabalho")');
  await page.click('button[aria-label="Kanban"]');
  await page.waitForSelector('.kanban');
  await shot(page, '23-desk-kanban');
  await mouseDrag(page, page.locator('.kcard:has-text("Preparar apresentação")'), page.locator('section.kcol[aria-label="Revisão"] .kcol-body'));
  const d2 = await store(page);
  const ap = (d2.tasks || []).find((t) => t.id === 'ex-apresentacao');
  ok('arrastar no Kanban muda a coluna', ap && ap.sectionId === 's-revisao', JSON.stringify(ap && ap.sectionId));
  await shot(page, '24-desk-kanban-depois');
  await page.click('button[aria-label="Lista"]');

  // Arrastar tarefa para "Amanhã" na barra de listas
  await page.click('.lists-col .lp-item:has-text("Hoje")');
  await page.waitForTimeout(300);
  await mouseDrag(page, page.locator('.trow:has-text("Responder e-mails")'), page.locator('.lists-col .lp-item:has-text("Amanhã")'));
  const d3 = await store(page);
  const em = (d3.tasks || []).find((t) => t.id === 'ex-emails');
  ok('arrastar para Amanhã muda a data', em && em.date > new Date().toISOString().slice(0, 10), em && em.date);

  // Agenda semanal e arrastar bloco
  await page.click('.rail button:has-text("Agenda")');
  await page.waitForSelector('.cal');
  await shot(page, '25-desk-agenda-mes');
  await page.click('button[role="radio"]:has-text("Semana")');
  await page.waitForSelector('.tg-col');
  await shot(page, '26-desk-agenda-semana');
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
  await page.click('button[role="radio"]:has-text("Dia")');
  await page.waitForSelector('.tg-col');
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
  await page.click('.rail button:has-text("Matriz")');
  await page.waitForSelector('.matrix');
  await shot(page, '29-desk-matriz');
  const q1 = page.locator('.quad[data-quad="3"] .trow').first();
  const q1Title = ((await q1.locator('.trow-title-text').textContent()) || '').trim();
  await mouseDrag(page, q1, page.locator('.quad[data-quad="0"] .quad-body'));
  const d6 = await store(page);
  ok('arrastar na matriz muda a prioridade', (d6.tasks || []).some((t) => t.title === q1Title && t.priority === 0), q1Title);

  // Foco, hábitos, consistência
  await page.click('.rail button:has-text("Foco")');
  await page.waitForSelector('.focus-ring');
  await shot(page, '30-desk-foco');
  await page.click('.rail button:has-text("Hábitos")');
  await page.waitForSelector('.ring');
  await shot(page, '31-desk-habitos');
  await page.click('.rail button:has-text("Consistência")');
  await page.waitForSelector('.stats');
  await shot(page, '32-desk-consistencia');

  // Busca por teclado
  await page.keyboard.press('/');
  await page.waitForSelector('.search-input');
  await page.keyboard.type('dentista');
  await shot(page, '33-desk-busca');
  ok('busca encontra o evento', await page.locator('.sr:has-text("Dentista")').count());
  await page.keyboard.press('Escape');

  // Escuro
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.click('.rail button:has-text("Tarefas")');
  await page.click('.trow:has-text("Revisar proposta") .trow-main');
  await shot(page, '34-desk-escuro-tarefas');
  await page.click('.rail button:has-text("Agenda")');
  await shot(page, '35-desk-escuro-agenda');
  await ctx.close();
} catch (e) {
  problems.push(`[computador] fluxo interrompido: ${e.message.split('\n')[0]}`);
}

await browser.close();
writeFileSync(`${OUT}/resultado.json`, JSON.stringify({ checks, problems }, null, 2));
for (const c of checks) console.log(`${c.ok ? 'OK  ' : 'FALHA'} ${c.name}${c.ok ? '' : ` ${c.detail}`}`);
if (problems.length) {
  for (const p of problems) console.log(`::error title=E2E::${p.replace(/\n/g, ' ')}`);
  process.exit(1);
}
console.log('::notice title=E2E::Todos os fluxos passaram');
