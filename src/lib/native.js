/* Recursos do aparelho: lembretes, aviso do temporizador, exportação e tela acesa. No site viram alternativas web. */
import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { isWeekly, inBreak, keyOf, todayDate } from './habits.js';
import { reminderAt } from './tasks.js';
import { fmtTime } from './prefs.js';
import { eventOccurrences } from './calendar.js';

export const isNative = Capacitor.isNativePlatform();
export const remindersSupported = isNative;

const CHANNEL = 'lembretes';
const TIMER_ID = 9;
const FOCUS_ID = 10;
const MAX_ONE_SHOT = 150;

// IDs estáveis por hábito e dia da semana: 1000 + (hash % 100000) * 7 + dia
function hashId(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return Math.abs(h) % 100000;
}
const reminderId = (habitId, weekday) => 1000 + hashId(habitId) * 7 + weekday;
const oneShotId = (key) => 1_000_000 + (hashId(key) % 900_000) * 2;

/** Lembretes únicos de tarefas e eventos para os próximos 21 dias. */
export function upcomingReminders(data, now = new Date()) {
  const horizon = new Date(now.getTime() + 21 * 86400000);
  const out = [];
  for (const t of data.tasks || []) {
    if (t.done || t.reminder < 0 || !t.date) continue;
    const at = reminderAt(t.date, t.time, t.reminder);
    if (at && at > now && at < horizon) {
      out.push({ id: oneShotId(`t|${t.id}|${t.date}`), at, title: t.title, body: t.time ? `Às ${fmtTime(t.time)}` : 'Para hoje', extra: { taskId: t.id }, action: 'TASK' });
      // Lembrete insistente: repete a cada 30 minutos (até 4 vezes) enquanto a tarefa não for concluída
      if (t.nag) {
        for (let i = 1; i <= 4; i++) {
          const again = new Date(at.getTime() + i * 30 * 60000);
          if (again < horizon) out.push({ id: oneShotId(`t|${t.id}|${t.date}|n${i}`), at: again, title: t.title, body: 'Ainda pendente', extra: { taskId: t.id }, action: 'TASK' });
        }
      }
    }
  }
  const fromK = keyOf(now);
  const toK = keyOf(horizon);
  for (const o of eventOccurrences((data.events || []).filter((e) => e.reminder >= 0), fromK, toK)) {
    const ev = o.ev;
    const at = reminderAt(o.date, ev.allDay ? '' : ev.start, ev.reminder);
    if (at && at > now && at < horizon)
      out.push({ id: oneShotId(`e|${o.id}`), at, title: ev.title, body: ev.allDay ? 'Hoje, dia inteiro' : `Às ${fmtTime(ev.start)}${ev.location ? `, ${ev.location}` : ''}`, extra: { eventId: ev.id, date: o.date } });
  }
  return out.sort((a, b) => a.at - b.at).slice(0, MAX_ONE_SHOT);
}

let channelReady = false;
async function ensureChannel() {
  if (channelReady) return;
  try {
    await LocalNotifications.createChannel({ id: CHANNEL, name: 'Lembretes de hábitos', importance: 4, visibility: 1, vibration: true });
  } catch (e) {
    /* canais só existem no Android */
  }
  channelReady = true;
}

/** 'granted' | 'denied' | 'prompt' | 'unsupported' */
export async function notificationPermission(ask = false) {
  if (!isNative) return 'unsupported';
  try {
    let p = await LocalNotifications.checkPermissions();
    if (p.display !== 'granted' && ask) p = await LocalNotifications.requestPermissions();
    return p.display === 'granted' ? 'granted' : p.display === 'denied' ? 'denied' : 'prompt';
  } catch (e) {
    return 'denied';
  }
}

/**
 * Reagenda todos os lembretes a partir dos hábitos atuais.
 * Repetição semanal por dia programado; nada é agendado enquanto uma pausa estiver ativa.
 */
