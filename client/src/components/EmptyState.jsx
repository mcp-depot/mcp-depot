export function EmptyState({ icon: Icon, title, description, actionLabel, onAction }) {
  return (
    <div className="text-center py-12">
      {Icon && <Icon className="mx-auto h-12 w-12 text-gray-400" />}
      <h3 className="mt-2 text-sm font-medium text-gray-900">{title}</h3>
      {description && <p className="mt-1 text-sm text-gray-500">{description}</p>}
      {actionLabel && onAction && (
        <button onClick={onAction} className="mt-4 inline-flex items-center px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-md hover:bg-indigo-700">
          {actionLabel}
        </button>
      )}
    </div>
  );
}

export default EmptyState;
