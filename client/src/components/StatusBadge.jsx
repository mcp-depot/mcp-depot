const classMap = {
  active: 'badge badge-success',
  inactive: 'badge badge-warning',
  error: 'badge badge-danger',
  system: 'badge badge-system',
  info: 'badge badge-info',
};

export function StatusBadge({ status, label }) {
  return <span className={classMap[status] || 'badge'}>{label || status}</span>;
}

export default StatusBadge;
