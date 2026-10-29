/*
 * Efeitos que conversam com o Android: bloqueio por digital, widget da tela inicial,
 * lembretes por lugar e ações das notificações (Concluir / Adiar, Feito nos hábitos).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { App as NativeApp } from '@capacitor/app';
import { LocalNotifications } from '@capacitor/local-notifications';
import { isNativeAndroid, authenticate, updateWidget, setGeofences, takeWidgetActions, onWidgetAction } from './ritmoNative.js';
import { keyOf, addDays, countOf } from './habits.js';
import { buildWidgetPayload, applyWidgetAction, collapseWidgetActions, parseRitmoUrl } from './widgetData.js';
import { snoozeTask } from './native.js';

export function useNativeBridges(store, todayKey, handlers = {}) {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;
  const { data, settings, device } = store;
  const [locked, setLocked] = useState(() => isNativeAndroid && !!device.lock);
  const busy = useRef(false);
  const lastHidden = useRef(0);

  const unlock = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    const ok = await authenticate('Desbloquear o Ritmo');
    busy.current = false;
    if (ok) setLocked(false);
  }, []);

  // Bloqueia de novo depois de 1 minuto em segundo plano
  useEffect(() => {
    if (!isNativeAndroid) return undefined;
    const h = NativeApp.addListener('appStateChange', ({ isActive }) => {
      if (!isActive) lastHidden.current = Date.now();
      else if (store.device.lock && lastHidden.current && Date.now() - lastHidden.current > 60000) setLocked(true);
    });
    return () => Promise.resolve(h).then((x) => x && x.remove && x.remove());
  }, [store.device.lock]);

  // Widgets da tela inicial: um pacote com tudo o que cada tipo de widget pode mostrar
  const lastWidget = useRef('');
  const quarter = Math.floor(Date.now() / 900000); // compromissos que acabaram saem a cada 15 min
  const widgetJson = useMemo(
    () =>
      isNativeAndroid
        ? JSON.stringify(buildWidgetPayload(data, todayKey, { style: device.widget || {}, theme: handlers.theme || 'light', accent: handlers.accent || '' }))
        : '',
    [data, todayKey, device.widget, handlers.theme, handlers.accent, quarter] // eslint-disable-line react-hooks/exhaustive-deps
  );
  useEffect(() => {
    if (!isNativeAndroid || widgetJson === lastWidget.current) return undefined;
    const id = setTimeout(() => {
      lastWidget.current = widgetJson;
      updateWidget(JSON.parse(widgetJson));
    }, 1200);
    return () => clearTimeout(id);
  }, [widgetJson]);

  // Lembretes por lugar: uma cerca por lugar com as tarefas pendentes ligadas a ele
  const fenceSig = JSON.stringify([settings.places, (data.tasks || []).filter((t) => t.place && !t.done).map((t) => [t.id, t.title, t.place])]);
  useEffect(() => {
    if (!isNativeAndroid) return;
    const fences = (settings.places || [])
      .map((p) => {
        const tasks = (data.tasks || []).filter((t) => !t.done && t.place === p.id);
        if (!tasks.length) return null;
        return {
          id: p.id,
          lat: p.lat,
          lng: p.lng,
          radius: p.radius || 150,
          title: `Chegou: ${p.name}`,
          body: tasks.length === 1 ? tasks[0].title : `${tasks.length} tarefas: ${tasks.slice(0, 3).map((t) => t.title).join(', ')}`,
        };
      })
      .filter(Boolean);
    setGeofences(fences);
  }, [fenceSig]); // eslint-disable-line react-hooks/exhaustive-deps

  // Ações das notificações: Concluir / Adiar 15 min / Adiar 1h nas tarefas e Feito nos hábitos
  const storeRef = useRef(store);
  storeRef.current = store;
  useEffect(() => {
    if (!isNativeAndroid) return undefined;
    LocalNotifications.registerActionTypes({
      types: [
        {
          id: 'TASK',
          actions: [
            { id: 'done', title: 'Concluir' },
            { id: 'snooze15', title: 'Adiar 15 min' },
            { id: 'snooze', title: 'Adiar 1h' },
          ],
        },
        { id: 'HABIT', actions: [{ id: 'habitDone', title: 'Feito' }] },
      ],
    }).catch(() => {});
    const h = LocalNotifications.addListener('localNotificationActionPerformed', (ev) => {
      const extra = (ev.notification && ev.notification.extra) || {};
      const s = storeRef.current;
      // Tocar no corpo da notificação abre o item correspondente no app
      if (ev.actionId === 'tap') {
        const go = handlersRef.current;
        if (extra.taskId && go.onOpenTask && s.data.tasks.some((x) => x.id === extra.taskId)) go.onOpenTask(extra.taskId);
        else if (extra.eventId && go.onOpenEvent) {
          const e = s.data.events.find((x) => x.id === extra.eventId);
          if (e) go.onOpenEvent(e);
        } else if (extra.habitId && go.onOpenHabit) {
          const hb = s.data.habits.find((x) => x.id === extra.habitId);
          if (hb) go.onOpenHabit(hb);
        }
        return;
      }
      if (extra.habitId && ev.actionId === 'habitDone') {
        const hb = s.data.habits.find((x) => x.id === extra.habitId);
        const day = keyOf(new Date());
        if (hb && countOf(s.data.log, day, hb.id) < hb.target) s.habits.setCount(hb, day, hb.target);
        return;
      }
      if (!extra.taskId) return;
      const t = s.data.tasks.find((x) => x.id === extra.taskId);
      if (!t) return;
      if (ev.actionId === 'done' && !t.done) s.tasks.toggle(t.id);
      if (ev.actionId === 'snooze15') snoozeTask(t, s.data, 15);
      if (ev.actionId === 'snooze') snoozeTask(t, s.data, 60);
    });
    return () => Promise.resolve(h).then((x) => x && x.remove && x.remove());
  }, []);

  // Toques nos widgets (concluir tarefa, marcar hábito) feitos com o app fechado ou em segundo plano
  useEffect(() => {
    if (!isNativeAndroid) return undefined;
    let busyDrain = false;
    const drain = async () => {
      if (busyDrain) return;
      busyDrain = true;
      try {
        const list = collapseWidgetActions(await takeWidgetActions());
        for (const a of list) applyWidgetAction(storeRef.current, a, keyOf(new Date()));
      } finally {
        busyDrain = false;
      }
    };
    drain();
    const off = onWidgetAction(drain);
    const h = NativeApp.addListener('appStateChange', ({ isActive }) => isActive && drain());
    return () => {
      off();
      Promise.resolve(h).then((x) => x && x.remove && x.remove());
    };
  }, []);

  // Endereços ritmo:// abertos pelos widgets (tarefa, nova tarefa, foco, hábitos, agenda...)
  useEffect(() => {
    if (!isNativeAndroid) return undefined;
    let last = '';
    const go = (url) => {
      const link = parseRitmoUrl(url);
      if (!link || !handlersRef.current.onLink) return;
      const sig = `${url}|${Math.floor(Date.now() / 1500)}`;
      if (sig === last) return;
      last = sig;
      // Espera a fila do widget entrar antes de abrir (o toque pode ter acabado de mudar algo)
      setTimeout(() => handlersRef.current.onLink(link), 60);
    };
    NativeApp.getLaunchUrl()
      .then((r) => r && r.url && go(r.url))
      .catch(() => {});
    const h = NativeApp.addListener('appUrlOpen', ({ url }) => go(url));
    return () => Promise.resolve(h).then((x) => x && x.remove && x.remove());
  }, []);

  return locked ? { unlock } : null;
}

export { keyOf, addDays };
