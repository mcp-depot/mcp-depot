import { useEffect, useRef } from 'react';

const FOCUSABLE_SELECTOR = 'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

function getFocusable(container) {
  if (!container) return [];
  return Array.from(container.querySelectorAll(FOCUSABLE_SELECTOR));
}

// Escape-to-close, focus trap (Tab wraps within the modal), and focus
// return to the trigger element on close. Attach the returned ref to the
// modal's outer container element.
export function useModalA11y(onClose, isOpen = true) {
  const containerRef = useRef(null);
  const previouslyFocused = useRef(null);
  // Callers pass an inline onClose that gets a new identity on every render
  // (e.g. every keystroke in the modal's form). Reading it through a ref
  // keeps the effect below from depending on that identity, so it only
  // (re)runs - and steals focus to the first focusable element - when the
  // modal actually opens or closes, not on every keystroke.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!isOpen) return;
    previouslyFocused.current = document.activeElement;

    const container = containerRef.current;
    const focusable = getFocusable(container);
    (focusable[0] || container)?.focus();

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onCloseRef.current?.();
        return;
      }
      if (e.key === 'Tab') {
        const current = getFocusable(containerRef.current);
        if (current.length === 0) return;
        const first = current[0];
        const last = current[current.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown, true);
    return () => {
      document.removeEventListener('keydown', handleKeyDown, true);
      previouslyFocused.current?.focus?.();
    };
  }, [isOpen]);

  return containerRef;
}
