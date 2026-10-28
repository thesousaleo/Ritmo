// Resumo semanal do Ritmo por e-mail.
// - Chamado pelo pg_cron todo domingo às 19h (Brasília) com o cabeçalho x-cron-token: envia para quem ligou o resumo.
// - Chamado pelo app com o token do usuário e { test: true }: envia só para essa pessoa, na hora.
// Envio pelo Resend (segredo RESEND_API_KEY; remetente opcional em RESEND_FROM).
import { createClient } from 'npm:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const TZ = 'America/Sao_Paulo';
const COLORS: Record<string, string> = { cobalt: '#4C6EF5', mint: '#1FAA78', amber: '#E39A2A', rose: '#E0507F', violet: '#8A6BEF', sky: '#2A9FD6' };
const WD = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const todayKey = () => new Date().toLocaleDateString('en-CA', { timeZone: TZ });
const addDays = (k: string, n: number) => {
  const d = new Date(`${k}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const weekday = (k: string) => new Date(`${k}T12:00:00Z`).getUTCDay();
const fmt = (k: string) => {
  const [, m, d] = k.split('-');
  return `${Number(d)}/${Number(m)}`;
};
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));

type Habit = { id: string; name: string; color: string; kind: string; freq: string; per_week: number; days: number[]; target: number; created_on: string; archived: boolean; deleted: boolean };
type Break = { start: string; end: string };

async function buildSummary(admin: ReturnType<typeof createClient>, userId: string) {
  const end = todayKey();
  const start = addDays(end, -6);
  const [{ data: habits }, { data: checkins }, { data: profile }, { data: moods }] = await Promise.all([
    admin.from('habits').select('*').eq('user_id', userId).eq('deleted', false).eq('archived', false).order('position'),
    admin.from('checkins').select('habit_id,day,count').eq('user_id', userId).gte('day', start).lte('day', end),
    admin.from('profiles').select('name,breaks').eq('user_id', userId).maybeSingle(),
    admin.from('moods').select('day,mood').eq('user_id', userId).gte('day', start).lte('day', end).gt('mood', 0),
  ]);
  const breaks: Break[] = (profile?.breaks as Break[]) || [];
  const inBreak = (k: string) => breaks.some((b) => k >= b.start && k <= b.end);
  const counts = new Map<string, number>();
  for (const c of checkins || []) counts.set(`${c.habit_id}|${c.day}`, c.count);

  const rows = ((habits || []) as Habit[]).map((h) => {
    const days: string[] = [];
    for (let k = start; k <= end; k = addDays(k, 1)) days.push(k);
    const doneDays = days.filter((k) => (counts.get(`${h.id}|${k}`) || 0) >= h.target);
    let expected: number;
    if (h.freq === 'weekly') expected = h.per_week;
    else expected = days.filter((k) => k >= h.created_on && h.days.includes(weekday(k)) && !inBreak(k)).length;
    const done = h.freq === 'weekly' ? Math.min(doneDays.length, h.per_week) : doneDays.filter((k) => !inBreak(k)).length;
    return { h, done, expected, rate: expected ? done / expected : null, dots: days.map((k) => ({ k, ok: doneDays.includes(k), off: inBreak(k) || (h.freq !== 'weekly' && !h.days.includes(weekday(k))) })) };
  });
  const counted = rows.filter((r) => r.expected > 0);
  const totalDone = counted.reduce((s, r) => s + r.done, 0);
  const totalExp = counted.reduce((s, r) => s + r.expected, 0);
  const moodAvg = moods && moods.length ? moods.reduce((s, m) => s + m.mood, 0) / moods.length : null;
  const best = [...counted].sort((a, b) => (b.rate ?? 0) - (a.rate ?? 0))[0];
  const attention = [...counted].sort((a, b) => (a.rate ?? 1) - (b.rate ?? 1))[0];
  return { name: profile?.name || '', start, end, rows, rate: totalExp ? totalDone / totalExp : null, totalDone, totalExp, moodAvg, best, attention };
}

function renderEmail(s: Awaited<ReturnType<typeof buildSummary>>, siteUrl: string) {
  const pct = s.rate === null ? '–' : `${Math.round(s.rate * 100)}%`;
  const hello = s.name ? `Oi, ${esc(s.name)}.` : 'Oi.';
  const moodWords = ['', 'muito ruim', 'ruim', 'neutro', 'bom', 'ótimo'];
  const lines: string[] = [];
  if (s.best && s.best.rate !== null && s.best.rate >= 0.7) lines.push(`Destaque da semana: <strong>${esc(s.best.h.name)}</strong> (${s.best.done} de ${s.best.expected}).`);
  if (s.attention && s.attention !== s.best && s.attention.rate !== null && s.attention.rate < 0.5)
    lines.push(`Precisa de atenção: <strong>${esc(s.attention.h.name)}</strong> (${s.attention.done} de ${s.attention.expected}).`);
  if (s.moodAvg !== null) lines.push(`Humor médio: ${moodWords[Math.round(s.moodAvg)]} (${s.moodAvg.toFixed(1).replace('.', ',')} de 5).`);

  const habitRows = s.rows
    .map((r) => {
      const color = COLORS[r.h.color] || '#4C6EF5';
      const dots = r.dots
        .map(
          (d) =>
            `<td style="padding:0 2px"><div title="${WD[weekday(d.k)]} ${fmt(d.k)}" style="width:14px;height:14px;border-radius:4px;background:${d.ok ? color : d.off ? '#EEF1EC' : '#DCE2D8'}"></div></td>`
        )
        .join('');
      const label = r.h.freq === 'weekly' ? `${r.done} de ${r.expected} na semana` : r.expected ? `${r.done} de ${r.expected}` : 'sem dias programados';
      return `<tr>
        <td style="padding:10px 0;border-top:1px solid #E1E6DE;font:600 15px/1.3 -apple-system,Segoe UI,Roboto,sans-serif;color:#131A16">${esc(r.h.name)}${r.h.kind === 'avoid' ? ' <span style="font-weight:500;color:#5A655F">(evitar)</span>' : ''}<div style="font:500 13px/1.4 -apple-system,Segoe UI,Roboto,sans-serif;color:#5A655F">${label}</div></td>
        <td style="padding:10px 0;border-top:1px solid #E1E6DE" align="right"><table cellpadding="0" cellspacing="0"><tr>${dots}</tr></table></td>
      </tr>`;
    })
    .join('');

  const html = `<!doctype html><html lang="pt-BR"><body style="margin:0;background:#ECEFE9;padding:24px 12px">
  <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#FAFBF8;border-radius:20px;padding:28px">
    <tr><td style="font:500 14px/1.4 -apple-system,Segoe UI,Roboto,sans-serif;color:#5A655F">Ritmo, semana de ${fmt(s.start)} a ${fmt(s.end)}</td></tr>
    <tr><td style="padding-top:6px;font:700 26px/1.2 -apple-system,Segoe UI,Roboto,sans-serif;color:#131A16">${hello} Sua semana fechou em ${pct}.</td></tr>
    <tr><td style="padding-top:6px;font:400 15px/1.5 -apple-system,Segoe UI,Roboto,sans-serif;color:#131A16">${s.totalDone} de ${s.totalExp} metas cumpridas.${lines.length ? '<br>' + lines.join('<br>') : ''}</td></tr>
    <tr><td style="padding-top:18px"><table width="100%" cellpadding="0" cellspacing="0">${habitRows}</table></td></tr>
    <tr><td style="padding-top:22px"><a href="${siteUrl}" style="display:inline-block;background:#131A16;color:#ECEFE9;text-decoration:none;font:600 15px/1 -apple-system,Segoe UI,Roboto,sans-serif;padding:14px 20px;border-radius:14px">Abrir o Ritmo</a></td></tr>
    <tr><td style="padding-top:20px;font:400 12px/1.5 -apple-system,Segoe UI,Roboto,sans-serif;color:#5A655F">Você recebe este e-mail porque ligou o resumo semanal. Para parar, desligue em Conta, no app.</td></tr>
  </table></td></tr></table></body></html>`;
  const text = `${hello} Sua semana (${fmt(s.start)} a ${fmt(s.end)}) fechou em ${pct}: ${s.totalDone} de ${s.totalExp} metas.\n\n` + s.rows.map((r) => `${r.h.name}: ${r.done} de ${r.expected}`).join('\n');
  return { subject: `Sua semana no Ritmo: ${pct}`, html, text };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  const resendKey = Deno.env.get('RESEND_API_KEY');
  const from = Deno.env.get('RESEND_FROM') || 'Ritmo <onboarding@resend.dev>';
  const siteUrl = Deno.env.get('SITE_URL') || 'https://thesousaleo.github.io/Ritmo/';

  let targets: { id: string; email: string }[] = [];
  const cronToken = req.headers.get('x-cron-token');
  if (cronToken) {
    const { data: ok } = await admin.rpc('check_cron_token', { token: cronToken });
    if (!ok) return json({ error: 'Token inválido.' }, 401);
    const { data: profs } = await admin.from('profiles').select('user_id').eq('weekly_email', true);
    for (const p of profs || []) {
      const { data } = await admin.auth.admin.getUserById(p.user_id);
      if (data?.user?.email) targets.push({ id: p.user_id, email: data.user.email });
    }
  } else {
    const jwt = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
    const { data, error } = await admin.auth.getUser(jwt);
    if (error || !data?.user?.email) return json({ error: 'Entre na sua conta para receber o resumo.' }, 401);
    targets = [{ id: data.user.id, email: data.user.email }];
  }

  if (!resendKey) return json({ error: 'O envio de e-mail ainda não foi configurado no servidor (falta a chave do Resend).' }, 503);

  const results: { to: string; ok: boolean; error?: string }[] = [];
  for (const t of targets) {
    try {
      const summary = await buildSummary(admin, t.id);
      const mail = renderEmail(summary, siteUrl);
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from, to: [t.email], subject: mail.subject, html: mail.html, text: mail.text }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        results.push({ to: t.email, ok: false, error: body?.message || `Resend respondeu ${res.status}` });
      } else results.push({ to: t.email, ok: true });
    } catch (e) {
      results.push({ to: t.email, ok: false, error: String(e) });
    }
  }

  if (!cronToken) {
    const r = results[0];
    if (!r || !r.ok) {
      const msg = r?.error || 'Falha ao enviar.';
      const hint = /only send testing emails|verify a domain/i.test(msg)
        ? 'O Resend, sem domínio verificado, só entrega no e-mail da própria conta do Resend. Use a conta do Ritmo com esse mesmo e-mail ou verifique um domínio no Resend.'
        : msg;
      return json({ error: hint }, 502);
    }
    return json({ sent: 1, to: r.to });
  }
  return json({ sent: results.filter((r) => r.ok).length, failed: results.filter((r) => !r.ok) });
});
