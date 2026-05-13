import { useState, useCallback } from 'react';
import api from '../api/axios';

export function useDeleteConfirm(endpoint, onDeleted) {
  const [deleteId, setDeleteId] = useState(null);

  const confirmDelete = useCallback((id) => setDeleteId(id), []);
  const cancel = useCallback(() => setDeleteId(null), []);

  const doDelete = useCallback(async () => {
    if (!deleteId) return;
    try {
      await api.delete(`${endpoint}/${deleteId}`);
      onDeleted(deleteId);
      setDeleteId(null);
    } catch (err) {
      console.error('Delete failed:', err);
    }
  }, [deleteId, endpoint, onDeleted]);

  return { deleteId, confirmDelete, cancel, doDelete };
}
