/*
 * Arrastar e soltar por ponteiro (mouse, toque e caneta) sem bibliotecas.
 * - Mouse: começa depois de 5 px de movimento.
 * - Toque: segurar 300 ms (sem mexer) e arrastar; a rolagem da página continua normal num toque rápido.
 * - Um "fantasma" (cópia do elemento) segue o dedo; o alvo é o elemento com [data-drop] sob o ponteiro.
 * - Quem precisa reagir (agenda, matriz, Kanban) escuta com useDragMonitor.
 */
import { useEffect, useRef } from 'react';

const listeners = new Set();
let active = null;

function emit(phase, extra = {}) {
  const payload = { phase, data: active && active.data, offY: active ? active.offY : 0, ...extra };
  for (const fn of listeners) fn(payload);
}

export const isDragging = () => !!active;

function targetAt(x, y) {
  if (!active) return null;
  active.ghost.style.visibility = 'hidden';
  const el = document.elementFromPoint(x, y);
  active.ghost.style.visibility = '';
  return el ? el.closest('[data-drop]') : null;
}

let scrollRaf = 0;
function autoScroll() {
  cancelAnimationFrame(scrollRaf);
  if (!active) return;
  const { x, y } = active;
  const el = document.elementFromPoint(x, y);
  const box = el && el.closest('[data-autoscroll]');
  if (box) {
    const r = box.getBoundingClientRect();
    const edge = 56;
    let dx = 0;
    let dy = 0;
    if (y < r.top + edge) dy = -Math.ceil((r.top + edge - y) / 4);
    else if (y > r.bottom - edge) dy = Math.ceil((y - (r.bottom - edge)) / 4);
    if (x < r.left + edge) dx = -Math.ceil((r.left + edge - x) / 4);
    else if (x > r.right - edge) dx = Math.ceil((x - (r.right - edge)) / 4);
    if (dx || dy) {
      box.scrollBy(dx, dy);
      move(x, y, true);
    }
  }
  scrollRaf = requestAnimationFrame(autoScroll);
}

function move(x, y, fromScroll) {
  if (!active) return;
  active.x = x;
  active.y = y;
  if (!fromScroll) active.ghost.style.transform = `translate3d(${x - active.offX}px, ${y - active.offY}px, 0) scale(1.03)`;
  const target = targetAt(x, y);
  if (target !== active.target) {
    if (active.target) active.target.classList.remove('is-drop-over');
    if (target) target.classList.add('is-drop-over');
    active.target = target;
  }
  emit('move', { x, y, target });
}

const preventTouchScroll = (e) => {
  if (active) e.preventDefault();
};

function finish(x, y, cancelled) {
  if (!active) return;
  const a = active;
  const target = cancelled ? null : targetAt(x, y);
  if (a.target) a.target.classList.remove('is-drop-over');
  cancelAnimationFrame(scrollRaf);
  document.removeEventListener('touchmove', preventTouchScroll);
  document.body.classList.remove('is-dragging');
  a.source.classList.remove('is-drag-source');
  emit(target ? 'drop' : 'cancel', { x, y, target });
  active = null;
  if (target) {
    a.ghost.remove();
  } else {
    // Volta para a origem: curto e com ease-out
    const r = a.source.getBoundingClientRect();
    a.ghost.style.transition = 'transform 180ms cubic-bezier(.23,1,.32,1), opacity 180ms';
    a.ghost.style.transform = `translate3d(${r.left}px, ${r.top}px, 0) scale(1)`;
    a.ghost.style.opacity = '0';
    setTimeout(() => a.ghost.remove(), 200);
  }
  // O clique que vem depois de soltar não deve abrir o item
  const block = (e) => {
    e.stopPropagation();
    e.preventDefault();
  };
  window.addEventListener('click', block, { capture: true, once: true });
  setTimeout(() => window.removeEventListener('click', block, { capture: true }), 50);
  if (target && a.onDrop) a.onDrop(target, { x, y, data: a.data });
}

function begin(source, data, x, y, onDrop) {
  const r = source.getBoundingClientRect();
  const ghost = source.cloneNode(true);
  ghost.classList.add('drag-ghost');
  Object.assign(ghost.style, {
    position: 'fixed',
    left: '0px',
    top: '0px',
    width: `${r.width}px`,
    height: `${r.height}px`,
    margin: '0',
    zIndex: '200',
    pointerEvents: 'none',
    transform: `translate3d(${r.left}px, ${r.top}px, 0)`,
  });
  document.body.appendChild(ghost);
  active = { source, data, ghost, offX: x - r.left, offY: y - r.top, target: null, x, y, onDrop };
  source.classList.add('is-drag-source');
  document.body.classList.add('is-dragging');
  document.addEventListener('touchmove', preventTouchScroll, { passive: false });
  try {
    if (navigator.vibrate) navigator.vibrate(8);
  } catch (e) {
    /* sem vibração */
  }
  emit('start', { x, y });
  move(x, y);
  scrollRaf = requestAnimationFrame(autoScroll);
}

/**
 * Props para tornar um elemento arrastável: <div {...dragProps(data, onDrop)} />.
 * onDrop(targetEl, { x, y, data }) é chamado ao soltar sobre um [data-drop].
 */
export function dragProps(data, onDrop, { disabled = false } = {}) {
  if (disabled) return {};
  return {
    onPointerDown(e) {
      if (e.button !== 0 || active) return;
      if (e.target.closest('button, input, textarea, select, a, [data-nodrag]')) return;
      const source = e.currentTarget;
      const sx = e.clientX;
      const sy = e.clientY;
      const touch = e.pointerType !== 'mouse';
      let started = false;
      let timer = null;
      let lx = sx;
      let ly = sy;
      const cleanup = () => {
        clearTimeout(timer);
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('pointercancel', onCancel);
      };
      const onMove = (ev) => {
        lx = ev.clientX;
        ly = ev.clientY;
        if (started) {
          move(lx, ly);
          return;
        }
        const dist = Math.hypot(lx - sx, ly - sy);
        if (touch) {
          if (dist > 8) cleanup(); // é rolagem, não arrasto
        } else if (dist > 5) {
          started = true;
          begin(source, data, lx, ly, onDrop);
        }
      };
      const onUp = (ev) => {
        cleanup();
        if (started) finish(ev.clientX, ev.clientY, false);
      };
      const onCancel = () => {
        cleanup();
        if (started) finish(lx, ly, true);
      };
      if (touch) {
        timer = setTimeout(() => {
          started = true;
          begin(source, data, lx, ly, onDrop);
        }, 300);
      }
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onCancel);
    },
    onContextMenu(e) {
      // Segurar no Android abre o menu de contexto; durante o arrasto ele atrapalha
      if (e.nativeEvent && e.nativeEvent.pointerType !== 'mouse') e.preventDefault();
    },
  };
}

/** Recebe { phase: start|move|drop|cancel, data, x, y, target } enquanto algo é arrastado. */
export function useDragMonitor(fn) {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    const l = (p) => ref.current(p);
    listeners.add(l);
    return () => listeners.delete(l);
  }, []);
}
