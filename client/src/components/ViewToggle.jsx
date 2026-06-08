import { LayoutGrid, PanelLeft, List } from 'lucide-react';

export function ViewToggle({ value, onChange }) {
  const options = [
    { mode: 'card', icon: LayoutGrid, label: 'Card view' },
    { mode: 'compact', icon: PanelLeft, label: 'Compact view' },
    { mode: 'list', icon: List, label: 'List view' },
  ];

  return (
    <div style={{
      display: 'flex',
      border: '1px solid var(--border)',
      borderRadius: '6px',
      overflow: 'hidden'
    }}>
      {options.map(({ mode, icon: Icon, label }) => (
        <button
          key={mode}
          title={label}
          onClick={() => onChange(mode)}
          style={{
            padding: '6px 8px',
            border: 'none',
            background: value === mode ? 'var(--primary)' : 'transparent',
            color: value === mode ? 'white' : 'var(--text-dim)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'background 0.15s'
          }}
          onMouseEnter={e => {
            if (value !== mode) e.currentTarget.style.background = 'var(--surface-hover)';
          }}
          onMouseLeave={e => {
            if (value !== mode) e.currentTarget.style.background = 'transparent';
          }}
        >
          <Icon size={16} />
        </button>
      ))}
    </div>
  );
}
