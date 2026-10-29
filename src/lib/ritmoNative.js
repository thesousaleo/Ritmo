/*
 * Ponte para o plugin nativo do Ritmo no Android (RitmoNative, em android-plugin/).
 * Widget, ícone alternativo, digital/rosto, ditado por voz, lembretes por lugar e diagnóstico de lembretes.
 * No site, cada função tem uma alternativa web ou responde "não disponível".
 */
import { Capacitor, registerPlugin } from '@capacitor/core';

export const isNativeAndroid = Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
const Plugin = isNativeAndroid ? registerPlugin('RitmoNative') : null;

const call = async (method, args = {}, fallback = null) => {
  if (!Plugin) return fallback;
  try {
    return await Plugin[method](args);
  } catch (e) {
    console.warn(`[ritmo] nativo: ${method} falhou`, e);
    return fallback;
  }
};

/* ---------- bloqueio por digital/rosto ---------- */
export async function biometricAvailable() {
  const r = await call('biometricAvailable', {}, { available: false });
  return !!(r && r.available);
}
export async function authenticate(reason = 'Desbloquear o Ritmo') {
  const r = await call('authenticate', { title: 'Ritmo', subtitle: reason }, { ok: false });
  return !!(r && r.ok);
}

/* ---------- ícone do app ---------- */
export const APP_ICONS = [
  { id: 'default', label: 'Padrão', bg: '#3450E6', fg: '#FFFFFF' },
  { id: 'dark', label: 'Noite', bg: '#131A16', fg: '#8197FF' },
  { id: 'mint', label: 'Menta', bg: '#1FAA78', fg: '#FFFFFF' },
  { id: 'sand', label: 'Areia', bg: '#ECE3D3', fg: '#131A16' },
];
export const setAppIcon = (id) => call('setAppIcon', { name: id }, null);

/* ---------- ditado por voz ---------- */
const WebSpeech = typeof window !== 'undefined' ? window.SpeechRecognition || window.webkitSpeechRecognition : null;
export const speechSupported = isNativeAndroid || !!WebSpeech;

/** Ouve uma frase em português. Devolve o texto (ou '' se cancelou). */
export function listen({ onPartial } = {}) {
  if (isNativeAndroid) return call('listen', { lang: 'pt-BR', prompt: 'Diga a tarefa' }, { text: '' }).then((r) => (r && r.text) || '');
  if (!WebSpeech) return Promise.resolve('');
  return new Promise((resolve) => {
    const rec = new WebSpeech();
    rec.lang = 'pt-BR';
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    let final = '';
    rec.onresult = (e) => {
      let text = '';
      for (let i = 0; i < e.results.length; i++) text += e.results[i][0].transcript;
      if (onPartial) onPartial(text);
      if (e.results[e.results.length - 1].isFinal) final = text;
    };
    rec.onerror = () => resolve(final);
    rec.onend = () => resolve(final);
    try {
      rec.start();
    } catch (e) {
      resolve('');
    }
  });
}

/* ---------- lembretes por lugar ---------- */
export const geofenceSupported = isNativeAndroid;
/** fences: [{ id, lat, lng, radius, title, body }] — substitui todas as cercas. */
export const setGeofences = (fences) => call('setGeofences', { fences }, null);
export async function currentPosition() {
  if (isNativeAndroid) {
    const r = await call('currentPosition', {}, null);
    if (r && typeof r.lat === 'number') return r;
  }
  if (typeof navigator === 'undefined' || !navigator.geolocation) return null;
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 12000 }
    );
  });
}

/* ---------- diagnóstico de lembretes ---------- */
export async function reminderDiagnostics() {
  const d = await call('diagnostics', {}, null);
  if (!d) return null;
  try {
    const { LocalNotifications } = await import('@capacitor/local-notifications');
    const p = await LocalNotifications.getPending();
    d.pending = p.notifications.length;
  } catch (e) {
    /* sem contagem */
  }
  return d;
}
export const openBatterySettings = () => call('openBatterySettings', {}, null);
export const openExactAlarmSettings = () => call('openExactAlarmSettings', {}, null);
export const openNotificationSettings = () => call('openNotificationSettings', {}, null);

/* ---------- widgets ---------- */
/** Envia para os widgets da tela inicial o pacote montado em widgetData.js. */
export const updateWidget = (payload) => call('updateWidget', { json: JSON.stringify(payload) }, null);
/** Toques feitos nos widgets com o app fechado (concluir tarefa, marcar hábito). */
export async function takeWidgetActions() {
  const r = await call('takeWidgetActions', {}, null);
  return (r && Array.isArray(r.actions) && r.actions) || [];
}
/** Avisa quando um widget foi tocado com o app aberto em segundo plano. */
export function onWidgetAction(cb) {
  if (!Plugin) return () => {};
  const h = Plugin.addListener('widgetAction', cb);
  return () => Promise.resolve(h).then((x) => x && x.remove && x.remove());
}

/* ---------- barra de navegação (gestos/botões) ---------- */
// Fundo da página e fundo dos painéis por tema; com um painel aberto, a barra continua o painel
const NAV_COLORS = { light: ['#ECEFE9', '#FAFBF8'], dark: ['#0F1412', '#171E1B'], black: ['#000000', '#0D0F0E'] };
let navTheme = 'light';
let openSheets = 0;
let lastNav = '';
function paintNav() {
  if (!Plugin) return;
  const [page, sheet] = NAV_COLORS[navTheme] || NAV_COLORS.light;
  const color = openSheets > 0 ? sheet : page;
  const dark = navTheme !== 'light';
  const sig = `${color}|${dark}`;
  if (sig === lastNav) return;
  lastNav = sig;
  call('setNavigationBar', { color, dark });
}
/** Tema efetivo do app ('light' | 'dark' | 'black'). */
export function setNavTheme(theme) {
  navTheme = NAV_COLORS[theme] ? theme : theme === 'light' ? 'light' : 'dark';
  paintNav();
}
/** Painel (bottom sheet) aberto no celular. Devolve a função que avisa o fechamento. */
export function navSheetOpened() {
  openSheets += 1;
  paintNav();
  return () => {
    openSheets = Math.max(0, openSheets - 1);
    paintNav();
  };
}
