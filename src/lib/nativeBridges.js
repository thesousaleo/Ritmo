/*
 * Efeitos que conversam com o Android: bloqueio por digital, widget da tela inicial,
 * lembretes por lugar e ações das notificações (Concluir / Adiar, Feito nos hábitos).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { App as NativeApp } from '@capacitor/app';
import { LocalNotifications } from '@capacitor/local-notifications';
import { isNativeAndroid, authenticate, updateWidget, setGeofences } from './ritmoNative.js';
import { keyOf, fromKey, addDays, activeHabits, isListed, countOf } from './habits.js';
import { sortTasks } from './tasks.js';
import { snoozeTask } from './native.js';

export function useNativeBridges(store, todayKey) {
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

  // Widget: tarefas de hoje e hábitos do dia
  const widgetSig = JSON.stringify([
    todayKey,
    (data.tasks || []).filter((t) => !t.done && t.date && t.date <= todayKey).map((t) => [t.id, t.title, t.time, t.priority]),
    data.log[todayKey],
    data.habits.map((h) => [h.id, h.name, h.target, h.archived]),
  ]);
  useEffect(() => {
    if (!isNativeAndroid) return undefined;
    const id = setTimeout(() => {
      const day = fromKey(todayKey);
      const tasks = sortTasks((data.tasks || []).filter((t) => !t.done && t.date && t.date <= todayKey)).slice(0, 8);
      const habits = activeHabits(data).filter((h) => isListed(h, day));
      updateWidget({
        date: todayKey,
        tasks: tasks.map((t) => ({ id: t.id, title: t.title, time: t.time || '', late: t.date < todayKey, priority: t.priority })),
        habitsDone: habits.filter((h) => countOf(data.log, todayKey, h.id) >= h.target).length,
        habitsTotal: habits.length,
      });
    }, 1200);
    return () => clearTimeout(id);
  }, [widgetSig]); // eslint-disable-line react-hooks/exhaustive-deps

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

  return locked ? { unlock } : null;
}

export { keyOf, addDays };
