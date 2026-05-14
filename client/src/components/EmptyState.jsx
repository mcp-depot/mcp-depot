export function EmptyState({ icon, title, description, actionLabel, onAction }) {
  return (
    <div className="empty-state-dashed">
      {icon && <div className="empty-icon">{icon}</div>}
      <h3>{title}</h3>
      {description && <p>{description}</p>}
      {actionLabel && onAction && (
        <div style={{ marginTop: '1rem' }}>
          <button className="btn btn-primary" onClick={onAction}>{actionLabel}</button>
        </div>
      )}
    </div>
  );
}

export default EmptyState;
