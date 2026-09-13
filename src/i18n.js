const STORAGE_KEY = 'trenza.language';
const DEFAULT_LANGUAGE = 'en';

const LANGUAGES = {
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
    'action.theme': 'Switch theme',
    'theme.dark': 'Dark',
    'theme.light': 'Light',

    'intro.eyebrow': 'Local viewer',
    'intro.title': 'See the network without installing anything',
    'intro.lead': 'Drop a {pkt} or {pka} file to see the topology, the interfaces and the configuration of every device. Drop a {pcap} or {pcapng} to walk through the packets layer by layer.',
    'intro.choose': 'Choose a file',
    'intro.example': 'See an example',
    'intro.hint': 'You can also drag the file anywhere on this page.',
    'intro.drop': 'Drop the file to open it',

    'about.title': 'What is this for',
    'about.pktTerm': 'A .pkt file is a network built in Cisco Packet Tracer',
    'about.pktBody': 'It is what students hand in for a networking course: devices, cabling and the configuration of each one. Opening it normally means installing Packet Tracer and signing in to a Cisco account. Here you drop it and see it.',
    'about.pcapTerm': 'A .pcap file is recorded network traffic',
    'about.pcapBody': 'Wireshark, tcpdump and the simulation mode of Packet Tracer all produce them. Each entry is one packet, with its addresses, its protocol and its bytes.',
    'about.privacyTerm': 'Nothing is uploaded',
    'about.privacyBody': 'The decoding runs in your browser. The file never leaves your machine, and there is no server holding a copy.',
    'about.limitsTerm': 'It only reads',
    'about.limitsBody': 'You cannot edit, simulate or run anything: for that you still need Packet Tracer. What you can do is look, search, and take it with you: the diagram as an image, the capture as CSV or pcap.',
    'about.madeBy': 'Built by',

    'status.idle': 'No file open',
    'status.reading': 'Reading the file…',
    'status.network': '{devices} and {links}',
    'status.capture': '{packets} · {container} format',
    'status.captureCut': '{packets} · {container} format · cut off, {bytes} bytes left unread',
    'status.captureCutEmpty': 'The {container} file is cut off before the first whole packet: {bytes} bytes left unread',
    'status.exporting': 'Drawing the whole diagram…',
    'status.exported': '{file} · {width}×{height} px · {size} kB',
    'status.exportedVector': '{file} · vector · {size} kB',
    'status.exportedPaper': '{file} · {paper} · {size} kB',
    'status.exportedPlain': '{file} · {size} kB',
    'status.exportedCrowded': '{file} · {width}×{height} px · {size} kB · {crowded} touching for want of room',
    'status.exportFailed': 'Export failed: {reason}',
    'status.linkFailed': 'The file in the link could not be opened: {reason}',

    'variant.modern': 'Packet Tracer 6.2 or later',
    'variant.legacy': 'Before Packet Tracer 6.2',

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
    'panel.variant': 'Saved as',
    'panel.unknownVersion': 'unknown',
    'panel.downloadFile': 'Download the original file',
    'panel.gateway': 'Gateway',
    'panel.devices': 'Devices',
    'panel.inventory': 'Inventory',
    'panel.description': 'Description',
    'panel.howTo': 'How to explore',
    'panel.howToText': 'Pick a device in the diagram or in the list to see its interfaces and its configuration.',
    'panel.unnamedPort': 'unnamed port',
    'panel.unknownPeer': 'unknown device',
    'panel.format': 'Format',
    'panel.linkLayer': 'Link layer',
    'panel.packets': 'Packets',
    'panel.totalBytes': 'Total bytes',
    'panel.duration': 'Duration',
    'panel.protocols': 'Protocols',
    'panel.vlans': 'VLANs',
    'panel.routes': 'Static routes',
    'panel.routing': 'Routing protocols',
    'panel.accessLists': 'Access lists',
    'panel.truncated': 'Cut off',
    'panel.truncatedValue': '{bytes} bytes left unread',
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
    'table.vlan': 'VLAN',
    'table.vlanName': 'Name',
    'table.accessPorts': 'Access ports',
    'table.trunkPorts': 'Trunk ports',
    'table.routedPorts': 'Subinterfaces',
    'table.networks': 'Advertised networks',
    'table.passive': 'Passive',
    'table.accessList': 'List',
    'table.aclRules': 'Rules, in order',
    'table.aclApplied': 'Applied on',
    'table.via': 'Via',
    'table.sortBy': 'Sort by {column}',

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
    'export.language': 'Language',
    'export.preview': 'Preview',
    'export.previewCrowded': '{crowded} touching for want of room',
    'export.theme': 'Theme',
    'export.paper': 'Paper size',
    'export.transparent': 'Transparent background',
    'export.submit': 'Export',
    'export.pdfNote': 'The PDF holds the diagram as a lossless image, on one page.',
    'export.svgNote': 'The SVG is vector: it scales to any size without losing sharpness, and its text stays selectable.',
    'export.scope': 'Packets',
    'export.scopeAll': 'The whole capture ({count})',
    'export.scopeSelection': 'Only the selection ({count})',
    'export.csvNote': 'CSV opens in any spreadsheet: one row per packet, with its addresses, protocol and description.',
    'export.pcapNote': 'A classic pcap, the format every tool reads, Wireshark included. It carries the original bytes of each packet.',
    'panel.selection': 'Selection',
    'csv.timestamp': 'Timestamp',
    'rail.multiselect': 'Shift extends the selection, Ctrl or Cmd adds or removes one.',
    'status.exportedData': '{file} · {packets} · {size} kB',
    'export.fit': 'Fit to the diagram',
    'export.caption': '{devices} · {links}',

    'error.noDevices': 'There are no devices to export',
    'error.tooLarge': 'The requested image is too large: try a smaller resolution',
    'error.canvas': 'The browser could not produce the image',
    'error.unknownFormat': 'Unknown format: {format}',
    'error.decrypt': 'This is not a Packet Tracer .pkt or .pka file, or it is damaged',
    'error.truncated': 'Truncated compressed block',
    'error.inflate': 'The compressed block is not readable',
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
    'packet.linkType': 'Link type {type}',
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
    'field.address': 'Address',
    'field.unknown': 'unknown',

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
    'action.theme': 'Cambiar de tema',
    'theme.dark': 'Oscuro',
    'theme.light': 'Claro',

    'intro.eyebrow': 'Visor local',
    'intro.title': 'Mirá la red sin instalar nada',
    'intro.lead': 'Soltá un archivo {pkt} o {pka} para ver la topología, las interfaces y la configuración de cada equipo. Soltá un {pcap} o {pcapng} para recorrer los paquetes capa por capa.',
    'intro.choose': 'Elegir un archivo',
    'intro.example': 'Ver un ejemplo',
    'intro.hint': 'También podés arrastrar el archivo a cualquier parte de esta página.',
    'intro.drop': 'Soltá el archivo para abrirlo',

    'about.title': 'Para qué sirve',
    'about.pktTerm': 'Un archivo .pkt es una red armada en Cisco Packet Tracer',
    'about.pktBody': 'Es lo que se entrega en un curso de redes: los equipos, el cableado y la configuración de cada uno. Abrirlo normalmente exige instalar Packet Tracer y entrar con una cuenta de Cisco. Acá lo soltás y lo ves.',
    'about.pcapTerm': 'Un archivo .pcap es tráfico de red grabado',
    'about.pcapBody': 'Lo producen Wireshark, tcpdump y el modo simulación del propio Packet Tracer. Cada entrada es un paquete, con sus direcciones, su protocolo y sus bytes.',
    'about.privacyTerm': 'No se sube nada',
    'about.privacyBody': 'El descifrado corre en tu navegador. El archivo nunca sale de tu equipo y no hay servidor que se quede con una copia.',
    'about.limitsTerm': 'Sólo lee',
    'about.limitsBody': 'No podés editar, simular ni ejecutar: para eso sigue haciendo falta Packet Tracer. Lo que sí podés es mirar, buscar y llevártelo: el diagrama como imagen, la captura como CSV o pcap.',
    'about.madeBy': 'Hecho por',

    'status.idle': 'Ningún archivo abierto',
    'status.reading': 'Procesando el archivo…',
    'status.network': '{devices} y {links}',
    'status.capture': '{packets} · formato {container}',
    'status.captureCut': '{packets} · formato {container} · cortada, quedaron {bytes} bytes sin leer',
    'status.captureCutEmpty': 'El archivo {container} se corta antes del primer paquete entero: quedaron {bytes} bytes sin leer',
    'status.exporting': 'Dibujando el diagrama completo…',
    'status.exported': '{file} · {width}×{height} px · {size} kB',
    'status.exportedVector': '{file} · vectorial · {size} kB',
    'status.exportedPaper': '{file} · {paper} · {size} kB',
    'status.exportedPlain': '{file} · {size} kB',
    'status.exportedCrowded': '{file} · {width}×{height} px · {size} kB · {crowded} rozándose por falta de lugar',
    'status.exportFailed': 'No se pudo exportar: {reason}',
    'status.linkFailed': 'No se pudo abrir el archivo del enlace: {reason}',

    'variant.modern': 'Packet Tracer 6.2 o posterior',
    'variant.legacy': 'Anterior a Packet Tracer 6.2',

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
    'panel.variant': 'Guardado como',
    'panel.unknownVersion': 'desconocida',
    'panel.downloadFile': 'Descargar el archivo original',
    'panel.gateway': 'Puerta de enlace',
    'panel.devices': 'Dispositivos',
    'panel.inventory': 'Inventario',
    'panel.description': 'Descripción',
    'panel.howTo': 'Cómo explorar',
    'panel.howToText': 'Elegí un dispositivo en el diagrama o en la lista para ver sus interfaces y su configuración.',
    'panel.unnamedPort': 'puerto sin nombre',
    'panel.unknownPeer': 'dispositivo desconocido',
    'panel.format': 'Formato',
    'panel.linkLayer': 'Capa de enlace',
    'panel.packets': 'Paquetes',
    'panel.totalBytes': 'Bytes totales',
    'panel.duration': 'Duración',
    'panel.protocols': 'Protocolos',
    'panel.vlans': 'VLAN',
    'panel.routes': 'Rutas estáticas',
    'panel.routing': 'Protocolos de enrutamiento',
    'panel.accessLists': 'Listas de acceso',
    'panel.truncated': 'Cortada',
    'panel.truncatedValue': 'quedaron {bytes} bytes sin leer',
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
    'table.vlan': 'VLAN',
    'table.vlanName': 'Nombre',
    'table.accessPorts': 'Puertos de acceso',
    'table.trunkPorts': 'Troncos',
    'table.routedPorts': 'Subinterfaces',
    'table.networks': 'Redes anunciadas',
    'table.passive': 'Pasivas',
    'table.accessList': 'Lista',
    'table.aclRules': 'Reglas, en orden',
    'table.aclApplied': 'Aplicada en',
    'table.via': 'Por',
    'table.sortBy': 'Ordenar por {column}',

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
    'export.language': 'Idioma',
    'export.preview': 'Vista previa',
    'export.previewCrowded': '{crowded} rozándose por falta de lugar',
    'export.theme': 'Tema',
    'export.paper': 'Tamaño de hoja',
    'export.transparent': 'Fondo transparente',
    'export.submit': 'Exportar',
    'export.pdfNote': 'El PDF lleva el diagrama como imagen sin pérdida, en una sola hoja.',
    'export.svgNote': 'El SVG es vectorial: se agranda a cualquier tamaño sin perder nitidez y su texto se puede seleccionar.',
    'export.scope': 'Paquetes',
    'export.scopeAll': 'La captura entera ({count})',
    'export.scopeSelection': 'Sólo la selección ({count})',
    'export.csvNote': 'El CSV se abre en cualquier planilla: una fila por paquete, con sus direcciones, su protocolo y su descripción.',
    'export.pcapNote': 'Un pcap clásico, el formato que lee toda herramienta, Wireshark incluido. Lleva los bytes originales de cada paquete.',
    'panel.selection': 'Selección',
    'csv.timestamp': 'Marca de tiempo',
    'rail.multiselect': 'Mayúsculas extiende la selección, Control o Comando suma o quita uno.',
    'status.exportedData': '{file} · {packets} · {size} kB',
    'export.fit': 'Ajustar al diagrama',
    'export.caption': '{devices} · {links}',

    'error.noDevices': 'No hay dispositivos para exportar',
    'error.tooLarge': 'La imagen pedida es demasiado grande: probá con una resolución menor',
    'error.canvas': 'El navegador no pudo generar la imagen',
    'error.unknownFormat': 'Formato desconocido: {format}',
    'error.decrypt': 'Este archivo no es un .pkt ni un .pka de Packet Tracer, o está dañado',
    'error.truncated': 'Bloque comprimido truncado',
    'error.inflate': 'El bloque comprimido no se puede leer',
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
    'packet.undissected': '{bytes} bytes sin desglosar',
    'packet.linkType': 'Enlace tipo {type}',
    'packet.lengths': '{source} → {destination} len={length}',
    'packet.tcp': '{source} → {destination} [{flags}] len={length}',
    'packet.arpRequest': '¿Quién tiene {target}? Avisale a {sender}',
    'packet.arpReply': '{sender} está en {mac}',
    'packet.icmpGeneric': 'tipo {type}, código {code}',
    'packet.ipSummary': '{protocol} {bytes} bytes',

    'field.sourcePort': 'Puerto origen',
    'field.destinationPort': 'Puerto destino',
    'field.sequence': 'Secuencia',
    'field.acknowledgement': 'Acuse de recibo',
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
    'field.address': 'Dirección',
    'field.unknown': 'desconocido',

    'icmp.echoReply': 'Respuesta de eco',
    'icmp.echoRequest': 'Solicitud de eco',
    'icmp.unreachable': 'Destino inalcanzable',
    'icmp.redirect': 'Redirección',
    'icmp.ttlExceeded': 'TTL excedido',
    'icmp.neighborSolicitation': 'Solicitud de vecino',
    'icmp.neighborAdvertisement': 'Anuncio de vecino',
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
 * Corre `write` como si el idioma elegido fuera otro, y deja el de la página como estaba.
 * Es lo que permite exportar en español mirando el visor en inglés. Sólo envuelve trabajo
 * sincrónico: si cediera el turno, el resto de la página se dibujaría en el idioma prestado.
 */
export function withLanguage(language, write) {
  if (!DICTIONARIES[language] || language === current) return write();

  const previous = current;
  current = language;
  try {
    return write();
  } finally {
    current = previous;
  }
}

// Las reglas de plural son un objeto caro de construir y no dependen más que del idioma.
const pluralRules = new Map();

function pluralFor(locale, count) {
  let rules = pluralRules.get(locale);
  if (!rules) {
    rules = new Intl.PluralRules(locale);
    pluralRules.set(locale, rules);
  }
  return rules.select(count);
}

/**
 * Las plantillas partidas en literales y nombres, `['', 'source', ' → ', 'destination', '']`.
 * Interpolar con una expresión regular y una función de reemplazo cuesta lo suyo, y son
 * siempre las mismas cinco o seis plantillas: en una captura de cien mil paquetes eran cien
 * mil pasadas de la misma expresión sobre el mismo texto, 53 ms por cada línea de resumen.
 * Hay una entrada por cadena del diccionario que lleve marcadores, así que el mapa no crece.
 */
const templates = new Map();

function fill(text, values) {
  let parts = templates.get(text);
  if (parts === undefined) {
    parts = text.includes('{') ? text.split(/\{(\w+)\}/) : null;
    templates.set(text, parts);
  }
  if (parts === null) return text;

  let filled = parts[0];
  for (let i = 1; i < parts.length; i += 2) {
    const name = parts[i];
    filled += (name in values ? String(values[name]) : `{${name}}`) + parts[i + 1];
  }
  return filled;
}

/**
 * Traduce una clave. Si se pasa `count`, primero se busca la variante de plural que
 * corresponde al idioma, para no terminar escribiendo «1 paquetes».
 */
export function t(key, values) {
  const dictionary = DICTIONARIES[current];
  let resolved = key;

  if (values && typeof values.count === 'number') {
    const plural = pluralFor(LANGUAGES[current].locale, values.count);
    if (`${key}#${plural}` in dictionary) resolved = `${key}#${plural}`;
    else if (`${key}#other` in dictionary) resolved = `${key}#other`;
  }

  const text = dictionary[resolved] ?? DICTIONARIES[DEFAULT_LANGUAGE][resolved] ?? key;
  return values ? fill(text, values) : text;
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
  delete document.documentElement.dataset.translating;
  document.title = t('app.title');
  document.querySelector('meta[name="description"]').content = t('app.description');
}
