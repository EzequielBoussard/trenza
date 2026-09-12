import { getLanguage, t, withLanguage } from '../i18n.js';
import { download } from '../download.js';
import { toCsv, toPcap } from '../pcap/encode.js';
import { currentTheme } from '../theme.js';
import { createExportPreview } from './export-preview.js';
import {
  DEFAULT_PAPER,
  DEFAULT_RESOLUTION,
  SIZE_LABELS,
  VECTOR_FORMATS,
  exportNetwork,
  offeredSizes,
  suggestExportName,
} from './export.js';

const CAPTURE_NOTES = { csv: 'export.csvNote', pcap: 'export.pcapNote' };

/** Lo que el diálogo tiene cargado en este momento, listo para pedir la exportación. */
function requestFrom(elements, state) {
  const fields = elements.exportForm.elements;
  return {
    format: fields.format.value,
    name: fields.name.value.trim() || suggestExportName(state.file.name),
    size: fields.size.value,
    transparent: fields.transparent.checked,
    showInfrastructure: state.showInfrastructure,
    language: fields.language.value,
    theme: fields.theme.value,
  };
}

// Una medida en la que el diagrama quedaría ilegible no se ofrece, y punto: una
// opción tachada con su explicación es ruido que nadie va a elegir igual.
function updateSizeOptions(elements, state) {
  const format = elements.exportForm.elements.format.value;
  const paper = format === 'pdf';
  const offered = offeredSizes(state.model, { showInfrastructure: state.showInfrastructure, format });
  const select = elements.exportForm.elements.size;
  const chosen = select.value;

  elements.sizeLabel.textContent = t(paper ? 'export.paper' : 'export.resolution');
  select.replaceChildren(...offered.map((name) => {
    const option = document.createElement('option');
    option.value = name;
    option.textContent = name === 'fit' ? t('export.fit') : SIZE_LABELS[name];
    return option;
  }));

  // Cambiar de tema o de idioma vuelve a pasar por acá; si la medida elegida sigue
  // estando, se respeta en vez de saltar sola a la preferida.
  const preferred = paper ? DEFAULT_PAPER : DEFAULT_RESOLUTION;
  const wanted = [chosen, preferred].find((name) => offered.includes(name));
  select.value = wanted ?? offered[0];
}

function updateScopeOptions(elements, state) {
  const [all, selection] = elements.exportForm.elements.scope.options;
  all.textContent = t('export.scopeAll', { count: state.packets.length });
  selection.textContent = t('export.scopeSelection', { count: state.packetSelection.length });
  elements.exportForm.elements.scope.value = state.packetSelection.length > 0 ? 'selection' : 'all';
}

/**
 * Cada tipo de archivo ofrece sus formatos: de una captura no sale un diagrama, y de una
 * topología no sale una tabla de paquetes. Lo que no aplica se esconde entero, sin dejar
 * un campo apagado al lado explicando por qué no se puede tocar.
 */
function updateFormatFields(elements, state, preview) {
  const capture = state.kind === 'capture';

  for (const option of elements.exportForm.querySelectorAll('.choice__option')) {
    option.hidden = option.dataset.for !== state.kind;
  }
  if (elements.exportForm.querySelector('.choice__option[hidden] input:checked')) {
    elements.exportForm.querySelector('.choice__option:not([hidden]) input').checked = true;
  }

  const format = elements.exportForm.elements.format.value;
  const vector = VECTOR_FORMATS.includes(format);

  elements.transparentField.hidden = capture || format === 'jpg' || format === 'pdf';
  elements.sizeField.hidden = capture || vector;
  if (!capture && !vector) updateSizeOptions(elements, state);

  // El idioma alcanza a todo lo que lleve texto; el tema, sólo a lo que se dibuja. Un
  // pcap no tiene ni una cosa ni la otra.
  elements.languageField.hidden = format === 'pcap';
  elements.themeField.hidden = capture;
  elements.scopeField.hidden = !capture || state.packetSelection.length === 0;
  elements.exportNote.textContent = capture ? t(CAPTURE_NOTES[format] ?? '')
    : vector ? t('export.svgNote')
      : format === 'pdf' ? t('export.pdfNote') : '';

  const shows = state.kind === 'network';
  elements.previewPanel.hidden = !shows;
  elements.exportDialog.classList.toggle('dialog--wide', shows);
  if (shows) preview.schedule(state.model, requestFrom(elements, state));
  else preview.stop();
}

