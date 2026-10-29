import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, useDragControls, useSpring, useTransform } from 'framer-motion';
import * as Icons from 'lucide-react';

/* ------------------------------------------------------------------ */
/* Motion tokens                                                       */
/* ------------------------------------------------------------------ */
// Curva ease-out forte (Emil Kowalski) para entradas, saídas e feedback.
export const EASE_OUT = [0.23, 1, 0.32, 1];
export const SPRING = {
  indicator: { type: 'spring', stiffness: 520, damping: 40, mass: 0.8 },
  sheet: { type: 'spring', stiffness: 380, damping: 36, mass: 0.9 },
  modal: { type: 'spring', stiffness: 520, damping: 38, mass: 0.8 },
  pop: { type: 'spring', stiffness: 640, damping: 24, mass: 0.7 },
  progress: { type: 'spring', stiffness: 220, damping: 30 },
  press: { type: 'spring', stiffness: 900, damping: 40 },
};

export function useMediaQuery(query) {
  const get = () => typeof window !== 'undefined' && window.matchMedia && window.matchMedia(query).matches;
  const [matches, setMatches] = useState(get);
  useEffect(() => {
    if (!window.matchMedia) return undefined;
    const mq = window.matchMedia(query);
    const onChange = () => setMatches(mq.matches);
    onChange();
    mq.addEventListener ? mq.addEventListener('change', onChange) : mq.addListener(onChange);
    return () => (mq.removeEventListener ? mq.removeEventListener('change', onChange) : mq.removeListener(onChange));
  }, [query]);
  return matches;
}

export function Icon({ name, size = 20, strokeWidth = 2, ...rest }) {
  const Cmp = Icons[name];
  if (!Cmp) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} aria-hidden="true" {...rest}>
        <circle cx="12" cy="12" r="8" />
      </svg>
    );
  }
  return <Cmp size={size} strokeWidth={strokeWidth} aria-hidden="true" {...rest} />;
}

export function AnimatedNumber({ value }) {
  const mv = useSpring(value, { stiffness: 260, damping: 34 });
  useEffect(() => {
    mv.set(value);
  }, [value, mv]);
  const rounded = useTransform(mv, (v) => Math.round(v));
  return <motion.span>{rounded}</motion.span>;
}

/** Número que troca com um deslize curto de 6px — só depois da primeira renderização. */
export function RollingNumber({ value }) {
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
  }, []);
  return (
    <span className="roll">
      <motion.span
        key={value}
        initial={mounted.current ? { y: 6, opacity: 0 } : false}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.2, ease: EASE_OUT }}
      >
        {value}
      </motion.span>
    </span>
  );
}

export function Segmented({ id, options, value, onChange, label }) {
  // Pílula única que desliza até o botão ativo (medido). Sem layoutId: dentro de painéis que saem com
  // animação, elementos com layoutId podem segurar a saída e deixar uma camada invisível sobre o app.
  const boxRef = useRef(null);
  const [pill, setPill] = useState(null);
  const idx = options.findIndex((o) => o.id === value);
  useLayoutEffectSafe(() => {
    const box = boxRef.current;
    if (!box) return undefined;
    const measure = () => {
      const btn = box.querySelectorAll('button')[idx];
      setPill(btn ? { x: btn.offsetLeft, w: btn.offsetWidth } : null);
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(measure);
    ro.observe(box);
    return () => ro.disconnect();
  }, [idx, options.length]);
  return (
    <div ref={boxRef} className="seg" role="radiogroup" aria-label={label} style={{ gridTemplateColumns: `repeat(${options.length}, 1fr)` }}>
      {pill && (
        <motion.span
          className="seg-pill is-slider"
          aria-hidden="true"
          initial={false}
          animate={{ x: pill.x, width: pill.w }}
          transition={SPRING.indicator}
        />
      )}
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          role="radio"
          aria-checked={value === o.id}
          aria-label={o.ariaLabel}
          title={o.ariaLabel}
          className={value === o.id ? 'is-on' : ''}
          onClick={() => onChange(o.id)}
          data-seg={id}
        >
          <span className="relative">{o.label}</span>
        </button>
      ))}
    </div>
  );
}

/**
 * Painel modal responsivo.
 * Celular: bottom sheet com mola na entrada, arrasto para fechar e saída curta.
 * Desktop: diálogo centralizado (escala 0.96 → 1 + opacidade), sem arrasto.
 */
