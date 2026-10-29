/* Aplica tema, cor de destaque, densidade e tamanho do texto no documento. */
import { useEffect, useState } from 'react';
import { resolveTheme, isHex, onColor } from './settings.js';
import { colorOf } from './habits.js';

export function useAppearance(settings) {
  const [prefersDark, setPrefersDark] = useState(() => typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!window.matchMedia) return undefined;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const on = () => setPrefersDark(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  // Tema "pelo horário": confere a cada 5 minutos
  useEffect(() => {
    if (settings.theme !== 'hour') return undefined;
    const id = setInterval(() => setTick((t) => t + 1), 300000);
    return () => clearInterval(id);
  }, [settings.theme]);

  const theme = resolveTheme(settings.theme, new Date(), prefersDark);
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = theme;
    root.dataset.density = settings.density === 'compact' ? 'compact' : 'comfy';
    root.style.setProperty('--text-zoom', String(settings.textSize || 1));
    const accent = settings.accent ? (isHex(settings.accent) ? settings.accent : colorOf(settings.accent).value) : '';
    if (accent) {
      root.style.setProperty('--accent', accent);
      root.style.setProperty('--on-accent', onColor(accent));
    } else {
      root.style.removeProperty('--accent');
      root.style.removeProperty('--on-accent');
    }
    const color = theme === 'black' ? '#000000' : theme === 'dark' ? '#0F1412' : '#ECEFE9';
    document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute('content', color));
  }, [theme, settings.density, settings.textSize, settings.accent, tick]);
  return theme;
}
