import React, { useEffect } from 'react';
import { motion } from 'framer-motion';
import { Icon, Portal } from './ui.jsx';
import { BrandMark } from './Nav.jsx';

/** Tela de bloqueio (APK com digital/rosto ativado). Pede a biometria ao aparecer. */
export function LockScreen({ onUnlock }) {
  useEffect(() => {
    onUnlock();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Portal>
      <motion.div className="lock" initial={{ opacity: 1 }} exit={{ opacity: 0 }}>
        <BrandMark size={44} />
        <p className="lock-title">Ritmo está bloqueado</p>
        <button type="button" className="btn-primary" onClick={onUnlock}>
          <Icon name="Fingerprint" size={18} /> Desbloquear
        </button>
      </motion.div>
    </Portal>
  );
}
