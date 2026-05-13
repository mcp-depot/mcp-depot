export function getApiError(err) {
  return err.response?.data?.message
    || err.response?.data?.error
    || err.message
    || 'An unexpected error occurred';
}
