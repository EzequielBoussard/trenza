const STORAGE_KEY = 'trenza.language';
const DEFAULT_LANGUAGE = 'en';

export const LANGUAGES = {
  en: { label: 'English', locale: 'en' },
  es: { label: 'Español', locale: 'es-UY' },
};

const DICTIONARIES = {
  en: {
    'app.title': 'Trenza · network topology and capture viewer',
    'app.description': 'Open .pkt and .pcap files in your browser. The file never leaves your machine.',

    'action.open': 'Open file',
    'action.export': 'Export diagram',
    'action.close': 'Close',
    'action.cancel': 'Cancel',
    'action.language': 'Language',

    'intro.eyebrow': 'Local viewer',
    'intro.title': 'See the network without installing anything',
    'intro.lead': 'Drop a {pkt} or {pka} file to see the topology, the interfaces and the configuration of every device. Drop a {pcap} or {pcapng} to walk through the packets layer by layer.',
    'intro.hint': 'Drag it here, or click to pick one',
    'intro.note.local': 'The file is processed in your browser. It is never uploaded to a server.',
    'intro.note.readonly': 'Read only: nothing you open gets modified.',
    'intro.open': 'Open a file',

    'status.idle': 'No file open.',
    'status.reading': 'Reading the file…',
    'status.network': '{devices} and {links} · {variant} format',
    'status.capture': '{packets} · {container} format',
    'status.exporting': 'Drawing the whole diagram…',
    'status.exported': '{file} · {width}×{height} px · {size} kB',
    'status.exportedTrimmed': '{file} · {width}×{height} px · {size} kB · {hidden} left out for want of room',
    'status.exportFailed': 'Export failed: {reason}',
    'status.linkFailed': 'The file in the link could not be opened: {reason}',

    'variant.modern': 'modern',
    'variant.legacy': 'legacy',

    'unit.devices#one': '{count} device',
    'unit.devices#other': '{count} devices',
    'unit.links#one': '{count} link',
    'unit.links#other': '{count} links',
    'unit.packets#one': '{count} packet',
    'unit.packets#other': '{count} packets',
    'unit.labels#one': '{count} label',
    'unit.labels#other': '{count} labels',

    'rail.devices': 'Devices',
    'rail.infrastructure': 'Include infrastructure',
    'rail.searchDevices': 'Search by name or address',
    'rail.noMatches': 'No matches.',
    'rail.filter': 'Filter',
    'rail.searchPackets': 'Protocol, address or text',
    'rail.filterHint': 'The filter searches protocol, addresses and description. It is not Wireshark syntax.',

    'panel.summary': 'Summary',
    'panel.topology': 'Topology',
    'panel.capture': 'Capture',
    'panel.identity': 'Identity',
    'panel.type': 'Type',
    'panel.model': 'Model',
    'panel.links': 'Links',
    'panel.interfaces': 'Interfaces',
    'panel.connections': 'Connections',
    'panel.file': 'File',
    'panel.version': 'Packet Tracer version',
    'panel.unknownVersion': 'unknown',
    'panel.downloadFile': 'Download the original file',
    'panel.devices': 'Devices',
    'panel.inventory': 'Inventory',
    'panel.description': 'Description',
    'panel.howTo': 'How to explore',
    'panel.howToText': 'Pick a device in the diagram or in the list to see its interfaces and its configuration.',
    'panel.unnamedPort': 'unnamed port',
    'panel.unknownPeer': 'unknown device',
    'panel.format': 'Format',
    'panel.packets': 'Packets',
    'panel.totalBytes': 'Total bytes',
    'panel.duration': 'Duration',
    'panel.protocols': 'Protocols',
    'panel.bytes': 'Bytes',
    'panel.packet': 'Packet {index}',

    'table.interface': 'Interface',
    'table.address': 'Address',
    'table.mask': 'Mask',
    'table.state': 'State',
    'table.up': 'Up',
    'table.down': 'Down',
    'table.number': '#',
    'table.time': 'Time',
    'table.source': 'Source',
    'table.destination': 'Destination',
    'table.protocol': 'Protocol',
    'table.length': 'Bytes',
    'table.detail': 'Detail',
    'table.noPackets': 'No packet matches the filter.',

    'category.router': 'Router',
    'category.switch': 'Switch',
    'category.wireless': 'Wireless',
    'category.server': 'Server',
    'category.endpoint': 'Endpoint',
    'category.cloud': 'Cloud / WAN',
    'category.security': 'Security',
    'category.iot': 'IoT',
    'category.infrastructure': 'Infrastructure',
    'category.other': 'Device',
    'device.unnamed': 'Unnamed',

    'legend.straight': 'Straight copper',
    'legend.crossover': 'Crossover copper',
    'legend.fiber': 'Fiber',
    'legend.serial': 'Serial / coaxial',
    'legend.other': 'Other medium',
    'diagram.unconnected': 'Not wired to the network',

    'zoom.in': 'Zoom in',
    'zoom.out': 'Zoom out',
    'zoom.fit': 'Fit the network',

    'export.title': 'Export the diagram',
    'export.lead': 'The whole network is drawn, not just the part on screen.',
    'export.name': 'File name',
    'export.format': 'Format',
    'export.resolution': 'Resolution',
    'export.transparent': 'Transparent background',
    'export.submit': 'Export',
    'export.pdfNote': 'The PDF holds the diagram as a lossless image, on one printable page.',
    'export.fit': 'Fit to the diagram',
    'export.doesNotFit': 'leaves labels out',
    'export.caption': '{devices} · {links}',

    'error.noDevices': 'There are no devices to export',
    'error.tooLarge': 'The requested image is too large. Try a smaller resolution.',
    'error.canvas': 'The browser could not produce the image',
    'error.unknownFormat': 'Unknown format: {format}',
    'error.decrypt': 'The file could not be decrypted. {details}',
    'error.truncated': 'Truncated compressed block',
    'error.size': 'Unexpected uncompressed size: {actual}, expected {expected}',
    'error.eaxShort': 'EAX message too short to hold the tag',
    'error.eaxTag': 'The EAX tag does not match: the file is corrupt or uses another key',
    'error.xml': 'The XML inside the file could not be parsed',
    'error.noTopology': 'The file contains no topology',
    'error.captureShort': 'The file is too short to be a capture',
    'error.captureMagic': 'Unknown signature: the file is neither pcap nor pcapng',
    'error.badUrl': 'The src parameter is not a valid address',
    'error.insecureUrl': 'Only https addresses are accepted in the src parameter',
    'error.httpStatus': 'The server answered {status} when asked for the file',

    'packet.truncated': 'Truncated packet: only the first layers were read',
    'packet.undissected': '{bytes} bytes not dissected',
    'packet.lengths': '{source} → {destination} len={length}',
    'packet.tcp': '{source} → {destination} [{flags}] len={length}',
    'packet.arpRequest': 'Who has {target}? Tell {sender}',
    'packet.arpReply': '{sender} is at {mac}',
    'packet.icmpGeneric': 'type {type}, code {code}',
    'packet.ipSummary': '{protocol} {bytes} bytes',

    'field.sourcePort': 'Source port',
    'field.destinationPort': 'Destination port',
    'field.sequence': 'Sequence',
    'field.acknowledgement': 'Acknowledgement',
    'field.flags': 'Flags',
    'field.window': 'Window',
    'field.length': 'Length',
    'field.type': 'Type',
    'field.code': 'Code',
    'field.operation': 'Operation',
    'field.sourceMac': 'Source MAC',
    'field.destinationMac': 'Destination MAC',
    'field.sourceIp': 'Source IP',
    'field.destinationIp': 'Destination IP',
    'field.source': 'Source',
    'field.destination': 'Destination',
    'field.protocol': 'Protocol',
    'field.ttl': 'TTL',
    'field.totalLength': 'Total length',
    'field.nextHeader': 'Next header',
    'field.hopLimit': 'Hop limit',
    'field.etherType': 'EtherType',
    'field.vlan': 'VLAN',
    'field.noFlags': 'none',
    'field.request': 'Request',
    'field.reply': 'Reply',

    'icmp.echoReply': 'Echo reply',
    'icmp.echoRequest': 'Echo request',
    'icmp.unreachable': 'Destination unreachable',
    'icmp.redirect': 'Redirect',
    'icmp.ttlExceeded': 'TTL exceeded',
    'icmp.neighborSolicitation': 'Neighbor solicitation',
    'icmp.neighborAdvertisement': 'Neighbor advertisement',
  },

  es: {
    'app.title': 'Trenza · visor de topologías y capturas de red',
    'app.description': 'Abrí archivos .pkt y .pcap en el navegador. El archivo nunca sale de tu equipo.',

    'action.open': 'Abrir archivo',
    'action.export': 'Exportar diagrama',
    'action.close': 'Cerrar',
    'action.cancel': 'Cancelar',
    'action.language': 'Idioma',

    'intro.eyebrow': 'Visor local',
    'intro.title': 'Mirá la red sin instalar nada',
    'intro.lead': 'Soltá un archivo {pkt} o {pka} para ver la topología, las interfaces y la configuración de cada equipo. Soltá un {pcap} o {pcapng} para recorrer los paquetes capa por capa.',
    'intro.hint': 'Arrastralo acá o hacé clic para elegirlo',
    'intro.note.local': 'El archivo se procesa en tu navegador. No se sube a ningún servidor.',
    'intro.note.readonly': 'Es sólo lectura: nada de lo que abras se modifica.',
    'intro.open': 'Abrir un archivo',

    'status.idle': 'Ningún archivo abierto.',
    'status.reading': 'Procesando el archivo…',
    'status.network': '{devices} y {links} · formato {variant}',
    'status.capture': '{packets} · formato {container}',
    'status.exporting': 'Dibujando el diagrama completo…',
    'status.exported': '{file} · {width}×{height} px · {size} kB',
    'status.exportedTrimmed': '{file} · {width}×{height} px · {size} kB · {hidden} sin lugar para dibujarse',
    'status.exportFailed': 'No se pudo exportar: {reason}',
    'status.linkFailed': 'No se pudo abrir el archivo del enlace: {reason}',

    'variant.modern': 'moderno',
    'variant.legacy': 'heredado',

    'unit.devices#one': '{count} dispositivo',
    'unit.devices#other': '{count} dispositivos',
    'unit.links#one': '{count} enlace',
    'unit.links#other': '{count} enlaces',
    'unit.packets#one': '{count} paquete',
    'unit.packets#other': '{count} paquetes',
    'unit.labels#one': '{count} etiqueta',
    'unit.labels#other': '{count} etiquetas',

    'rail.devices': 'Dispositivos',
    'rail.infrastructure': 'Incluir infraestructura',
    'rail.searchDevices': 'Buscar por nombre o dirección',
    'rail.noMatches': 'Sin coincidencias.',
    'rail.filter': 'Filtro',
    'rail.searchPackets': 'Protocolo, dirección o texto',
    'rail.filterHint': 'El filtro busca en protocolo, direcciones y descripción. No usa la sintaxis de Wireshark.',

    'panel.summary': 'Resumen',
    'panel.topology': 'Topología',
    'panel.capture': 'Captura',
    'panel.identity': 'Identidad',
    'panel.type': 'Tipo',
    'panel.model': 'Modelo',
    'panel.links': 'Enlaces',
    'panel.interfaces': 'Interfaces',
    'panel.connections': 'Conexiones',
    'panel.file': 'Archivo',
    'panel.version': 'Versión de Packet Tracer',
    'panel.unknownVersion': 'desconocida',
    'panel.downloadFile': 'Descargar el archivo original',
    'panel.devices': 'Dispositivos',
    'panel.inventory': 'Inventario',
    'panel.description': 'Descripción',
    'panel.howTo': 'Cómo explorar',
    'panel.howToText': 'Elegí un dispositivo en el diagrama o en la lista para ver sus interfaces y su configuración.',
    'panel.unnamedPort': 'puerto sin nombre',
    'panel.unknownPeer': 'dispositivo desconocido',
    'panel.format': 'Formato',
    'panel.packets': 'Paquetes',
    'panel.totalBytes': 'Bytes totales',
    'panel.duration': 'Duración',
    'panel.protocols': 'Protocolos',
    'panel.bytes': 'Bytes',
    'panel.packet': 'Paquete {index}',

    'table.interface': 'Interfaz',
    'table.address': 'Dirección',
    'table.mask': 'Máscara',
    'table.state': 'Estado',
    'table.up': 'Activa',
    'table.down': 'Apagada',
    'table.number': '#',
    'table.time': 'Tiempo',
    'table.source': 'Origen',
    'table.destination': 'Destino',
    'table.protocol': 'Protocolo',
    'table.length': 'Bytes',
    'table.detail': 'Detalle',
    'table.noPackets': 'Ningún paquete coincide con el filtro.',

    'category.router': 'Router',
    'category.switch': 'Switch',
    'category.wireless': 'Inalámbrico',
    'category.server': 'Servidor',
    'category.endpoint': 'Terminal',
    'category.cloud': 'Nube / WAN',
    'category.security': 'Seguridad',
    'category.iot': 'IoT',
    'category.infrastructure': 'Infraestructura',
    'category.other': 'Dispositivo',
    'device.unnamed': 'Sin nombre',

    'legend.straight': 'Cobre directo',
    'legend.crossover': 'Cobre cruzado',
    'legend.fiber': 'Fibra',
    'legend.serial': 'Serial / coaxial',
    'legend.other': 'Otro medio',
    'diagram.unconnected': 'Sin conexión a la red',

    'zoom.in': 'Acercar',
    'zoom.out': 'Alejar',
    'zoom.fit': 'Encuadrar la red',

    'export.title': 'Exportar el diagrama',
    'export.lead': 'Se dibuja la red entera, no sólo la parte que se ve en pantalla.',
    'export.name': 'Nombre del archivo',
    'export.format': 'Formato',
    'export.resolution': 'Resolución',
    'export.transparent': 'Fondo transparente',
    'export.submit': 'Exportar',
    'export.pdfNote': 'El PDF lleva el diagrama como imagen sin pérdida, en una hoja imprimible.',
    'export.fit': 'Ajustar al diagrama',
    'export.doesNotFit': 'deja etiquetas afuera',
    'export.caption': '{devices} · {links}',

    'error.noDevices': 'No hay dispositivos para exportar',
    'error.tooLarge': 'La imagen pedida es demasiado grande. Probá con una escala menor.',
    'error.canvas': 'El navegador no pudo generar la imagen',
    'error.unknownFormat': 'Formato desconocido: {format}',
    'error.decrypt': 'No se pudo descifrar el archivo. {details}',
    'error.truncated': 'Bloque comprimido truncado',
    'error.size': 'Tamaño descomprimido inesperado: {actual}, se esperaban {expected}',
    'error.eaxShort': 'Mensaje EAX demasiado corto para contener el tag',
    'error.eaxTag': 'El tag EAX no coincide: el archivo está corrupto o usa otra clave',
    'error.xml': 'El XML interno del archivo no se pudo interpretar',
    'error.noTopology': 'El archivo no contiene una topología',
    'error.captureShort': 'El archivo es demasiado corto para ser una captura',
    'error.captureMagic': 'Firma desconocida: el archivo no es pcap ni pcapng',
    'error.badUrl': 'El parámetro src no es una dirección válida',
    'error.insecureUrl': 'Sólo se aceptan direcciones https en el parámetro src',
    'error.httpStatus': 'El servidor respondió {status} al pedir el archivo',

    'packet.truncated': 'Paquete truncado: sólo se leyeron las capas iniciales',
    'packet.undissected': '{bytes} bytes sin disecar',
    'packet.lengths': '{source} → {destination} len={length}',
    'packet.tcp': '{source} → {destination} [{flags}] len={length}',
    'packet.arpRequest': '¿Quién tiene {target}? Decírselo a {sender}',
    'packet.arpReply': '{sender} está en {mac}',
    'packet.icmpGeneric': 'tipo {type}, código {code}',
    'packet.ipSummary': '{protocol} {bytes} bytes',

    'field.sourcePort': 'Puerto origen',
    'field.destinationPort': 'Puerto destino',
    'field.sequence': 'Secuencia',
    'field.acknowledgement': 'Acuse',
    'field.flags': 'Banderas',
    'field.window': 'Ventana',
    'field.length': 'Longitud',
    'field.type': 'Tipo',
    'field.code': 'Código',
    'field.operation': 'Operación',
    'field.sourceMac': 'MAC origen',
    'field.destinationMac': 'MAC destino',
    'field.sourceIp': 'IP origen',
    'field.destinationIp': 'IP destino',
    'field.source': 'Origen',
    'field.destination': 'Destino',
    'field.protocol': 'Protocolo',
    'field.ttl': 'TTL',
    'field.totalLength': 'Longitud total',
    'field.nextHeader': 'Siguiente cabecera',
    'field.hopLimit': 'Límite de saltos',
    'field.etherType': 'EtherType',
    'field.vlan': 'VLAN',
    'field.noFlags': 'ninguna',
    'field.request': 'Solicitud',
    'field.reply': 'Respuesta',

    'icmp.echoReply': 'Echo reply',
    'icmp.echoRequest': 'Echo request',
    'icmp.unreachable': 'Destino inalcanzable',
    'icmp.redirect': 'Redirect',
    'icmp.ttlExceeded': 'TTL excedido',
    'icmp.neighborSolicitation': 'Neighbor solicitation',
    'icmp.neighborAdvertisement': 'Neighbor advertisement',
  },
};

