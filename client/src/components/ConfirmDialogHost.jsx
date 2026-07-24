import { useEffect, useState } from 'react';
import { Modal } from './Modal';
import { setConfirmListener } from '../utils/confirm';

export function ConfirmDialogHost() {
  const [request, setRequest] = useState(null);

  useEffect(() => {
    setConfirmListener((req) => setRequest(req));
    return () => setConfirmListener(null);
  }, []);

  if (!request) return null;

  const { message, options, resolve } = request;
  const { title = 'Please confirm', confirmLabel = 'Confirm', cancelLabel = 'Cancel', danger = false } = options;

  const close = (result) => {
    resolve(result);
    setRequest(null);
  };

  return (
    <Modal
      title={title}
      onClose={() => close(false)}
      size="sm"
      footer={
        <>
          <button className="btn btn-secondary" onClick={() => close(false)}>{cancelLabel}</button>
          <button className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`} onClick={() => close(true)} autoFocus>
            {confirmLabel}
          </button>
        </>
      }
    >
      <p style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{message}</p>
    </Modal>
  );
}

export default ConfirmDialogHost;
