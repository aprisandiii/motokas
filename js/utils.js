// utils.js

export function rupiah(num) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR'
  }).format(num);
}

export function formatTanggal(date) {
  return new Date(date).toLocaleDateString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });
}

export function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

export function debounce(fn, delay = 300) {
  let timeout;

  return (...args) => {
    clearTimeout(timeout);

    timeout = setTimeout(() => {
      fn(...args);
    }, delay);
  };
}
