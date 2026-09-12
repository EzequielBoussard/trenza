import { countOf, t } from '../i18n.js';
import { SIZE_LABELS, VECTOR_FORMATS, renderNetworkPreview } from './export.js';

// Ancho al que se dibuja la vista previa. Va al doble de lo que ocupa en pantalla para
// que se vea nítida en pantallas densas, y aun así cuesta una fracción de la salida real.
const PREVIEW_WIDTH = 1800;
const PREVIEW_DELAY = 120;

// Ancho de la lupa, hasta dónde puede achicarse en un diálogo angosto, y su proporción.
const LENS_SIZE = 440;
const MIN_LENS_SIZE = 240;
const LENS_ASPECT = 0.66;
const LENS_ROOM = 1.5;

/**
 * La vista previa del diálogo de exportación: el diagrama tal como va a salir, y una lupa
 * que muestra un recorte a la escala real del archivo.
 *
 * `frame` es el recuadro donde va el lienzo, `note` el pie que dice la medida, y `lens` el
 * recuadro flotante con su propio lienzo adentro.
 */
export function createExportPreview({ frame, note, lens, lensCanvas }) {
  let timer = 0;
  let token = 0;
  let current = null;

  /**
   * Dibuja la salida tal como va a quedar. Dos resoluciones del mismo formato dan la misma
   * imagen —el reparto no depende de los píxeles, sólo la definición—, así que el pie de
   * la vista dice la medida real y cuántas etiquetas quedaron afuera, que es lo que cambia.
   */
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

  /**
   * La lupa dibuja el recorte a la escala real del archivo, no un aumento de la vista
   * previa: es la única forma de ver antes de bajar si los nombres y las direcciones se van
   * a leer. El punto del puntero se pasa a unidades de diseño, que es en las que piensa
   * el dibujo, y de ahí sale el centro del recorte.
   */
  const move = (event) => {
    if (!current) return;

    const box = current.canvas.getBoundingClientRect();
    const inside = event.clientX >= box.left && event.clientX <= box.right
      && event.clientY >= box.top && event.clientY <= box.bottom;
    lens.hidden = !inside;
    if (!inside) return;

    const side = Math.min(LENS_SIZE, Math.max(MIN_LENS_SIZE, Math.round(box.width / 1.9)));
    const tall = Math.round(side * LENS_ASPECT);

    // Una lupa que tapa media vista previa no aumenta nada: en un recuadro así de chico se
    // queda guardada y se mira el diagrama entero, que es lo que hay lugar para ver.
    if (box.width < side * LENS_ROOM || box.height < tall * LENS_ROOM) {
      lens.hidden = true;
      return;
    }

    // Cambiar el tamaño del lienzo lo borra, así que sólo se toca cuando de verdad cambió.
    if (lensCanvas.width !== side || lensCanvas.height !== tall) {
      lensCanvas.width = side;
      lensCanvas.height = tall;
    }
    lens.style.width = `${side}px`;
    lens.style.height = `${tall}px`;

    // La lupa se queda dentro del recuadro aunque el puntero llegue al borde: el diálogo se
    // desplaza por dentro y lo que sobresalga queda cortado. El recorte sigue centrado en el
    // puntero de verdad, así que en los bordes la lupa se separa un poco pero no miente.
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
    /** Redibuja tras un respiro: el diálogo cambia de campo más rápido de lo que se dibuja. */
    schedule(model, request) {
      clearTimeout(timer);
      timer = setTimeout(() => draw(model, request), PREVIEW_DELAY);
    },
    /** Se llama al pasar a un formato sin diagrama, para no dejar el dibujo anterior colgado. */
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
