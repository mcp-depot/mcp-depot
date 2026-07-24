let listener = null;

export function setConfirmListener(fn) {
  listener = fn;
}

export function confirmDialog(message, options = {}) {
  return new Promise((resolve) => {
    if (!listener) {
      resolve(window.confirm(message));
      return;
    }
    listener({ message, options, resolve });
  });
}
