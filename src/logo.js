// Cada hilo de logo.svg son dos tramos en S de 120 × 176, con los controles a mitad del tramo.
const LEFT = 136;
const TOP = 168;
const WIDTH = 120;
const HEIGHT = 176;
const DURATION = 900;
const SHINE_START = 0.3;

// La S normalizada: x(t) = 1,5t − 1,5t² + t³ e y(t) = 3t² − 2t³.
const sx = (t) => t * (1.5 - 1.5 * t + t * t);
const sy = (t) => t * t * (3 - 2 * t);
const dsx = (t) => 1.5 - 3 * t + 3 * t * t;
const dsy = (t) => 6 * t * (1 - t);

// x(t) crece siempre (la derivada no baja de 0,75), así que Newton converge desde t = x.
function paramAt(x) {
  let t = x;
  for (let i = 0; i < 4; i++) t -= (sx(t) - x) / dsx(t);
  return t;
}

const round = (value) => Math.round(value * 10) / 10;

/** El hilo corrido `shift` tramos a la derecha y recortado a los dos tramos del logo. */
export function strandPath(shift, falling) {
  let path = '';
  for (let k = Math.floor(-shift); k < 2 - shift; k++) {
    const sign = ((k & 1) === 0) === falling ? 1 : -1;
    const top = sign > 0 ? TOP : TOP + HEIGHT;
    const at = (t) => [LEFT + WIDTH * (k + shift + sx(t)), top + sign * HEIGHT * sy(t)];
    const slope = (t) => [WIDTH * dsx(t), sign * HEIGHT * dsy(t)];

    // El pedazo de S que cae adentro sigue siendo una cúbica: se recorta con sus tangentes.
    const from = paramAt(Math.max(0, -shift - k));
    const to = paramAt(Math.min(1, 2 - shift - k));
    const reach = (to - from) / 3;
    const [x0, y0] = at(from);
    const [x3, y3] = at(to);
    const [dx0, dy0] = slope(from);
    const [dx3, dy3] = slope(to);

    if (!path) path = `M${round(x0)} ${round(y0)}`;
    path += `C${round(x0 + dx0 * reach)} ${round(y0 + dy0 * reach)} `
      + `${round(x3 - dx3 * reach)} ${round(y3 - dy3 * reach)} ${round(x3)} ${round(y3)}`;
  }
  return path;
}

let frame = 0;

// La trenza gira una vuelta hacia el nombre y, cuando la vuelta ya va por la mitad, los
// colores de los hilos lo cruzan. Un solo reloj para las dos cosas: siempre van juntas.
export function weave(home) {
  if (frame || matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const [first, last] = home.querySelectorAll('path');
  const name = home.querySelector('.masthead__name');
  const start = performance.now();
  const step = (now) => {
    const progress = Math.min(1, (now - start) / DURATION);
    // Una vuelta son dos tramos; con el coseno arranca y frena sin salto.
    const shift = 1 - Math.cos(Math.PI * progress);
    first.setAttribute('d', strandPath(shift, true));
    last.setAttribute('d', strandPath(shift, false));

    const shine = Math.max(0, (progress - SHINE_START) / (1 - SHINE_START));
    name.classList.toggle('is-shining', shine > 0 && shine < 1);
    name.style.setProperty('background-position', `${50 + 50 * Math.cos(Math.PI * shine)}% 0`);

    frame = progress < 1 ? requestAnimationFrame(step) : 0;
  };
  frame = requestAnimationFrame(step);
}