export async function syncReminders(data, { ask = false } = {}) {
  if (!isNative) return 'unsupported';
  const wanted = data.habits.filter((h) => !h.archived && h.reminder);
  const oneShots = upcomingReminders(data);
  const perm = await notificationPermission(ask && (wanted.length > 0 || oneShots.length > 0));
  try {
    const pending = await LocalNotifications.getPending();
    const ours = pending.notifications.filter((n) => n.id >= 1000).map((n) => ({ id: n.id }));
    if (ours.length) await LocalNotifications.cancel({ notifications: ours });
  } catch (e) {
    /* nada agendado */
  }
  if (perm !== 'granted' || (!wanted.length && !oneShots.length)) return perm;
  await ensureChannel();

  const notifications = oneShots.map((n) => ({
    id: n.id,
    title: n.title,
    body: n.body,
    channelId: CHANNEL,
    schedule: { at: n.at, allowWhileIdle: true },
    extra: n.extra,
    ...(n.action ? { actionTypeId: n.action } : {}),
  }));
  // Hábitos não lembram durante uma pausa (geral ou só daquele hábito)
  const todayK = keyOf(todayDate());
  if (inBreak(data, todayK)) wanted.length = 0;
  for (const h of wanted.filter((x) => !inBreak(data, todayK, x))) {
    const [hour, minute] = h.reminder.split(':').map(Number);
    const days = isWeekly(h) ? [0, 1, 2, 3, 4, 5, 6] : h.days;
    for (const d of days) {
      notifications.push({
        id: reminderId(h.id, d),
        title: h.kind === 'avoid' ? `Lembrete: ${h.name}` : h.name,
        body: h.kind === 'avoid' ? 'Segure firme hoje.' : h.unit ? `Hora de ${h.unit.toLowerCase()}.` : 'Hora do seu hábito.',
        channelId: CHANNEL,
        schedule: { on: { weekday: d + 1, hour, minute }, allowWhileIdle: true },
        extra: { habitId: h.id },
      });
    }
  }
  try {
    await LocalNotifications.schedule({ notifications });
  } catch (e) {
    console.warn('[ritmo] lembretes não agendados', e);
  }
  return perm;
}

/** Aviso de fim do temporizador quando o app está em segundo plano. */
export async function scheduleTimerDone(habitName, endAt) {
  if (!isNative) return;
  try {
    if ((await notificationPermission(true)) !== 'granted') return;
    await ensureChannel();
    await LocalNotifications.schedule({
      notifications: [{ id: TIMER_ID, title: 'Tempo concluído', body: `${habitName} foi marcado como feito.`, channelId: CHANNEL, schedule: { at: new Date(endAt), allowWhileIdle: true } }],
    });
  } catch (e) {
    /* opcional */
  }
}
export async function cancelTimerDone() {
  if (!isNative) return;
  try {
    await LocalNotifications.cancel({ notifications: [{ id: TIMER_ID }] });
  } catch (e) {
    /* nada agendado */
  }
}

/** Notificação fixa enquanto o foco roda (mostra até que horas vai). */
const ONGOING_ID = 11;
export async function showFocusOngoing(label, endAt) {
  if (!isNative) return;
  try {
    if ((await notificationPermission(false)) !== 'granted') return;
    await ensureChannel();
    const until = endAt ? new Date(endAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '';
    await LocalNotifications.schedule({
      notifications: [{ id: ONGOING_ID, title: label, body: until ? `Até ${until}` : 'Cronômetro rodando', channelId: CHANNEL, ongoing: true, autoCancel: false, silent: true, schedule: { at: new Date(Date.now() + 800) } }],
    });
  } catch (e) {
    /* opcional */
  }
}
export async function hideFocusOngoing() {
  if (!isNative) return;
  try {
    await LocalNotifications.cancel({ notifications: [{ id: ONGOING_ID }] });
  } catch (e) {
    /* nada */
  }
}

/** Aviso de fim de foco ou pausa (Pomodoro). */
export async function scheduleFocusEnd(title, body, endAt) {
  if (!isNative) return;
  try {
    if ((await notificationPermission(true)) !== 'granted') return;
    await ensureChannel();
    await LocalNotifications.schedule({ notifications: [{ id: FOCUS_ID, title, body, channelId: CHANNEL, schedule: { at: new Date(endAt), allowWhileIdle: true } }] });
  } catch (e) {
    /* opcional */
  }
}
export async function cancelFocusEnd() {
  if (!isNative) return;
  try {
    await LocalNotifications.cancel({ notifications: [{ id: FOCUS_ID }] });
  } catch (e) {
    /* nada agendado */
  }
}

/** Salva e compartilha (APK) ou baixa (site) um arquivo de texto. */
export async function saveTextFile(filename, text, mime = 'text/csv') {
  if (isNative) {
    const res = await Filesystem.writeFile({ path: filename, data: text, directory: Directory.Cache, encoding: Encoding.UTF8 });
    await Share.share({ title: filename, url: res.uri, dialogTitle: 'Salvar ou enviar o arquivo' });
    return 'shared';
  }
  const blob = new Blob([text], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  return 'downloaded';
}

/** Mantém a tela acesa durante o temporizador, quando o navegador permite. */
export async function keepAwake() {
  try {
    if ('wakeLock' in navigator) return await navigator.wakeLock.request('screen');
  } catch (e) {
    /* recusado: segue sem */
  }
  return null;
}