function storedLanguage() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved && DICTIONARIES[saved] ? saved : null;
  } catch {
    return null;
  }
}

let current = storedLanguage() || DEFAULT_LANGUAGE;

export function getLanguage() {
  return current;
}

export function getLocale() {
  return LANGUAGES[current].locale;
}

export function setLanguage(language) {
  if (!DICTIONARIES[language]) return;
  current = language;
  try {
    localStorage.setItem(STORAGE_KEY, language);
  } catch {
    // Sin almacenamiento disponible el idioma dura lo que dure la pestaña.
  }
}

/**
 * Traduce una clave. Si se pasa `count`, primero se busca la variante de plural que
 * corresponde al idioma, para no terminar escribiendo «1 paquetes».
 */
export function t(key, values) {
  const dictionary = DICTIONARIES[current];
  let resolved = key;

  if (values && typeof values.count === 'number') {
    const plural = new Intl.PluralRules(LANGUAGES[current].locale).select(values.count);
    if (`${key}#${plural}` in dictionary) resolved = `${key}#${plural}`;
    else if (`${key}#other` in dictionary) resolved = `${key}#other`;
  }

  const text = dictionary[resolved] ?? DICTIONARIES[DEFAULT_LANGUAGE][resolved] ?? key;
  if (!values) return text;
  return text.replace(/\{(\w+)\}/g, (match, name) => (name in values ? String(values[name]) : match));
}

export function countOf(unit, count) {
  return t(`unit.${unit}`, { count });
}

/** Aplica las traducciones al marcado estático marcado con atributos data-i18n. */
export function translateDocument(root = document) {
  for (const node of root.querySelectorAll('[data-i18n]')) {
    node.textContent = t(node.dataset.i18n);
  }
  for (const node of root.querySelectorAll('[data-i18n-html]')) {
    node.innerHTML = t(node.dataset.i18nHtml, {
      pkt: '<b>.pkt</b>',
      pka: '<b>.pka</b>',
      pcap: '<b>.pcap</b>',
      pcapng: '<b>.pcapng</b>',
    });
  }
  for (const node of root.querySelectorAll('[data-i18n-placeholder]')) {
    node.placeholder = t(node.dataset.i18nPlaceholder);
  }
  for (const node of root.querySelectorAll('[data-i18n-label]')) {
    node.setAttribute('aria-label', t(node.dataset.i18nLabel));
  }
  document.documentElement.lang = current;
  document.title = t('app.title');
}
