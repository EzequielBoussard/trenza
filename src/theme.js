const STORAGE_KEY = 'trenza.theme';

/** La elección guardada, o null: sin elección queda el oscuro. */
export function getTheme() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved === 'light' || saved === 'dark' ? saved : null;
  } catch {
    return null;
  }
}

export function currentTheme() {
  return getTheme() ?? 'dark';
}

export function applyTheme(theme) {
  if (theme) {
    document.documentElement.dataset.theme = theme;
  } else {
    delete document.documentElement.dataset.theme;
  }

  try {
    if (theme) localStorage.setItem(STORAGE_KEY, theme);
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Sin almacenamiento la elección dura lo que la pestaña.
  }

  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = getComputedStyle(document.documentElement).getPropertyValue('--ground').trim();
}

export function toggleTheme() {
  const next = currentTheme() === 'light' ? 'dark' : 'light';
  applyTheme(next);
  return next;
}