/** Vuelca la captura, entera o sólo el tramo elegido, a un formato que lea cualquiera. */
function exportCapture(state, setStatus, { name, format, scope, language }) {
  const packets = scope === 'selection' && state.packetSelection.length > 0
    ? state.packetTable.getSelection()
    : state.packets;

  const origin = state.packets.length > 0 ? state.packets[0].timestamp : 0;
  // Sólo el CSV lleva texto, y va en el idioma elegido para exportar; el aviso de abajo
  // es del visor y se queda en el suyo.
  const { blob, written } = format === 'csv'
    ? { blob: withLanguage(language, () => toCsv(packets, { origin })), written: packets.length }
    : toPcap(packets);

  const fileName = `${name}.${format}`;
  download(blob, fileName);
  setStatus('status.exportedData', {
    file: fileName,
    packets: { key: 'unit.packets', values: { count: written } },
    size: Math.round(blob.size / 1024),
  }, 'ok');
}

async function exportDiagram(state, setStatus, request) {
  try {
    const result = await exportNetwork(state.model, request);
    // Ni un vector ni una hoja se miden en píxeles; informarlos así haría creerlo.
    const message = VECTOR_FORMATS.includes(request.format) ? 'status.exportedVector'
      : result.paper ? 'status.exportedPaper'
        : request.format === 'pdf' ? 'status.exportedPlain'
          : result.crowded > 0 ? 'status.exportedCrowded' : 'status.exported';

    setStatus(message, {
      file: result.fileName,
      width: result.width,
      height: result.height,
      paper: SIZE_LABELS[result.paper],
      size: Math.round(result.bytes / 1024),
      crowded: { key: 'unit.labels', values: { count: result.crowded } },
    }, 'ok');
  } catch (error) {
    setStatus('status.exportFailed', { reason: error.message }, 'error');
  }
}

/** Conecta el diálogo de exportación con el archivo abierto. */
export function wireExportDialog({ elements, state, setStatus }) {
  const preview = createExportPreview({
    frame: elements.previewFrame,
    note: elements.previewNote,
    lens: elements.previewLens,
    lensCanvas: elements.previewLensCanvas,
  });
  const refresh = () => updateFormatFields(elements, state, preview);

  elements.export.addEventListener('click', () => {
    if (!state.kind) return;
    const fields = elements.exportForm.elements;
    fields.name.value = suggestExportName(state.file.name);
    // El diálogo abre con lo que el usuario está mirando; cambiarlo acá no toca el visor.
    fields.language.value = getLanguage();
    fields.theme.value = currentTheme();
    if (state.kind === 'capture') updateScopeOptions(elements, state);
    refresh();
    elements.exportDialog.showModal();
    fields.name.select();
  });

  elements.exportForm.addEventListener('change', refresh);
  elements.exportCancel.addEventListener('click', () => elements.exportDialog.close());
  elements.previewFrame.addEventListener('pointermove', (event) => {
    if (event.pointerType === 'mouse') preview.move(event);
  });
  elements.previewFrame.addEventListener('pointerleave', () => preview.hideLens());

  elements.exportForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const request = requestFrom(elements, state);

    elements.exportDialog.close();
    setStatus('status.exporting');

    if (state.kind === 'capture') {
      exportCapture(state, setStatus, {
        name: request.name,
        format: request.format,
        scope: elements.exportForm.elements.scope.value,
        language: request.language,
      });
      return;
    }

    await exportDiagram(state, setStatus, request);
  });
}
