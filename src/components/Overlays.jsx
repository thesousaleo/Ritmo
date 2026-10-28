import React, { useEffect } from 'react';
import { motion } from 'framer-motion';
import { Icon, EASE_OUT } from './ui.jsx';
import { colorOf, streakUnit, isWeekly } from '../lib/habits.js';

/** Aviso curto com ação de desfazer. Some sozinho em 5 s. */
export function Toast({ toast, onAction, onDismiss, desktop }) {
  useEffect(() => {
    const id = setTimeout(onDismiss, 5000);
    return () => clearTimeout(id);
  }, [toast.id, onDismiss]);
  return (
    <div className={`toast-wrap${desktop ? ' is-desktop' : ''}`}>
      <motion.div
        className="toast"
        role="status"
        initial={{ opacity: 0, y: 14, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 8, transition: { duration: 0.15, ease: EASE_OUT } }}
        transition={{ type: 'spring', stiffness: 520, damping: 36 }}
      >
        <span className="flex-1 min-w-0">{toast.text}</span>
        {toast.actionLabel && (
          <button type="button" className="toast-action" onClick={onAction}>
            {toast.actionLabel}
          </button>
        )}
      </motion.div>
    </div>
  );
}

/** Celebração de marco (7, 30, 100, 365 dias; 4, 12, 26, 52 semanas). Rara por natureza, então pode ter um pouco de vida. */
export function Celebration({ habit, value, onDismiss }) {
  useEffect(() => {
    const id = setTimeout(onDismiss, 3200);
    return () => clearTimeout(id);
  }, [onDismiss]);
  const c = colorOf(habit.color);
  return (
    <motion.div
      className="celebrate"
      onClick={onDismiss}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.2 } }}
      transition={{ duration: 0.2 }}
      style={{ '--c': c.value, '--on': c.on }}
      role="alert"
    >
      <motion.div
        className="celebrate-card"
        initial={{ scale: 0.9, y: 12 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.96, opacity: 0, transition: { duration: 0.16 } }}
        transition={{ type: 'spring', stiffness: 420, damping: 22 }}
      >
        <div className="celebrate-medal">
          <motion.span
            className="celebrate-pulse"
            initial={{ scale: 0.8, opacity: 0.55 }}
            animate={{ scale: 1.7, opacity: 0 }}
            transition={{ duration: 0.9, ease: EASE_OUT, delay: 0.1 }}
          />
          <motion.span className="celebrate-num" initial={{ scale: 0.6 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 500, damping: 16, delay: 0.08 }}>
            {value}
          </motion.span>
        </div>
        <p className="celebrate-title">
          {value} {streakUnit(habit, value)} {isWeekly(habit) ? 'seguidas' : 'seguidos'}
        </p>
        <p className="celebrate-text">
          <Icon name={habit.icon} size={16} /> {habit.name}
        </p>
        <p className="celebrate-hint">Toque para continuar</p>
      </motion.div>
    </motion.div>
  );
}
