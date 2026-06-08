export function Skeleton({ className, style, ...props }) {
  return <div className={`skeleton ${className || ''}`} style={style} {...props} />;
}

export function IntegrationCardSkeleton() {
  return (
    <div className="skeleton-card">
      <div className="skeleton skeleton-title"></div>
      <div className="skeleton skeleton-text"></div>
      <div className="skeleton skeleton-text short"></div>
      <div className="skeleton skeleton-badge"></div>
    </div>
  );
}

export function ToolCardSkeleton() {
  return (
    <div className="skeleton-card" style={{ padding: '0.75rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
        <div className="skeleton skeleton-title" style={{ width: '40%', height: '16px' }}></div>
        <div className="skeleton" style={{ width: '60px', height: '20px', borderRadius: '4px' }}></div>
      </div>
      <div className="skeleton skeleton-text"></div>
      <div className="skeleton skeleton-text short"></div>
    </div>
  );
}

export function TableRowSkeleton({ columns = 3 }) {
  return (
    <div className="skeleton-row" style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '0 1rem' }}>
      {Array.from({ length: columns }).map((_, i) => (
        <div key={i} className="skeleton" style={{ flex: i === 0 ? 2 : 1, height: '14px' }}></div>
      ))}
    </div>
  );
}