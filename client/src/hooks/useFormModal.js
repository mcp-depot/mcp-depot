import { useState, useCallback } from 'react';

export function useFormModal(defaults = {}) {
  const [open, setOpen] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [formData, setFormData] = useState(defaults);
  const [saving, setSaving] = useState(false);

  const openCreate = useCallback(() => {
    setEditItem(null);
    setFormData(defaults);
    setOpen(true);
  }, [defaults]);

  const openEdit = useCallback((item) => {
    setEditItem(item);
    setFormData(item);
    setOpen(true);
  }, []);

  const close = useCallback(() => {
    setOpen(false);
    setEditItem(null);
  }, []);

  return { open, editItem, formData, setFormData, saving, setSaving, openCreate, openEdit, close };
}
