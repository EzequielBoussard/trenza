import { countOf, t } from '../i18n.js';
import { SIZE_LABELS, VECTOR_FORMATS, renderNetworkPreview } from './export.js';

// Al doble de lo que ocupa en pantalla, para pantallas densas.
const PREVIEW_WIDTH = 1800;
const PREVIEW_DELAY = 120;

const LENS_SIZE = 440;
const MIN_LENS_SIZE = 240;
const LENS_ASPECT = 0.66;
const LENS_ROOM = 1.5;

// Vista previa del exporte y lupa con un recorte a escala real.
export function createExportPreview({ frame, note, lens, lensCanvas }) {
  let timer = 0;
  let token = 0;
  let current = null;

  const draw = async (model, request) => {
    const mine = ++token;

    try {
      const result = await renderNetworkPreview(model, request, PREVIEW_WIDTH);
      if (mine !== token) return;

      frame.replaceChildren(result.canvas, lens);
      frame.classList.toggle('preview--alpha', request.transparent && request.format === 'png');
      current = { canvas: result.canvas, design: result.design, magnify: result.magnify };
      lens.hidden = true;

      const measure = VECTOR_FORMATS.includes(request.format)
        ? `${Math.round(result.width)} × ${Math.round(result.height)}`
        : `${result.width} × ${result.height} px`;
      const paper = request.format === 'pdf' && SIZE_LABELS[request.size];
      const touching = result.crowded > 0
        ? t('export.previewCrowded', { crowded: countOf('labels', result.crowded) })
        : '';

      note.textContent = [paper, measure, touching].filter(Boolean).join(' · ');
    } catch (error) {
      if (mine !== token) return;
      frame.replaceChildren();
      current = null;
      note.textContent = error.message;
    }
  };

  // La lupa repinta a escala real: así se ve si el texto se lee.
  const move = (event) => {
    if (!current) return;

    const box = current.canvas.getBoundingClientRect();
    const inside = event.clientX >= box.left && event.clientX <= box.right
      && event.clientY >= box.top && event.clientY <= box.bottom;
    lens.hidden = !inside;
    if (!inside) return;

    const side = Math.min(LENS_SIZE, Math.max(MIN_LENS_SIZE, Math.round(box.width / 1.9)));
    const tall = Math.round(side * LENS_ASPECT);

    // En una vista previa chica la lupa taparía la mitad; no se muestra.
    if (box.width < side * LENS_ROOM || box.height < tall * LENS_ROOM) {
      lens.hidden = true;
      return;
    }

    // Asignar width/height borra el lienzo aunque el valor sea el mismo.
    if (lensCanvas.width !== side || lensCanvas.height !== tall) {
      lensCanvas.width = side;
      lensCanvas.height = tall;
    }
    lens.style.width = `${side}px`;
    lens.style.height = `${tall}px`;

    // La lupa no sale del recuadro; el recorte sigue centrado en el puntero.
    const outer = frame.getBoundingClientRect();
    const within = (value, span, edge) => Math.min(Math.max(value, edge / 2), span - edge / 2);
    lens.style.left = `${within(event.clientX - outer.left, outer.width, side)}px`;
    lens.style.top = `${within(event.clientY - outer.top, outer.height, tall)}px`;

    current.magnify(lensCanvas, {
      x: (event.clientX - box.left) / box.width * current.design.width,
      y: (event.clientY - box.top) / box.height * current.design.height,
    });
  };

  return {
    // Con demora: los campos cambian más rápido de lo que se dibuja.
    schedule(model, request) {
      clearTimeout(timer);
      timer = setTimeout(() => draw(model, request), PREVIEW_DELAY);
    },
    stop() {
      clearTimeout(timer);
      token++;
      current = null;
    },
    move,
    hideLens() {
      lens.hidden = true;
    },
  };
}
