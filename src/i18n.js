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
    'action.exportCapture': 'Export capture',
    'action.close': 'Close',
    'action.cancel': 'Cancel',
    'action.language': 'Language',
    'action.theme': 'Light theme',
    'action.newTab': ', opens in a new tab',
    'action.skip': 'Skip to the viewer',
    'action.home': 'Trenza, back to the start page',
    'action.resizeList': 'Resize the device list',
    'action.resizeFilter': 'Resize the filter column',
    'action.resizePanel': 'Resize the details panel',

    'theme.dark': 'Dark',
    'theme.light': 'Light',

    'intro.title': 'Viewer for Packet Tracer files and network captures',
    'intro.lead': 'Open a {pkt}, {pka} or {pkz} file to see the topology, interfaces and configuration of each device, or a {pcap} or {pcapng} file to go through the packets. The file is read in your browser and is not uploaded anywhere.',
    'intro.choose': 'Choose a file',
    'intro.exampleNetwork': 'Example network',
    'intro.exampleCapture': 'Example capture',
    'intro.hint': 'You can also drag the file onto the page.',
    'intro.drop': 'Drop the file to open it',
    'intro.shotAlt': 'Part of the example network: a router, a server, two camera switches and the IP cameras connected to them, each with its name and address.',
    'intro.shotCaption': 'The example is a supermarket network designed in 2021: 71 devices, with IP cameras and Wi-Fi.',

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
    'status.reading': 'Reading the file...',
    'status.network': '{devices} and {links}',
    'status.capture': '{packets} · {container} format',
    'status.captureCut': '{packets} · {container} format · cut off, {bytes} bytes left unread',
    'status.captureCutEmpty': 'The {container} file is cut off before the first whole packet: {bytes} bytes left unread',
    'status.exporting': 'Drawing the whole diagram...',
    'status.exported': '{file} · {width}×{height} px · {size} kB',
    'status.exportedVector': '{file} · vector · {size} kB',
    'status.exportedPaper': '{file} · {paper} · {size} kB',
    'status.exportedPlain': '{file} · {size} kB',
    'status.exportedCrowded': '{file} · {width}×{height} px · {size} kB · {crowded} overlapping for lack of space',
    'status.exportFailed': 'Export failed: {reason}',
    'status.linkFailed': 'The file in the link could not be opened: {reason}',
    'status.exportedData': '{file} · {packets} · {size} kB',
    'status.exportedInventory': '{file} · {devices} · {size} kB',
    'status.compared': 'Compared with {name}: {devices} with changes',
    'status.compareFailed': 'It could not be compared: {reason}',
    'status.copying': 'Copying the image...',
    'status.copied': 'Image copied, {width}×{height} px: it can be pasted into any document.',
    'status.copyFailed': 'The image could not be copied: {reason}',

    'variant.modern': 'Twofish in EAX mode',
    'variant.legacy': 'None (old format)',

    'unit.devices#one': '{count} device',
    'unit.devices#other': '{count} devices',
    'unit.links#one': '{count} connection',
    'unit.links#other': '{count} connections',
    'unit.packets#one': '{count} packet',
    'unit.packets#other': '{count} packets',
    'unit.labels#one': '{count} label',
    'unit.labels#other': '{count} labels',

    'rail.devices': 'Devices',
    'rail.infrastructure': 'Include infrastructure',
    'rail.searchDevices': 'Name, type, IP, subnet or VLAN',
    'rail.noMatches': 'No matches.',
    'rail.matches': '{shown} of {total}',
    'rail.filter': 'Filter',
    'rail.searchPackets': 'Protocol, address or text',
    'rail.released': '{name} is no longer selected',
    'rail.filterHint': 'Searches the protocol, the addresses and the detail. 2 addresses separated by a space show their conversation. It does not use Wireshark syntax.',
    'rail.multiselect': 'Shift extends the selection, Ctrl or Cmd adds or removes one.',

    'panel.summary': 'Summary',
    'panel.topology': 'Topology',
    'panel.capture': 'Capture',
    'panel.identity': 'Identity',
    'panel.type': 'Type',
    'panel.model': 'Model',
    'panel.links': 'Connections',
    'panel.interfaces': 'Interfaces',
    'panel.connections': 'Connections',
    'panel.path': 'Path to another device',
    'panel.pathAbout': 'Pick another device to see which cables join them.',
    'panel.pathPick': 'Pick a device',
    'panel.pathFound': '{links} on the way:',
    'panel.pathNone': 'No cables join them.',
    'panel.pathIn': 'in through {port}',
    'panel.pathOut': 'out through {port}',
    'panel.pathClear': 'Clear the path',
    'panel.compare': 'Compare',
    'panel.compareAbout': 'Compare this network with another version of it to see what changed: devices, connections and settings.',
    'panel.compareFile': 'Compare with another file',
    'panel.compareInitial': 'Compare with the starting network',
    'panel.comparedWith': 'Compared with {name}.',
    'panel.initialNetwork': 'the starting network of the activity',
    'panel.changedDevices': 'Devices with changes',
    'panel.addedDevices': 'New devices',
    'panel.removedDevices': 'Removed devices',
    'panel.addedLinks': 'New connections',
    'panel.removedLinks': 'Removed connections',
    'panel.movedLinks': 'Connections moved to another port',
    'panel.noChanges': 'There are no differences.',
    'panel.compareLegend': 'In the diagram, devices with changes have a dashed orange ring and new ones a green ring.',
    'panel.tagChanged': 'changed',
    'panel.tagNew': 'new',
    'panel.tagRemoved': 'removed',
    'panel.stopComparing': 'Stop comparing',
    'panel.changes': 'Changes',
    'panel.changeNew': 'It was not in the other version.',
    'panel.renamed': 'It used to be called {name}.',
    'panel.file': 'File',
    'panel.version': 'Packet Tracer version',
    'panel.variant': 'Encryption',
    'panel.unknownVersion': 'unknown',
    'panel.downloadFile': 'Download the original file',
    'panel.gateway': 'Gateway',
    'panel.location': 'Location',
    'panel.label': 'Details',
    'panel.connectedTo': 'connected to',
    'panel.devices': 'Devices',
    'panel.inventory': 'What is in this network',
    'panel.description': 'Description',
    'panel.activity': 'Activity',
    'panel.readInstructions': 'Read the instructions',
    'panel.howTo': 'How to explore',
    'panel.howToText': 'Pick a device in the diagram or in the list to see what it is, what it connects to and how it is set up. To zoom in, use the mouse wheel, the + and - buttons or two fingers. The / key jumps to the search box, which also takes a subnet, such as 192.168.1.0/24, or a VLAN, such as vlan 10.',
    'panel.copy': 'Copy',
    'panel.peek': 'Show details for {name}',
    'panel.copied': 'Copied',
    'panel.copyConfig': 'Copy the running-config',
    'panel.copiedConfig': 'Running-config copied',
    'panel.unnamedPort': 'unnamed port',
    'panel.unknownPeer': 'unknown device',
    'panel.format': 'Format',
    'panel.linkLayer': 'Link layer',
    'panel.packets': 'Packets',
    'panel.totalBytes': 'Total bytes',
    'panel.duration': 'Duration',
    'panel.protocols': 'Protocols',
    'panel.subnets': 'IP networks',
    'panel.review': 'Worth checking',
    'panel.reviewAbout': 'Common mistakes that show in the saved configuration, without simulating the network.',
    'panel.reviewOthers': '{count} more',
    'panel.reviewFlag': 'worth checking',
    'panel.vlan': 'VLAN',
    'panel.voiceVlan': 'Voice VLAN',
    'panel.vlanVia': '{vlan}, through {port} on {device}',
    'panel.reviewMore': 'And {count} more.',
    'review.duplicate': '{address} is repeated on {devices}.',
    'review.subnets': '{device} ({port}, {address}) and {peer} ({peerPort}, {peerAddress}) share a cable but not a network.',
    'review.shutdown': '{device} has {port} shut down, and it has a cable to {peer}.',
    'review.gateway': '{device} uses the gateway {gateway}, outside its network {network}.',
    'review.automatic': '{device} got no address from DHCP: it has {address}.',
    'panel.subnetAutomatic': 'Picked by the device itself: DHCP did not answer',
    'panel.conversations': 'Conversations',
    'panel.conversationAnd': 'and',
    'panel.onlyConversation': 'Show only this conversation',
    'panel.vlans': 'VLANs',
    'panel.routes': 'Static routes',
    'panel.routing': 'Routing protocols',
    'panel.accessLists': 'Access lists',
    'panel.truncated': 'Cut off',
    'panel.truncatedValue': '{bytes} bytes left unread',
    'panel.bytes': 'Bytes',
    'panel.packet': 'Packet {index}',
    'panel.selection': 'Selection',

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
    'table.accessPorts': 'Access ports',
    'table.trunkPorts': 'Trunk ports',
    'table.routedPorts': 'Subinterfaces',
    'table.voicePorts': 'Voice ports',
    'table.native': 'native',
    'table.networks': 'Advertised networks',
    'table.passive': 'Passive',
    'table.accessList': 'List',
    'table.aclRules': 'Rules, in order',
    'table.aclApplied': 'Applied on',
    'table.via': 'Via',
    'table.sortBy': 'Sort by {column}',

    'category.router': 'Router',
    'category.switch': 'Switch',
    'category.wireless': 'Wi-Fi',
    'category.server': 'Server',
    'category.endpoint': 'User device',
    'category.cloud': 'Internet link',
    'category.security': 'Firewall',
    'category.iot': 'IoT',
    'category.infrastructure': 'Infrastructure',
    'category.other': 'Other device',
    'category.router.about': 'Joins different networks and decides where each packet goes, for example out to the Internet.',
    'category.switch.about': 'Connects the devices of one local network by cable.',
    'category.wireless.about': 'Gives Wi-Fi access to nearby devices.',
    'category.server.about': 'Provides services to the rest: web pages, mail, files or automatic addresses.',
    'category.endpoint.about': 'What a person uses: a computer, laptop, phone or printer.',
    'category.cloud.about': 'The link to the Internet or to a provider network.',
    'category.security.about': 'Filters what enters and leaves the network according to rules.',
    'category.iot.about': 'Cameras, sensors and other gadgets connected to the network.',
    'category.infrastructure.about': 'Part of the physical setup, such as a rack, a table or a power strip. It takes no part in the network.',
    'category.other.about': 'A device of a type the viewer does not recognize.',

    'device.unnamed': 'Unnamed',

    'legend.straight': 'Straight copper',
    'legend.crossover': 'Crossover copper',
    'legend.fiber': 'Fiber',
    'legend.serial': 'Serial / coaxial',
    'legend.other': 'Other medium',
    'legend.straight.about': 'The usual network cable: it joins different devices, such as a computer and a switch.',
    'legend.crossover.about': 'Joins two devices of the same kind, such as two switches.',
    'legend.fiber.about': 'Optical fiber, for long distances or heavy traffic.',
    'legend.serial.about': 'A serial link between routers, or a coaxial cable from cable TV.',
    'legend.other.about': 'Console, phone, USB or other connections.',

    'diagram.unconnected': 'Not connected to the network',

    'zoom.in': 'Zoom in',
    'zoom.out': 'Zoom out',
    'zoom.fit': 'Fit the network',

    'export.title': 'Export the diagram',
    'export.lead': 'The whole network is exported, regardless of the current zoom.',
    'export.titleCapture': 'Export the capture',
    'export.leadCapture': 'Every packet is exported, regardless of the filter.',
    'export.name': 'File name',
    'export.format': 'Format',
    'export.resolution': 'Resolution',
    'export.language': 'Language',
    'export.preview': 'Preview',
    'export.previewCrowded': '{crowded} overlapping for lack of space',
    'export.previewCrowdedRaster': '{crowded} overlapping for lack of space: SVG has no such limit',
    'export.theme': 'Theme',
    'export.paper': 'Paper size',
    'export.transparent': 'Transparent background',
    'export.guide': 'Include a legend of device types',
    'export.submit': 'Export',
    'export.copy': 'Copy image',
    'export.pdfNote': 'The PDF holds the diagram as a lossless image, on one page.',
    'export.svgNote': 'The SVG is vector: it scales to any size without losing sharpness, and its text stays selectable.',
    'export.scope': 'Packets',
    'export.scopeAll': 'The whole capture ({count})',
    'export.scopeSelection': 'Only the selection ({count})',
    'export.csvNote': 'CSV opens in any spreadsheet: one row per packet, with its addresses, protocol and description.',
    'export.pcapNote': 'Classic pcap, readable by Wireshark and tcpdump. It keeps the original bytes of each packet.',
    'export.inventoryNote': 'One row per address of each device: name, type, model, interface, address, mask, gateway, state and location. It opens in any spreadsheet.',
    'export.fit': 'Fit to the diagram',
    'export.caption': '{devices} · {links}',

    'csv.timestamp': 'Timestamp',
    'csv.device': 'Device',
    'csv.kind': 'Type',

    'error.noDevices': 'There are no devices to export',
    'error.canvas': 'The browser could not produce the image',
    'error.unknownFormat': 'Unknown format: {format}',
    'error.oldBrowser': 'This browser is too old to open a .pkt file: it needs Safari 16.4, Chrome 80 or Firefox 113',
    'error.decrypt': 'This is not a Packet Tracer .pkt or .pka file, or it is damaged',
    'error.package': 'The .pkz package does not contain a .pkt or .pka file',
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
    'error.compareCapture': 'Only networks can be compared: pick a .pkt, .pka or .pkz.',
    'error.unreachable': 'The server did not answer, or it does not let other sites read the file (CORS)',

    'packet.truncated': 'Truncated packet: only the first layers were read',
    'packet.undissected': '{bytes} bytes not dissected',
    'packet.linkType': 'Link type {type}',
    'packet.lengths': '{source} > {destination} len={length}',
    'packet.tcp': '{source} > {destination} [{flags}] len={length}',
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

    'icmp.echoReply': 'Ping reply (echo reply)',
    'icmp.echoRequest': 'Ping (echo request)',
    'icmp.unreachable': 'Destination unreachable',
    'icmp.redirect': 'Redirect',
    'icmp.ttlExceeded': 'TTL exceeded',
    'icmp.neighborSolicitation': 'Neighbor solicitation',
    'icmp.neighborAdvertisement': 'Neighbor advertisement',

    'protocol.ARP': 'Finds out which device on the local network has an IP address, so data can be sent to it.',
    'protocol.DHCP': 'Hands out IP addresses automatically: a device asks for one and the server assigns it.',
    'protocol.DNS': 'Turns names such as www.example.com into IP addresses.',
    'protocol.HTTP': 'Web pages, without encryption.',
    'protocol.HTTPS': 'Encrypted web pages.',
    'protocol.ICMP': 'Control messages, such as the ping that checks whether a device answers.',
    'protocol.ICMPv6': 'IPv6 control messages: ping and finding neighbours.',
    'protocol.IGMP': 'Tells the network which multicast groups a device wants to join.',
    'protocol.NTP': 'Sets the clock of the devices.',
    'protocol.TCP': 'Transport with guaranteed delivery: data arrives complete and in order.',
    'protocol.UDP': 'Fast transport without guaranteed delivery.',
    'protocol.SSH': 'Encrypted remote access to the console of a device.',
    'protocol.Telnet': 'Remote access to the console of a device, without encryption.',
    'protocol.FTP': 'File transfer.',
    'protocol.TFTP': 'Simple file transfer, used to copy configurations and system images.',
    'protocol.SMTP': 'Sending mail.',
    'protocol.POP3': 'Downloading mail.',
    'protocol.IMAP': 'Reading mail kept on the server.',
    'protocol.SNMP': 'Monitoring and managing network devices.',
    'protocol.OSPF': 'Routers tell each other which networks they know, to build their routes.',
    'protocol.RIP': 'Simple routing: routers share the networks they know every few seconds.',
    'protocol.BGP': 'Routing between Internet providers.',
    'protocol.Syslog': 'Sends event logs to a server.',
    'protocol.RDP': 'Windows remote desktop.',
    'protocol.SMB': 'Shared folders and printers on Windows.',
  },

  es: {
    'app.title': 'Trenza · visor de topologías y capturas de red',
    'app.description': 'Abrí archivos .pkt y .pcap en el navegador. El archivo nunca sale de tu equipo.',

    'action.open': 'Abrir archivo',
    'action.export': 'Exportar diagrama',
    'action.exportCapture': 'Exportar captura',
    'action.close': 'Cerrar',
    'action.cancel': 'Cancelar',
    'action.language': 'Idioma',
    'action.theme': 'Tema claro',
    'action.newTab': ', se abre en otra pestaña',
    'action.skip': 'Ir al visor',
    'action.home': 'Trenza, volver al inicio',
    'action.resizeList': 'Cambiar el tamaño de la lista de equipos',
    'action.resizeFilter': 'Cambiar el tamaño de la columna del filtro',
    'action.resizePanel': 'Cambiar el ancho del panel de detalles',

    'theme.dark': 'Oscuro',
    'theme.light': 'Claro',

    'intro.title': 'Visor de archivos de Packet Tracer y capturas de red',
    'intro.lead': 'Abrí un {pkt}, {pka} o {pkz} para ver la topología, las interfaces y la configuración de cada equipo, o un {pcap} o {pcapng} para recorrer los paquetes. El archivo se lee en el navegador y no se sube a ningún servidor.',
    'intro.choose': 'Elegir un archivo',
    'intro.exampleNetwork': 'Red de ejemplo',
    'intro.exampleCapture': 'Captura de ejemplo',
    'intro.hint': 'También podés arrastrar el archivo a la página.',
    'intro.drop': 'Soltá el archivo para abrirlo',
    'intro.shotAlt': 'Parte de la red de ejemplo: un router, un servidor, dos switches de cámaras y las cámaras IP conectadas a ellos, cada una con su nombre y su dirección.',
    'intro.shotCaption': 'El ejemplo es la red de un supermercado diseñada en 2021: 71 equipos, con cámaras IP y Wi-Fi.',

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
    'status.reading': 'Leyendo el archivo...',
    'status.network': '{devices} y {links}',
    'status.capture': '{packets} · formato {container}',
    'status.captureCut': '{packets} · formato {container} · cortada, quedaron {bytes} bytes sin leer',
    'status.captureCutEmpty': 'El archivo {container} se corta antes del primer paquete entero: quedaron {bytes} bytes sin leer',
    'status.exporting': 'Dibujando el diagrama completo...',
    'status.exported': '{file} · {width}×{height} px · {size} kB',
    'status.exportedVector': '{file} · vectorial · {size} kB',
    'status.exportedPaper': '{file} · {paper} · {size} kB',
    'status.exportedPlain': '{file} · {size} kB',
    'status.exportedCrowded': '{file} · {width}×{height} px · {size} kB · {crowded} encimadas por falta de lugar',
    'status.exportFailed': 'No se pudo exportar: {reason}',
    'status.linkFailed': 'No se pudo abrir el archivo del enlace: {reason}',
    'status.exportedData': '{file} · {packets} · {size} kB',
    'status.exportedInventory': '{file} · {devices} · {size} kB',
    'status.compared': 'Comparada con {name}: {devices} con cambios',
    'status.compareFailed': 'No se pudo comparar: {reason}',
    'status.copying': 'Copiando la imagen...',
    'status.copied': 'Imagen copiada, {width}×{height} px: se puede pegar en cualquier documento.',
    'status.copyFailed': 'No se pudo copiar la imagen: {reason}',

    'variant.modern': 'Twofish en modo EAX',
    'variant.legacy': 'Ninguno (formato viejo)',

    'unit.devices#one': '{count} equipo',
    'unit.devices#other': '{count} equipos',
    'unit.links#one': '{count} conexión',
    'unit.links#other': '{count} conexiones',
    'unit.packets#one': '{count} paquete',
    'unit.packets#other': '{count} paquetes',
    'unit.labels#one': '{count} etiqueta',
    'unit.labels#other': '{count} etiquetas',

    'rail.devices': 'Equipos',
    'rail.infrastructure': 'Incluir infraestructura',
    'rail.searchDevices': 'Nombre, tipo, IP, subred o VLAN',
    'rail.noMatches': 'Sin coincidencias.',
    'rail.matches': '{shown} de {total}',
    'rail.filter': 'Filtro',
    'rail.searchPackets': 'Protocolo, dirección o texto',
    'rail.released': '{name} ya no está elegido',
    'rail.filterHint': 'Busca en el protocolo, las direcciones y el detalle. 2 direcciones separadas por un espacio muestran su conversación. No usa la sintaxis de Wireshark.',
    'rail.multiselect': 'Mayúsculas extiende la selección, Control o Comando suma o quita uno.',

    'panel.summary': 'Resumen',
    'panel.topology': 'Topología',
    'panel.capture': 'Captura',
    'panel.identity': 'Identidad',
    'panel.type': 'Tipo',
    'panel.model': 'Modelo',
    'panel.links': 'Conexiones',
    'panel.interfaces': 'Interfaces',
    'panel.connections': 'Conexiones',
    'panel.path': 'Camino hasta otro equipo',
    'panel.pathAbout': 'Elegí otro equipo para ver por qué cables se unen.',
    'panel.pathPick': 'Elegí un equipo',
    'panel.pathFound': '{links} en el camino:',
    'panel.pathNone': 'No hay cables que los unan.',
    'panel.pathIn': 'entra por {port}',
    'panel.pathOut': 'sale por {port}',
    'panel.pathClear': 'Quitar el camino',
    'panel.compare': 'Comparar',
    'panel.compareAbout': 'Compará esta red con otra versión de la misma para ver qué cambió: equipos, conexiones y configuración.',
    'panel.compareFile': 'Comparar con otro archivo',
    'panel.compareInitial': 'Comparar con la red inicial',
    'panel.comparedWith': 'Comparada con {name}.',
    'panel.initialNetwork': 'la red inicial de la actividad',
    'panel.changedDevices': 'Equipos con cambios',
    'panel.addedDevices': 'Equipos nuevos',
    'panel.removedDevices': 'Equipos quitados',
    'panel.addedLinks': 'Conexiones nuevas',
    'panel.removedLinks': 'Conexiones quitadas',
    'panel.movedLinks': 'Conexiones que cambiaron de puerto',
    'panel.noChanges': 'No hay diferencias.',
    'panel.compareLegend': 'En el diagrama, los equipos con cambios llevan un anillo naranja punteado y los nuevos, uno verde.',
    'panel.tagChanged': 'cambió',
    'panel.tagNew': 'nuevo',
    'panel.tagRemoved': 'quitado',
    'panel.stopComparing': 'Dejar de comparar',
    'panel.changes': 'Cambios',
    'panel.changeNew': 'No estaba en la otra versión.',
    'panel.renamed': 'Antes se llamaba {name}.',
    'panel.file': 'Archivo',
    'panel.version': 'Versión de Packet Tracer',
    'panel.variant': 'Cifrado',
    'panel.unknownVersion': 'desconocida',
    'panel.downloadFile': 'Descargar el archivo original',
    'panel.gateway': 'Puerta de enlace',
    'panel.location': 'Ubicación',
    'panel.label': 'Detalles',
    'panel.connectedTo': 'conectado a',
    'panel.devices': 'Equipos',
    'panel.inventory': 'Qué hay en la red',
    'panel.description': 'Descripción',
    'panel.activity': 'Actividad',
    'panel.readInstructions': 'Leer las instrucciones',
    'panel.howTo': 'Cómo explorar',
    'panel.howToText': 'Elegí un equipo en el diagrama o en la lista para ver qué es, con qué se conecta y cómo está configurado. Para acercar el diagrama usá la rueda del mouse, los botones + y - o dos dedos. La tecla / lleva al buscador, que también acepta una subred, como 192.168.1.0/24, o una VLAN, como vlan 10.',
    'panel.copy': 'Copiar',
    'panel.peek': 'Ver detalles de {name}',
    'panel.copied': 'Copiada',
    'panel.copyConfig': 'Copiar la running-config',
    'panel.copiedConfig': 'Running-config copiada',
    'panel.unnamedPort': 'puerto sin nombre',
    'panel.unknownPeer': 'equipo desconocido',
    'panel.format': 'Formato',
    'panel.linkLayer': 'Capa de enlace',
    'panel.packets': 'Paquetes',
    'panel.totalBytes': 'Bytes totales',
    'panel.duration': 'Duración',
    'panel.protocols': 'Protocolos',
    'panel.subnets': 'Redes IP',
    'panel.review': 'Para revisar',
    'panel.reviewAbout': 'Errores frecuentes que se ven en la configuración guardada, sin simular la red.',
    'panel.reviewOthers': '{count} más',
    'panel.reviewFlag': 'para revisar',
    'panel.vlan': 'VLAN',
    'panel.voiceVlan': 'VLAN de voz',
    'panel.vlanVia': '{vlan}, por {port} de {device}',
    'panel.reviewMore': 'Y {count} más.',
    'review.duplicate': '{address} está repetida en {devices}.',
    'review.subnets': '{device} ({port}, {address}) y {peer} ({peerPort}, {peerAddress}) comparten un cable pero no una red.',
    'review.shutdown': '{device} tiene apagado {port} (shutdown), y tiene un cable hacia {peer}.',
    'review.gateway': '{device} usa la puerta de enlace {gateway}, fuera de su red {network}.',
    'review.automatic': '{device} no recibió dirección por DHCP: tiene {address}.',
    'panel.subnetAutomatic': 'La eligió el propio equipo: el DHCP no le contestó',
    'panel.conversations': 'Conversaciones',
    'panel.conversationAnd': 'y',
    'panel.onlyConversation': 'Ver sólo esta conversación',
    'panel.vlans': 'VLAN',
    'panel.routes': 'Rutas estáticas',
    'panel.routing': 'Protocolos de enrutamiento',
    'panel.accessLists': 'Listas de acceso',
    'panel.truncated': 'Cortada',
    'panel.truncatedValue': 'quedaron {bytes} bytes sin leer',
    'panel.bytes': 'Bytes',
    'panel.packet': 'Paquete {index}',
    'panel.selection': 'Selección',

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
    'table.accessPorts': 'Puertos de acceso',
    'table.trunkPorts': 'Troncos',
    'table.routedPorts': 'Subinterfaces',
    'table.voicePorts': 'Puertos de voz',
    'table.native': 'nativa',
    'table.networks': 'Redes anunciadas',
    'table.passive': 'Pasivas',
    'table.accessList': 'Lista',
    'table.aclRules': 'Reglas, en orden',
    'table.aclApplied': 'Aplicada en',
    'table.via': 'Por',
    'table.sortBy': 'Ordenar por {column}',

    'category.router': 'Router',
    'category.switch': 'Switch',
    'category.wireless': 'Wi-Fi',
    'category.server': 'Servidor',
    'category.endpoint': 'Equipo de usuario',
    'category.cloud': 'Salida a Internet',
    'category.security': 'Firewall',
    'category.iot': 'IoT',
    'category.infrastructure': 'Infraestructura',
    'category.other': 'Otro equipo',
    'category.router.about': 'Une redes distintas y decide por dónde sale cada paquete, por ejemplo hacia Internet.',
    'category.switch.about': 'Conecta por cable los equipos de una misma red local.',
    'category.wireless.about': 'Da conexión Wi-Fi a los equipos que están cerca.',
    'category.server.about': 'Ofrece servicios al resto: páginas web, correo, archivos o direcciones automáticas.',
    'category.endpoint.about': 'Lo que usa una persona: computadora, notebook, teléfono o impresora.',
    'category.cloud.about': 'La conexión con Internet o con la red de un proveedor.',
    'category.security.about': 'Filtra lo que entra y sale de la red según reglas.',
    'category.iot.about': 'Cámaras, sensores y otros aparatos conectados a la red.',
    'category.infrastructure.about': 'Parte del armado físico, como un rack, una mesa o una regleta. No participa de la red.',
    'category.other.about': 'Un equipo de un tipo que el visor no reconoce.',

    'device.unnamed': 'Sin nombre',

    'legend.straight': 'Cobre directo',
    'legend.crossover': 'Cobre cruzado',
    'legend.fiber': 'Fibra',
    'legend.serial': 'Serial / coaxial',
    'legend.other': 'Otro medio',
    'legend.straight.about': 'El cable de red común: une equipos distintos, como una computadora y un switch.',
    'legend.crossover.about': 'Une dos equipos del mismo tipo, como dos switches.',
    'legend.fiber.about': 'Fibra óptica, para distancias largas o mucho tráfico.',
    'legend.serial.about': 'Un enlace serial entre routers, o un coaxial de televisión por cable.',
    'legend.other.about': 'Consola, teléfono, USB u otras conexiones.',

    'diagram.unconnected': 'Sin conexión con la red',

    'zoom.in': 'Acercar',
    'zoom.out': 'Alejar',
    'zoom.fit': 'Encuadrar la red',

    'export.title': 'Exportar el diagrama',
    'export.lead': 'Se exporta la red entera, sin importar el zoom actual.',
    'export.titleCapture': 'Exportar la captura',
    'export.leadCapture': 'Se exportan todos los paquetes, sin importar el filtro.',
    'export.name': 'Nombre del archivo',
    'export.format': 'Formato',
    'export.resolution': 'Resolución',
    'export.language': 'Idioma',
    'export.preview': 'Vista previa',
    'export.previewCrowded': '{crowded} encimadas por falta de lugar',
    'export.previewCrowdedRaster': '{crowded} encimadas por falta de lugar: el SVG no tiene ese límite',
    'export.theme': 'Tema',
    'export.paper': 'Tamaño de hoja',
    'export.transparent': 'Fondo transparente',
    'export.guide': 'Incluir la guía de tipos de equipo',
    'export.submit': 'Exportar',
    'export.copy': 'Copiar imagen',
    'export.pdfNote': 'El PDF lleva el diagrama como imagen sin pérdida, en una sola hoja.',
    'export.svgNote': 'El SVG es vectorial: se agranda a cualquier tamaño sin perder nitidez y su texto se puede seleccionar.',
    'export.scope': 'Paquetes',
    'export.scopeAll': 'La captura entera ({count})',
    'export.scopeSelection': 'Sólo la selección ({count})',
    'export.csvNote': 'El CSV se abre en cualquier planilla: una fila por paquete, con sus direcciones, su protocolo y su descripción.',
    'export.pcapNote': 'Pcap clásico, se abre con Wireshark o tcpdump. Conserva los bytes originales de cada paquete.',
    'export.inventoryNote': 'Una fila por dirección de cada equipo: nombre, tipo, modelo, interfaz, dirección, máscara, puerta de enlace, estado y ubicación. Se abre en cualquier planilla.',
    'export.fit': 'Ajustar al diagrama',
    'export.caption': '{devices} · {links}',

    'csv.timestamp': 'Marca de tiempo',
    'csv.device': 'Equipo',
    'csv.kind': 'Tipo',

    'error.noDevices': 'No hay equipos para exportar',
    'error.canvas': 'El navegador no pudo generar la imagen',
    'error.unknownFormat': 'Formato desconocido: {format}',
    'error.oldBrowser': 'Este navegador es demasiado viejo para abrir un .pkt: hace falta Safari 16.4, Chrome 80 o Firefox 113',
    'error.decrypt': 'Este archivo no es un .pkt ni un .pka de Packet Tracer, o está dañado',
    'error.package': 'El paquete .pkz no contiene un archivo .pkt ni .pka',
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
    'error.compareCapture': 'Sólo se comparan redes: elegí un .pkt, .pka o .pkz.',
    'error.unreachable': 'El servidor no respondió, o no deja que otros sitios lean el archivo (CORS)',

    'packet.truncated': 'Paquete truncado: sólo se leyeron las capas iniciales',
    'packet.undissected': '{bytes} bytes sin desglosar',
    'packet.linkType': 'Enlace tipo {type}',
    'packet.lengths': '{source} > {destination} len={length}',
    'packet.tcp': '{source} > {destination} [{flags}] len={length}',
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

    'icmp.echoReply': 'Respuesta al ping (eco)',
    'icmp.echoRequest': 'Ping (solicitud de eco)',
    'icmp.unreachable': 'Destino inalcanzable',
    'icmp.redirect': 'Redirección',
    'icmp.ttlExceeded': 'TTL excedido',
    'icmp.neighborSolicitation': 'Solicitud de vecino',
    'icmp.neighborAdvertisement': 'Anuncio de vecino',

    'protocol.ARP': 'Averigua qué equipo de la red local tiene una dirección IP, para poder mandarle datos.',
    'protocol.DHCP': 'Reparte direcciones IP automáticamente: un equipo pide una y el servidor se la asigna.',
    'protocol.DNS': 'Traduce nombres como www.ejemplo.com a direcciones IP.',
    'protocol.HTTP': 'Páginas web, sin cifrar.',
    'protocol.HTTPS': 'Páginas web cifradas.',
    'protocol.ICMP': 'Mensajes de control, como el ping que prueba si un equipo responde.',
    'protocol.ICMPv6': 'Mensajes de control de IPv6: el ping y la búsqueda de vecinos.',
    'protocol.IGMP': 'Avisa a qué grupos de difusión (multicast) quiere unirse un equipo.',
    'protocol.NTP': 'Pone en hora el reloj de los equipos.',
    'protocol.TCP': 'Transporte con entrega garantizada: los datos llegan completos y en orden.',
    'protocol.UDP': 'Transporte rápido sin garantía de entrega.',
    'protocol.SSH': 'Acceso remoto cifrado a la consola de un equipo.',
    'protocol.Telnet': 'Acceso remoto a la consola de un equipo, sin cifrar.',
    'protocol.FTP': 'Transferencia de archivos.',
    'protocol.TFTP': 'Transferencia de archivos simple, usada para copiar configuraciones e imágenes de sistema.',
    'protocol.SMTP': 'Envío de correo.',
    'protocol.POP3': 'Descarga de correo.',
    'protocol.IMAP': 'Lectura del correo que queda en el servidor.',
    'protocol.SNMP': 'Monitoreo y administración de equipos de red.',
    'protocol.OSPF': 'Los routers se cuentan qué redes conocen para armar sus rutas.',
    'protocol.RIP': 'Enrutamiento simple: los routers comparten cada pocos segundos las redes que conocen.',
    'protocol.BGP': 'Enrutamiento entre proveedores de Internet.',
    'protocol.Syslog': 'Manda los registros de eventos a un servidor.',
    'protocol.RDP': 'Escritorio remoto de Windows.',
    'protocol.SMB': 'Carpetas e impresoras compartidas en Windows.',
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

// Sin elección guardada, el primer idioma del navegador que haya traducido. El guion de la
// cabecera de index.html hace la misma cuenta para no pintar primero en inglés.
function browserLanguage() {
  if (typeof document === 'undefined') return null;
  const preferred = navigator.languages?.length ? navigator.languages : [navigator.language ?? ''];
  return preferred.map((tag) => tag.slice(0, 2)).find((code) => DICTIONARIES[code]) ?? null;
}

let current = storedLanguage() || browserLanguage() || DEFAULT_LANGUAGE;

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
// cuesta 53 ms en una captura de 100k paquetes.
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
      pkz: '<b>.pkz</b>',
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
