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
  canCopyImage,
  cleanExportName,
  copyNetworkImage,
  exportNetwork,
  inventoryCsv,
  offeredSizes,
  suggestExportName,
} from './export.js';

const CAPTURE_NOTES = { csv: 'export.csvNote', pcap: 'export.pcapNote' };

function requestFrom(elements, state) {
  const fields = elements.exportForm.elements;
  return {
    format: fields.format.value,
    name: cleanExportName(fields.name.value, state.file.name),
    size: fields.size.value,
    transparent: fields.transparent.checked,
    guide: fields.guide.checked,
    showInfrastructure: state.showInfrastructure,
    language: fields.language.value,
    theme: fields.theme.value,
  };
}

// Las medidas ilegibles no se ofrecen; no se muestran deshabilitadas.
function updateSizeOptions(elements, state) {
  const format = elements.exportForm.elements.format.value;
  const paper = format === 'pdf';
  const guide = elements.exportForm.elements.guide.checked;
  const offered = offeredSizes(state.model, { showInfrastructure: state.showInfrastructure, guide, format });
  const select = elements.exportForm.elements.size;
  const chosen = select.value;

  elements.sizeLabel.textContent = t(paper ? 'export.paper' : 'export.resolution');
  select.replaceChildren(...offered.map((name) => {
    const option = document.createElement('option');
    option.value = name;
    option.textContent = name === 'fit' ? t('export.fit') : SIZE_LABELS[name];
    return option;
  }));

  // Si la medida elegida sigue disponible se respeta.
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

// Lo que no aplica al tipo de archivo o al formato se esconde entero.
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
  // El CSV de una red es el inventario: no lleva dibujo.
  const drawing = !capture && format !== 'csv';

  elements.transparentField.hidden = !drawing || format === 'jpg' || format === 'pdf';
  elements.guideField.hidden = !drawing;
  elements.sizeField.hidden = !drawing || vector;
  if (drawing && !vector) updateSizeOptions(elements, state);

  elements.languageField.hidden = format === 'pcap';
  elements.themeField.hidden = !drawing;
  elements.scopeField.hidden = !capture || state.packetSelection.length === 0;
  elements.exportCopy.hidden = !drawing || !['png', 'jpg'].includes(format) || !canCopyImage();
  elements.exportNote.textContent = capture ? t(CAPTURE_NOTES[format] ?? '')
    : !drawing ? t('export.inventoryNote')
      : vector ? t('export.svgNote')
        : format === 'pdf' ? t('export.pdfNote') : '';

  const shows = drawing;
  elements.previewPanel.hidden = !shows;
  elements.exportDialog.classList.toggle('dialog--wide', shows);
  if (shows) preview.schedule(state.model, requestFrom(elements, state));
  else preview.stop();
}

// La clave queda en data-i18n para que cambiar de idioma con el diálogo abierto no la pise.
function labelDialog(dialog, capture) {
  const labels = [
    [dialog.querySelector('.dialog__title'), capture ? 'export.titleCapture' : 'export.title'],
    [dialog.querySelector('.dialog__lead'), capture ? 'export.leadCapture' : 'export.lead'],
  ];
  for (const [node, key] of labels) {
    node.dataset.i18n = key;
    node.textContent = t(key);
  }
}

function exportCapture(state, setStatus, { name, format, scope, language }) {
  const packets = scope === 'selection' && state.packetSelection.length > 0
    ? state.packetTable.getSelection()
    : state.packets;

  const origin = state.packets.length > 0 ? state.packets[0].timestamp : 0;
  // El CSV va en el idioma del exporte; el aviso de estado, en el del visor.
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

function exportInventory(state, setStatus, { name, language }) {
  const { blob, devices } = withLanguage(language, () => inventoryCsv(state.model, { showInfrastructure: state.showInfrastructure }));
  const fileName = `${name}.csv`;
  download(blob, fileName);
  setStatus('status.exportedInventory', {
    file: fileName,
    devices: { key: 'unit.devices', values: { count: devices } },
    size: Math.max(1, Math.round(blob.size / 1024)),
  }, 'ok');
}

// Dibujar una red grande bloquea la página: el aviso tiene que pintarse antes.
const nextPaint = () => new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve)));

async function exportDiagram(state, setStatus, request) {
  try {
    const result = await exportNetwork(state.model, request);
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
    // Arranca con el idioma y el tema del visor; cambiarlos acá no toca el visor.
    fields.language.value = getLanguage();
    fields.theme.value = currentTheme();
    const capture = state.kind === 'capture';
    labelDialog(elements.exportDialog, capture);
    if (capture) updateScopeOptions(elements, state);
    refresh();
    elements.exportDialog.showModal();
    fields.name.select();
  });

  elements.exportForm.addEventListener('change', refresh);
  elements.exportCancel.addEventListener('click', () => elements.exportDialog.close());

  elements.exportCopy.addEventListener('click', async () => {
    const request = requestFrom(elements, state);
    const copying = copyNetworkImage(state.model, { ...request, transparent: request.format === 'png' && request.transparent });
    elements.exportDialog.close();
    setStatus('status.copying');
    try {
      const result = await copying;
      setStatus('status.copied', { width: result.width, height: result.height }, 'ok');
    } catch (error) {
      setStatus('status.copyFailed', { reason: error.message }, 'error');
    }
  });
  elements.previewFrame.addEventListener('pointermove', (event) => {
    if (event.pointerType === 'mouse') preview.move(event);
  });
  elements.previewFrame.addEventListener('pointerleave', () => preview.hideLens());

  elements.exportForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const request = requestFrom(elements, state);

    elements.exportDialog.close();

    if (state.kind === 'network' && request.format === 'csv') {
      exportInventory(state, setStatus, request);
      return;
    }
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

    await nextPaint();
    await exportDiagram(state, setStatus, request);
  });
}
