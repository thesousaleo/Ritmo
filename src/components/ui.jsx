import React, { useEffect, useRef, useState } from 'react';
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
  return (
    <div className="seg" role="radiogroup" aria-label={label} style={{ gridTemplateColumns: `repeat(${options.length}, 1fr)` }}>
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          role="radio"
          aria-checked={value === o.id}
          className={value === o.id ? 'is-on' : ''}
          onClick={() => onChange(o.id)}
        >
          {value === o.id && <motion.span layoutId={`seg-${id}`} className="seg-pill" transition={SPRING.indicator} />}
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
export function Sheet({ desktop, title, onClose, as = 'div', onSubmit, footer, children, style, labelId = 'sheet-title', wide = false }) {
  const drag = useDragControls();
  const panelRef = useRef(null);
  const Panel = as === 'form' ? motion.form : motion.div;

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

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
    <>
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
          className={`sheet${desktop ? ' is-modal' : ''}${wide ? ' is-wide' : ''}`}
          role="dialog"
          aria-modal="true"
          aria-labelledby={labelId}
          onSubmit={onSubmit}
          style={style}
          {...motionProps}
        >
          <div className="sheet-grab" onPointerDown={desktop ? undefined : (e) => drag.start(e)}>
            {!desktop && <span className="handle" aria-hidden="true" />}
            <div className="flex items-center justify-between gap-3">
              <h2 id={labelId} className="sheet-title">
                {title}
              </h2>
              <button type="button" className="icon-btn" onClick={onClose} aria-label="Fechar">
                <Icon name="X" size={18} />
              </button>
            </div>
          </div>
          <div className="sheet-body">{children}</div>
          {footer && <div className="sheet-foot">{footer}</div>}
        </Panel>
      </div>
    </>
  );
}

/** Troca entre dois blocos com fade curto (rodapés com confirmação inline). */
export const swapProps = {
  initial: { opacity: 0, y: 4 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -4 },
  transition: { duration: 0.14, ease: EASE_OUT },
};
