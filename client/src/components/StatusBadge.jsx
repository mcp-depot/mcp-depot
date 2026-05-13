const colours = {
  active: 'bg-green-100 text-green-800',
  inactive: 'bg-gray-100 text-gray-800',
  error: 'bg-red-100 text-red-800',
  pending: 'bg-yellow-100 text-yellow-800',
};

export function StatusBadge({ status }) {
  return (
    <span className={`px-2 py-1 text-xs rounded-full ${colours[status] || colours.inactive}`}>
      {status}
    </span>
  );
}

export default StatusBadge;