export function Sheet({ desktop, title, onClose, as = 'div', onSubmit, footer, children, style, labelId = 'sheet-title', wide = false, header, className = '', bodyClassName = '' }) {
  const drag = useDragControls();
  const panelRef = useRef(null);
  const Panel = as === 'form' ? motion.form : motion.div;

  useEscape(onClose);

  // Foco vai para o painel ao abrir e volta para quem abriu ao fechar
  useEffect(() => {
    const prev = document.activeElement;
    if (desktop && panelRef.current) panelRef.current.focus({ preventScroll: true });
    return () => {
      if (prev && prev.focus) prev.focus({ preventScroll: true });
    };
  }, [desktop]);

  const motionProps = desktop
    ? {
        initial: { opacity: 0, scale: 0.96, y: 8 },
        animate: { opacity: 1, scale: 1, y: 0 },
        exit: { opacity: 0, scale: 0.97, y: 4, transition: { duration: 0.15, ease: EASE_OUT } },
        transition: SPRING.modal,
      }
    : {
        initial: { y: '100%' },
        animate: { y: 0 },
        exit: { y: '100%', transition: { duration: 0.22, ease: EASE_OUT } },
        transition: SPRING.sheet,
        drag: 'y',
        dragControls: drag,
        dragListener: false,
        dragConstraints: { top: 0, bottom: 0 },
        dragElastic: { top: 0.04, bottom: 0.8 },
        onDragEnd: (e, info) => {
          if (info.offset.y > 110 || info.velocity.y > 600) onClose();
        },
      };

  return (
    <Portal>
      <motion.div
        className="backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0, transition: { duration: 0.18, ease: EASE_OUT } }}
        transition={{ duration: 0.24, ease: EASE_OUT }}
        onClick={onClose}
      />
      <div className={desktop ? 'modal-wrap' : 'sheet-wrap'}>
        <Panel
          ref={panelRef}
          tabIndex={-1}
          className={`sheet${desktop ? ' is-modal' : ''}${wide ? ' is-wide' : ''} ${className}`}
          role="dialog"
          aria-modal="true"
          aria-labelledby={labelId}
          onSubmit={onSubmit}
          style={style}
          {...motionProps}
        >
          <div className="sheet-grab" onPointerDown={desktop ? undefined : (e) => drag.start(e)}>
            {!desktop && <span className="handle" aria-hidden="true" />}
            {header || (
              <div className="flex items-center justify-between gap-3">
                <h2 id={labelId} className="sheet-title">
                  {title}
                </h2>
                <button type="button" className="icon-btn" onClick={onClose} aria-label="Fechar">
                  <Icon name="X" size={18} />
                </button>
              </div>
            )}
          </div>
          <div className={`sheet-body ${bodyClassName}`}>{children}</div>
          {footer && <div className="sheet-foot">{footer}</div>}
        </Panel>
      </div>
    </Portal>
  );
}

/** Troca entre dois blocos com fade curto (rodapés com confirmação inline). */
export const swapProps = {
  initial: { opacity: 0, y: 4 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -4 },
  transition: { duration: 0.14, ease: EASE_OUT },
};

/** Renderiza no body: camadas fixas não podem herdar transform de ancestrais animados. */
export function Portal({ children }) {
  if (typeof document === 'undefined' || !document.body) return children;
  return createPortal(children, document.body);
}

/* ------------------------------------------------------------------ */
/* Esc fecha só a camada de cima                                       */
/* ------------------------------------------------------------------ */
const escStack = [];
export function useEscape(onClose, active = true) {
  const ref = useRef(onClose);
  ref.current = onClose;
  useEffect(() => {
    if (!active) return undefined;
    const token = {};
    escStack.push(token);
    const onKey = (e) => {
      if (e.key === 'Escape' && escStack[escStack.length - 1] === token) {
        e.stopPropagation();
        ref.current();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      const i = escStack.indexOf(token);
      if (i >= 0) escStack.splice(i, 1);
    };
  }, [active]);
}
export const hasOpenLayer = () => escStack.length > 0;

/* ------------------------------------------------------------------ */
/* Popover: ancorado no gatilho (desktop) ou bottom sheet (celular)    */
/* ------------------------------------------------------------------ */
export function Popover({ anchor, desktop, onClose, title, children, width = 300, align = 'start', footer }) {
  const panelRef = useRef(null);
  const [pos, setPos] = useState(null);
  useEscape(onClose, desktop);

  useLayoutEffectSafe(() => {
    if (!desktop || !anchor) return;
    const el = panelRef.current;
    const h = el ? el.offsetHeight : 320;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const below = anchor.bottom + 6;
    const fitsBelow = below + h < vh - 12;
    const top = fitsBelow ? below : Math.max(12, anchor.top - 6 - h);
    let left = align === 'end' ? anchor.right - width : anchor.left;
    left = Math.max(12, Math.min(left, vw - width - 12));
    setPos({ top, left, origin: `${Math.round(anchor.left + anchor.width / 2 - left)}px ${fitsBelow ? 0 : h}px` });
  }, [desktop, anchor, width, align]);

  useEffect(() => {
    if (!desktop) return undefined;
    const onDown = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) onClose();
    };
    const id = setTimeout(() => window.addEventListener('pointerdown', onDown, true), 0);
    return () => {
      clearTimeout(id);
      window.removeEventListener('pointerdown', onDown, true);
    };
  }, [desktop, onClose]);

  if (!desktop) {
    return (
      <Sheet desktop={false} title={title || ''} onClose={onClose} footer={footer} className="is-compact">
        {children}
      </Sheet>
    );
  }
  return (
    <Portal>
    <motion.div
      ref={panelRef}
      className="popover"
      role="dialog"
      aria-label={title}
      style={{ width, top: pos ? pos.top : -9999, left: pos ? pos.left : -9999, transformOrigin: pos ? pos.origin : 'top left' }}
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.98, transition: { duration: 0.1, ease: EASE_OUT } }}
      transition={{ duration: 0.14, ease: EASE_OUT }}
    >
      {children}
      {footer && <div className="popover-foot">{footer}</div>}
    </motion.div>
    </Portal>
  );
}

