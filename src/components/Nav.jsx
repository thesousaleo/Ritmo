import React from 'react';
import { motion } from 'framer-motion';
import { Icon, SPRING } from './ui.jsx';
import { statusText } from './Today.jsx';

const TABS = [
  { id: 'today', label: 'Hoje', icon: 'CalendarCheck', key: '1' },
  { id: 'stats', label: 'Consistência', icon: 'Activity', key: '2' },
];

export function TabBar({ tab, onTab, onCreate }) {
  const renderTab = (t) => (
    <button key={t.id} type="button" className={`tab${tab === t.id ? ' is-on' : ''}`} onClick={() => onTab(t.id)} aria-current={tab === t.id ? 'page' : undefined}>
      <span className="tab-icon">
        <Icon name={t.icon} size={22} strokeWidth={tab === t.id ? 2.3 : 1.9} />
        {tab === t.id && <motion.span layoutId="tab-dot" className="tab-dot" transition={SPRING.indicator} />}
      </span>
      <span className="tab-label">{t.label}</span>
    </button>
  );
  return (
    <nav className="tabbar" aria-label="Navegação">
      <div className="tabbar-inner">
        {renderTab(TABS[0])}
        <motion.button type="button" className="fab" onClick={onCreate} whileTap={{ scale: 0.92 }} transition={SPRING.press} aria-label="Novo hábito">
          <Icon name="Plus" size={26} strokeWidth={2.4} />
        </motion.button>
        {renderTab(TABS[1])}
      </div>
    </nav>
  );
}

export function BrandMark({ size = 26 }) {
  const colors = ['#2A9FD6', '#1FAA78', '#E39A2A', '#E0507F', '#8A6BEF'];
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      {colors.map((c, i) => {
        const a0 = ((i * 72 + 9 - 90) * Math.PI) / 180;
        const a1 = ((i * 72 + 63 - 90) * Math.PI) / 180;
        const r = 12;
        return (
          <path
            key={c}
            d={`M ${16 + r * Math.cos(a0)} ${16 + r * Math.sin(a0)} A ${r} ${r} 0 0 1 ${16 + r * Math.cos(a1)} ${16 + r * Math.sin(a1)}`}
            fill="none"
            stroke={c}
            strokeWidth="4.5"
            strokeLinecap="round"
          />
        );
      })}
    </svg>
  );
}

export function Sidebar({ tab, onTab, onCreate, onAccount, user, name, status }) {
  return (
    <aside className="sidebar" aria-label="Navegação">
      <div className="brand">
        <BrandMark />
        <span>Ritmo</span>
      </div>

      <nav className="side-nav">
        {TABS.map((t) => (
          <button key={t.id} type="button" className={`side-item${tab === t.id ? ' is-on' : ''}`} onClick={() => onTab(t.id)} aria-current={tab === t.id ? 'page' : undefined}>
            {tab === t.id && <motion.span layoutId="side-pill" className="side-pill" transition={SPRING.indicator} />}
            <Icon name={t.icon} size={19} strokeWidth={tab === t.id ? 2.3 : 1.9} />
            <span className="flex-1">{t.label}</span>
            <kbd className="kbd">{t.key}</kbd>
          </button>
        ))}
      </nav>

      <button type="button" className="side-new" onClick={onCreate}>
        <Icon name="Plus" size={18} strokeWidth={2.4} />
        <span className="flex-1">Novo hábito</span>
        <kbd className="kbd on-accent">N</kbd>
      </button>

      <button type="button" className="side-account" onClick={onAccount}>
        <span className="avatar sm">
          {(name || '').trim().charAt(0).toUpperCase() || <Icon name="User" size={16} />}
          <span className={`sync-dot is-${status}`} aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1 text-left">
          <span className="side-account-name truncate">{user ? name || user.email : 'Entrar para sincronizar'}</span>
          <span className="side-account-status">{statusText(status)}</span>
        </span>
      </button>
    </aside>
  );
}
