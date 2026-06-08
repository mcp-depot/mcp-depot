import { useState, useRef, useEffect } from 'react';
import { MoreHorizontal } from 'lucide-react';

export function DropdownMenu({ children, trigger }) {
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (ref.current && !ref.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        className="btn btn-small"
        onClick={() => setIsOpen(!isOpen)}
        style={{ padding: '0.25rem 0.5rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}
      >
        {trigger || <MoreHorizontal size={16} />}
      </button>
      {isOpen && (
        <div style={{
          position: 'absolute',
          right: 0,
          top: '100%',
          marginTop: '4px',
          minWidth: '160px',
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          zIndex: 100,
          overflow: 'hidden'
        }}>
          {children}
        </div>
      )}
    </div>
  );
}

export function DropdownItem({ onClick, danger, children }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem',
        width: '100%',
        padding: '0.5rem 0.75rem',
        border: 'none',
        background: 'none',
        textAlign: 'left',
        cursor: 'pointer',
        color: danger ? 'var(--danger)' : 'var(--text)',
        fontSize: '0.875rem'
      }}
      onMouseEnter={(e) => {
        e.target.style.background = 'var(--surface-hover)';
      }}
      onMouseLeave={(e) => {
        e.target.style.background = 'none';
      }}
    >
      {children}
    </button>
  );
}

export function DropdownSeparator() {
  return (
    <div style={{ height: '1px', background: 'var(--border)', margin: '4px 0' }} />
  );
}