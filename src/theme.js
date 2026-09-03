const STORAGE_KEY = 'trenza.theme';

// Lo que tarda el barrido en cruzar la pantalla, y en qué punto se cambian los
// colores: cuando la franja ya cruzó y tapa la pantalla entera. Cambiarlos antes
// deja ver el corte por el borde que la franja todavía no cubrió.
const SWEEP_MS = 900;
const SWAP_AT = 0.65;

let sweepTimers = [];

/** Sin elección guardada manda el sistema, que es lo que la hoja de estilos ya hace. */
export function getTheme() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved === 'light' || saved === 'dark' ? saved : null;
  } catch {
    return null;
  }
}

/** El tema que se está viendo. Sin elección guardada es el oscuro, el de partida. */
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
    // Sin almacenamiento la elección dura lo que dure la pestaña.
  }

  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = getComputedStyle(document.documentElement).getPropertyValue('--ground').trim();
}

/** Cruza la pantalla con una franja y cambia los colores por detrás del filo. */
function sweep(swap) {
  const veil = document.querySelector('[data-theme-sweep]');
  if (!veil || matchMedia('(prefers-reduced-motion: reduce)').matches) {
    swap();
    return;
  }

  for (const timer of sweepTimers) clearTimeout(timer);
  sweepTimers = [];

  veil.style.setProperty('--sweep-duration', `${SWEEP_MS}ms`);
  // Reiniciar la animación cuando ya estaba corriendo pide sacar la clase y forzar
  // una relectura del estilo antes de volver a ponerla.
  delete document.body.dataset.themeSweep;
  void veil.offsetWidth;
  document.body.dataset.themeSweep = 'true';

  sweepTimers.push(
    setTimeout(swap, SWEEP_MS * SWAP_AT),
    setTimeout(() => {
      delete document.body.dataset.themeSweep;
      sweepTimers = [];
    }, SWEEP_MS + 40),
  );
}

export function toggleTheme() {
  const next = currentTheme() === 'light' ? 'dark' : 'light';
  sweep(() => applyTheme(next));
  return next;
}
