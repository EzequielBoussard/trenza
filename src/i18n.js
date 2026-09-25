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
    'action.skip': 'Skip to the viewer',
    'action.home': 'Trenza, back to the start page',
    'theme.dark': 'Dark',
    'theme.light': 'Light',

    'intro.title': 'Viewer for Packet Tracer files and network captures',
    'intro.lead': 'Open a {pkt} or {pka} file to see the topology, interfaces and configuration of each device, or a {pcap} or {pcapng} file to go through the packets. The file is read in your browser and is not uploaded anywhere.',
    'intro.choose': 'Choose a file',
    'intro.example': 'Open the example',
    'intro.hint': 'You can also drag the file onto the page.',
    'intro.drop': 'Drop the file to open it',
    'intro.shotAlt': 'Part of the example network: a router, a server, two camera switches and the IP cameras connected to them, each with its name and address.',
    'intro.shotCaption': 'The example is a supermarket network designed in 2023: 71 devices, with IP cameras and Wi-Fi.',

    'about.pktTerm': '.pkt and .pka',
    'about.pktBody': 'Networks built in Cisco Packet Tracer. Opening one usually requires installing Packet Tracer and signing in with a Cisco account.',
    'about.pcapTerm': '.pcap and .pcapng',
    'about.pcapBody': 'Traffic recorded with Wireshark, tcpdump or the simulation mode of Packet Tracer.',
    'about.privacyTerm': 'Privacy',
    'about.privacyBody': 'Decryption runs in the browser. There is no server that receives the file.',
    'about.limitsTerm': 'Read only',
    'about.limitsBody': 'It does not edit or simulate. The diagram can be exported as PNG, JPG, SVG or PDF, and the capture as CSV or pcap.',
    'about.madeBy': 'Made by',
    'about.disclaimer': 'Trenza is an independent project, not affiliated with or endorsed by Cisco. Cisco and Packet Tracer are trademarks of Cisco Systems, Inc.',

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
    'error.oldBrowser': 'This browser is too old to open a .pkt file: it takes Safari 16.4, Chrome 80 or Firefox 113',
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
    'action.skip': 'Ir al visor',
    'action.home': 'Trenza, volver al inicio',
    'theme.dark': 'Oscuro',
    'theme.light': 'Claro',

    'intro.title': 'Visor de archivos de Packet Tracer y capturas de red',
    'intro.lead': 'Abrí un {pkt} o {pka} para ver la topología, las interfaces y la configuración de cada equipo, o un {pcap} o {pcapng} para recorrer los paquetes. El archivo se lee en el navegador y no se sube a ningún servidor.',
    'intro.choose': 'Elegir un archivo',
    'intro.example': 'Abrir el ejemplo',
    'intro.hint': 'También podés arrastrar el archivo a la página.',
    'intro.drop': 'Soltá el archivo para abrirlo',
    'intro.shotAlt': 'Parte de la red de ejemplo: un router, un servidor, dos switches de cámaras y las cámaras IP conectadas a ellos, cada una con su nombre y su dirección.',
    'intro.shotCaption': 'El ejemplo es la red de un supermercado diseñada en 2023: 71 equipos, con cámaras IP y Wi-Fi.',

    'about.pktTerm': '.pkt y .pka',
    'about.pktBody': 'Redes armadas en Cisco Packet Tracer. Para abrir una normalmente hay que instalar Packet Tracer y entrar con una cuenta de Cisco.',
    'about.pcapTerm': '.pcap y .pcapng',
    'about.pcapBody': 'Tráfico grabado con Wireshark, tcpdump o el modo simulación de Packet Tracer.',
    'about.privacyTerm': 'Privacidad',
    'about.privacyBody': 'El descifrado corre en el navegador. No hay un servidor que reciba el archivo.',
    'about.limitsTerm': 'Sólo lectura',
    'about.limitsBody': 'No edita ni simula. El diagrama se exporta como PNG, JPG, SVG o PDF, y la captura como CSV o pcap.',
    'about.madeBy': 'Hecho por',
    'about.disclaimer': 'Trenza es un proyecto independiente, sin relación con Cisco ni respaldo de su parte. Cisco y Packet Tracer son marcas registradas de Cisco Systems, Inc.',

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
    'error.oldBrowser': 'Este navegador es demasiado viejo para abrir un .pkt: hace falta Safari 16.4, Chrome 80 o Firefox 113',
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
    // Sin almacenamiento el idioma dura lo que la pestaña.
  }
}

// Corre `write` con otro idioma y restaura el anterior. `write` tiene que ser sincrónico:
// si cediera el turno, el resto de la página se dibujaría en el idioma prestado.
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

const pluralRules = new Map();

function pluralFor(locale, count) {
  let rules = pluralRules.get(locale);
  if (!rules) {
    rules = new Intl.PluralRules(locale);
    pluralRules.set(locale, rules);
  }
  return rules.select(count);
}

// Plantillas ya partidas en literales y nombres: interpolar con regex en cada resumen
// costaba 53 ms en una captura de 100k paquetes.
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

// Con `count` busca primero la variante de plural del idioma (clave#one, clave#other).
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
  for (const node of root.querySelectorAll('[data-i18n-alt]')) {
    node.alt = t(node.dataset.i18nAlt);
  }
  document.documentElement.lang = current;
  delete document.documentElement.dataset.translating;
  document.title = t('app.title');
  document.querySelector('meta[name="description"]').content = t('app.description');
}
