import { useId } from 'react';
import { useModalA11y } from '../hooks/useModalA11y';

export function Modal({ title, onClose, size = 'md', children, footer }) {
  const maxWidths = { sm: '400px', md: '500px', lg: '700px', xl: '900px' };
  const titleId = useId();
  const containerRef = useModalA11y(onClose);
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        ref={containerRef}
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        style={{ maxWidth: maxWidths[size] }}
        onClick={e => e.stopPropagation()}
      >
        <div className="modal-header">
          <h2 id={titleId}>{title}</h2>
          <button className="modal-close" aria-label="Close" onClick={onClose}>&times;</button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  );
}

export default Modal;