function useLayoutEffectSafe(fn, deps) {
  const useIso = typeof window !== 'undefined' ? React.useLayoutEffect : useEffect;
  useIso(fn, deps); // eslint-disable-line react-hooks/exhaustive-deps
}

/** Estado de um popover: abre a partir do elemento clicado. */
export function usePopover() {
  const [state, setState] = useState(null);
  return {
    state,
    open: (e, payload) => setState({ anchor: e.currentTarget.getBoundingClientRect(), payload }),
    close: () => setState(null),
  };
}

export function MenuList({ items, onPick }) {
  return (
    <ul className="menu" role="menu">
      {items.map((it) =>
        it.divider ? (
          <li key={it.key || Math.random()} className="menu-divider" role="separator" />
        ) : (
          <li key={it.key ?? it.value ?? it.label} role="none">
            <button
              type="button"
              role="menuitem"
              className={`menu-item${it.active ? ' is-on' : ''}${it.danger ? ' is-danger' : ''}`}
              onClick={() => onPick(it)}
              style={it.color ? { '--c': it.color } : undefined}
            >
              {it.icon && <Icon name={it.icon} size={17} className="menu-icon" />}
              {it.dot && <span className="menu-dot" style={{ background: it.dot }} />}
              <span className="flex-1 min-w-0 truncate">{it.label}</span>
              {it.hint && <span className="menu-hint">{it.hint}</span>}
              {it.active && <Icon name="Check" size={16} className="menu-check" />}
            </button>
          </li>
        )
      )}
    </ul>
  );
}

/* ------------------------------------------------------------------ */
/* Caixa de seleção de tarefa (quadrada, cor da prioridade)            */
/* ------------------------------------------------------------------ */
export function TaskCheck({ checked, priority = 0, onToggle, label, size = 22 }) {
  const color = ['var(--p-none)', 'var(--p-low)', 'var(--p-med)', 'var(--p-high)'][priority] || 'var(--p-none)';
  return (
    <motion.button
      type="button"
      className={`tcheck${checked ? ' is-on' : ''}`}
      style={{ '--pc': color, width: size + 22, height: size + 22 }}
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      whileTap={{ scale: 0.86 }}
      transition={SPRING.press}
      aria-pressed={checked}
      aria-label={label}
      data-nodrag
    >
      <span className="tcheck-box" style={{ width: size, height: size }}>
        <motion.span
          className="tcheck-fill"
          initial={false}
          animate={checked ? { scale: 1, opacity: 1 } : { scale: 0.5, opacity: 0 }}
          transition={checked ? SPRING.pop : { duration: 0.12, ease: EASE_OUT }}
        />
        <svg viewBox="0 0 24 24" className="tcheck-mark" aria-hidden="true">
          <motion.path
            d="M6 12.5l4 4L18 8"
            initial={false}
            animate={{ pathLength: checked ? 1 : 0, opacity: checked ? 1 : 0 }}
            transition={checked ? { duration: 0.2, ease: EASE_OUT, delay: 0.04 } : { duration: 0.08 }}
          />
        </svg>
      </span>
    </motion.button>
  );
}

/** Textarea que cresce com o conteúdo. */
export function AutoTextarea({ value, onChange, className = '', minRows = 1, ...rest }) {
  const ref = useRef(null);
  useLayoutEffectSafe(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);
  return <textarea ref={ref} rows={minRows} value={value} onChange={onChange} className={`autotext ${className}`} {...rest} />;
}
