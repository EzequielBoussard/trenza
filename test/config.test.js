import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  readAccessLists,
  readInterfaces,
  readRoutes,
  readRoutingProtocols,
  readVlans,
} from '../src/pkt/config.js';
import { compareNetworks, configChanges } from '../src/pkt/compare.js';
import { reviewNetwork } from '../src/pkt/review.js';
import { inSubnet, macDigits, parseConversation, parseQuery, subnetsOf, vlanMembers } from '../src/pkt/query.js';

const SWITCH = `
!
hostname Acceso1
!
vlan 10
 name Ventas
!
vlan 20
 name Camaras
!
interface FastEthernet0/1
 switchport access vlan 10
 switchport mode access
!
interface FastEthernet0/2
 description Camara del hall
 switchport access vlan 20
!
interface GigabitEthernet0/1
 switchport mode trunk
 switchport trunk allowed vlan 10,20
 switchport trunk allowed vlan add 30-32
!
interface Vlan10
 ip address 192.168.10.2 255.255.255.0
!
`.split('\n');

const ROUTER = `
!
interface GigabitEthernet0/0
 ip address 192.168.1.1 255.255.255.0
 no shutdown
!
interface GigabitEthernet0/1
 ip address 10.0.0.1 255.255.255.252
 shutdown
!
ip route 0.0.0.0 0.0.0.0 200.40.30.1
ip route 172.16.0.0 255.255.0.0 10.0.0.2
ipv6 route 2001:db8::/32 2001:db8:1::1
!
`.split('\n');

test('lee las interfaces con su dirección, su descripción y si están apagadas', () => {
  const interfaces = readInterfaces(ROUTER);
  assert.equal(interfaces.length, 2);

  assert.deepEqual(interfaces[0].addresses, [{ address: '192.168.1.1', mask: '255.255.255.0' }]);
  assert.equal(interfaces[0].enabled, true);
  assert.equal(interfaces[1].enabled, false, 'shutdown no apagó la interfaz');
});

test('las VLAN declaradas en el árbol valen aunque la configuración no las nombre', () => {
  // Configurado desde la interfaz gráfica: las VLAN sólo están en el XML.
  const config = ['!', 'interface FastEthernet0/1', ' switchport access vlan 10', '!'];
  const declared = [
    { id: '1', name: 'default' },
    { id: '10', name: 'itdept' },
    { id: '20', name: 'marketing' },
    { id: '1002', name: 'fddi-default' },
  ];

  const vlans = readVlans(config, readInterfaces(config), declared);

  assert.deepEqual(vlans.map((vlan) => `${vlan.id}:${vlan.name}`), ['10:itdept', '20:marketing'],
    'las de fábrica no se filtraron, o se perdió el nombre del árbol');
  assert.deepEqual(vlans[0].ports, ['FastEthernet0/1']);
});

test('un tronco sin lista de permitidas lleva todas las VLAN', () => {
  const config = [
    '!', 'interface FastEthernet0/1', ' switchport access vlan 10',
    '!', 'interface FastEthernet0/3', ' switchport mode trunk', '!',
  ];
  const declared = [{ id: '10', name: 'itdept' }, { id: '20', name: 'marketing' }];

  const vlans = readVlans(config, readInterfaces(config), declared);

  assert.deepEqual(vlans.find((vlan) => vlan.id === '10').trunks, ['FastEthernet0/3']);
  assert.deepEqual(vlans.find((vlan) => vlan.id === '20').trunks, ['FastEthernet0/3'],
    'el tronco no alcanzó a una VLAN en la que no hay ningún puerto de acceso');
});

test('una VLAN de fábrica se muestra si algún puerto la nombra', () => {
  const config = ['!', 'interface FastEthernet0/1', ' switchport access vlan 1', '!'];
  const vlans = readVlans(config, readInterfaces(config), [{ id: '1', name: 'default' }]);

  assert.deepEqual(vlans.map((vlan) => vlan.id), ['1']);
});

test('cruza los bloques de VLAN con los puertos que las llevan', () => {
  const vlans = readVlans(SWITCH, readInterfaces(SWITCH));
  const porId = new Map(vlans.map((vlan) => [vlan.id, vlan]));

  assert.equal(porId.get('10').name, 'Ventas');
  assert.deepEqual(porId.get('10').ports, ['FastEthernet0/1']);
  assert.deepEqual(porId.get('20').ports, ['FastEthernet0/2']);
  assert.deepEqual(porId.get('10').trunks, ['GigabitEthernet0/1']);

  // El rango del tronco se expande, y una VLAN que sólo aparece ahí existe igual.
  assert.deepEqual(vlans.map((vlan) => vlan.id), ['10', '20', '30', '31', '32']);
  assert.equal(porId.get('31').name, '', 'una VLAN sin bloque propio no tiene nombre');
  assert.deepEqual(porId.get('31').ports, [], 'ningún puerto de acceso en una VLAN de tronco');
});

test('un puerto de acceso sin dirección igual cuenta para su VLAN', () => {
  const interfaces = readInterfaces(SWITCH);
  const acceso = interfaces.find((entry) => entry.name === 'FastEthernet0/1');

  assert.deepEqual(acceso.addresses, [], 'el puerto no tiene dirección');
  assert.equal(acceso.vlan, '10');
});

test('lee las rutas escritas a mano, incluidas las de IPv6', () => {
  assert.deepEqual(readRoutes(ROUTER), [
    { destination: '0.0.0.0', mask: '0.0.0.0', via: '200.40.30.1' },
    { destination: '172.16.0.0', mask: '255.255.0.0', via: '10.0.0.2' },
    { destination: '2001:db8::/32', mask: '', via: '2001:db8:1::1' },
  ]);
});

test('una configuración sin VLAN ni rutas no inventa ninguna', () => {
  const plano = ['!', 'hostname PC', '!', 'interface FastEthernet0/0', ' ip address 10.0.0.9 255.0.0.0', '!'];

  assert.deepEqual(readVlans(plano, readInterfaces(plano)), []);
  assert.deepEqual(readRoutes(plano), []);
  assert.deepEqual(readRoutingProtocols(plano), []);
  assert.deepEqual(readAccessLists(plano, readInterfaces(plano)), []);
});

const ROUTER_ON_A_STICK = `
!
interface GigabitEthernet0/0.10
 encapsulation dot1Q 10
 ip address 192.168.10.1 255.255.255.0
!
interface GigabitEthernet0/0.20
 encapsulation dot1Q 20
 ip address 192.168.20.1 255.255.255.0
!
`.split('\n');

test('una subinterfaz con dot1Q es la puerta de enlace de su VLAN, no un puerto de acceso', () => {
  const interfaces = readInterfaces(ROUTER_ON_A_STICK);
  const vlans = readVlans(ROUTER_ON_A_STICK, interfaces, [{ id: '10', name: 'Ventas' }]);

  assert.deepEqual(vlans.map((vlan) => vlan.id), ['10', '20']);
  assert.deepEqual(vlans[0].routed, ['GigabitEthernet0/0.10']);
  assert.deepEqual(vlans[0].ports, [], 'la subinterfaz se contó como puerto de acceso');
  assert.deepEqual(vlans[1].routed, ['GigabitEthernet0/0.20']);
});

const FILTRADO = `
!
interface GigabitEthernet0/0
 ip address 200.40.30.2 255.255.255.0
 ip access-group 110 in
 ip access-group SALIDA out
!
access-list 110 remark bloquea la web
access-list 110 deny tcp any host 10.0.0.5 eq 80
access-list 110 permit ip any any
!
ip access-list extended SALIDA
 permit tcp 192.168.1.0 0.0.0.255 any eq 443
 deny ip any any
!
router ospf 1
 router-id 1.1.1.1
 passive-interface GigabitEthernet0/1
 network 192.168.1.0 0.0.0.255 area 0
 network 10.0.0.0 0.0.0.3 area 0
!
router rip
 version 2
 network 172.16.0.0
 no auto-summary
!
`.split('\n');

test('lee las listas de acceso con sus reglas en orden y dónde están aplicadas', () => {
  const lists = readAccessLists(FILTRADO, readInterfaces(FILTRADO));
  const porId = new Map(lists.map((list) => [list.id, list]));

  assert.deepEqual([...porId.keys()], ['110', 'SALIDA']);
  assert.deepEqual(porId.get('110').rules, [
    'remark bloquea la web',
    'deny tcp any host 10.0.0.5 eq 80',
    'permit ip any any',
  ]);
  assert.deepEqual(porId.get('110').inbound, ['GigabitEthernet0/0']);
  assert.deepEqual(porId.get('110').outbound, []);

  // La nombrada abre un bloque y sus reglas están adentro, indentadas.
  assert.deepEqual(porId.get('SALIDA').rules, [
    'permit tcp 192.168.1.0 0.0.0.255 any eq 443',
    'deny ip any any',
  ]);
  assert.deepEqual(porId.get('SALIDA').outbound, ['GigabitEthernet0/0']);
});

test('una lista aplicada pero no escrita igual aparece, porque el equipo la nombra', () => {
  const config = ['!', 'interface FastEthernet0/0', ' ip access-group 7 in', '!'];
  const [list] = readAccessLists(config, readInterfaces(config));

  assert.equal(list.id, '7');
  assert.deepEqual(list.rules, []);
  assert.deepEqual(list.inbound, ['FastEthernet0/0']);
});

test('lee los protocolos de enrutamiento con sus redes y sus interfaces pasivas', () => {
  const protocols = readRoutingProtocols(FILTRADO);

  assert.deepEqual(protocols.map((entry) => `${entry.protocol} ${entry.id}`.trim()), ['OSPF 1', 'RIP']);
  assert.deepEqual(protocols[0].networks, ['192.168.1.0 0.0.0.255 area 0', '10.0.0.0 0.0.0.3 area 0']);
  assert.deepEqual(protocols[0].passive, ['GigabitEthernet0/1']);
  assert.equal(protocols[1].version, '2');
  assert.deepEqual(protocols[1].networks, ['172.16.0.0']);
});

test('un bloque de protocolo vacío igual cuenta: el equipo lo tiene activado', () => {
  // `router rip` sin ninguna sentencia.
  const [rip] = readRoutingProtocols(['!', 'router rip', '!', 'ip classless', '!']);

  assert.equal(rip.protocol, 'RIP');
  assert.deepEqual(rip.networks, []);
});

test('la red de un protocolo no se confunde con la de otro bloque', () => {
  const config = ['!', 'router rip', ' network 10.0.0.0', '!', 'ip dhcp pool LAN', ' network 192.168.1.0 255.255.255.0', '!'];
  const [rip] = readRoutingProtocols(config);

  assert.deepEqual(rip.networks, ['10.0.0.0'], 'se coló la red de la reserva de DHCP');
});

test('OSPF activado en la interfaz cuenta como red del proceso, con su router-id', () => {
  const config = `
!
interface GigabitEthernet0/0/0
 ip address 10.0.1.1 255.255.255.248
 ip ospf cost 10
 ip ospf 10 area 0
!
interface Serial0/1/0
 ipv6 address 2001:db8:acad:1::1/64
 ipv6 ospf 20 area 1
!
router ospf 10
 router-id 6.6.6.6
 passive-interface GigabitEthernet0/0/0
!
ipv6 router ospf 20
 router-id 7.7.7.7
!
`.split('\n');
  const protocols = readRoutingProtocols(config, readInterfaces(config));

  assert.deepEqual(protocols.map((entry) => [entry.protocol, entry.id, entry.version, entry.routerId]), [
    ['OSPF', '10', '', '6.6.6.6'],
    ['OSPF', '20', '3', '7.7.7.7'],
  ]);
  assert.deepEqual(protocols[0].networks, ['GigabitEthernet0/0/0 area 0'], '"ip ospf cost" se leyó como área');
  assert.deepEqual(protocols[1].networks, ['Serial0/1/0 area 1']);
});

test('una lista en las líneas vty filtra el acceso remoto y cuenta como aplicada', () => {
  const config = `
!
ip access-list standard ADMIN
 permit 192.168.1.64 0.0.0.7
!
line con 0
!
line vty 0 4
 access-class ADMIN in
 login
line vty 5 15
 access-class ADMIN in
!
`.split('\n');
  const [list] = readAccessLists(config, readInterfaces(config));

  assert.deepEqual(list.rules, ['permit 192.168.1.64 0.0.0.7']);
  assert.deepEqual(list.inbound, ['vty 0 4', 'vty 5 15']);
});

test('la VLAN de voz y la nativa del tronco quedan anotadas en su VLAN', () => {
  const config = `
!
interface FastEthernet0/11
 switchport access vlan 10
 switchport mode access
 switchport voice vlan 40
!
interface GigabitEthernet0/1
 switchport trunk native vlan 99
 switchport mode trunk
!
`.split('\n');
  const vlans = new Map(readVlans(config, readInterfaces(config)).map((vlan) => [vlan.id, vlan]));

  assert.deepEqual([...vlans.keys()], ['10', '40', '99']);
  assert.deepEqual(vlans.get('40').voice, ['FastEthernet0/11']);
  assert.deepEqual(vlans.get('40').ports, [], 'el puerto de voz se contó como de acceso');
  assert.deepEqual(vlans.get('99').native, ['GigabitEthernet0/1']);
  assert.deepEqual(vlans.get('99').trunks, ['GigabitEthernet0/1']);
});

test('el buscador entiende subredes de IPv4 e IPv6 y VLAN', () => {
  const v4 = parseQuery(' 192.168.1.0/24 ');
  assert.equal(v4.kind, 'subnet');
  assert.ok(inSubnet('192.168.1.200', v4));
  assert.ok(!inSubnet('192.168.2.1', v4));
  assert.ok(inSubnet('10.9.8.7', parseQuery('10.0.0.0/8')));
  assert.ok(inSubnet('0.0.0.1', parseQuery('0.0.0.0/0')));

  const v6 = parseQuery('2001:db8:acad::/48');
  assert.ok(inSubnet('2001:DB8:ACAD:1::1/64', v6), 'IOS guarda la dirección con su prefijo');
  assert.ok(inSubnet('FE80::1 link-local', parseQuery('fe80::/10')));
  assert.ok(!inSubnet('2001:db8:acae::1', v6));
  assert.ok(!inSubnet('192.168.1.1', v6), 'una IPv4 nunca entra en una red IPv6');

  assert.deepEqual(parseQuery('VLAN 010'), { kind: 'vlan', id: '10' });
  assert.equal(parseQuery('192.168.1.0/33').kind, 'text', 'un prefijo imposible es texto');
  assert.equal(parseQuery('Router/2').kind, 'text');
});

test('una MAC se busca como la muestra la captura, como la guarda IOS o pegada', () => {
  assert.equal(macDigits('00:01:63:43:a2:b1'), '00016343a2b1');
  assert.equal(macDigits('00-01-63'), '000163');
  assert.equal(macDigits('00:01:6'), '00016', 'mientras se escribe');
  assert.equal(macDigits('0001.6343.a2b1'), '00016343a2b1');
  assert.equal(macDigits('00016343a2b1'), '00016343a2b1');
  assert.equal(macDigits('192.168.1'), '', 'una IPv4 a medio escribir no es una MAC');
  assert.equal(macDigits('fe80::1'), '');
  assert.equal(macDigits('router'), '');
});

test('las redes IP salen de las interfaces, en orden, y cada una se puede buscar', () => {
  const device = (...addresses) => ({ interfaces: [{ addresses: addresses.map(([address, mask = '']) => ({ address, mask })) }] });
  const devices = [
    device(['192.168.10.1', '255.255.255.0'], ['10.0.0.1', '255.255.255.252'], ['2001:DB8:ACAD:10::1/64'], ['FE80::1']),
    device(['192.168.10.20', '255.255.255.0'], ['192.168.10.21', '255.255.255.0']),
    device(['10.0.0.2', '255.255.255.252'], ['0.0.0.0', '0.0.0.0'], ['2001:db8:acad:10::2/64']),
    device(['192.168.2.5', '255.0.255.0'], ['dhcp'], ['172.16.0.9', '']),
  ];
  const subnets = subnetsOf(devices);
  assert.deepEqual(subnets, [
    { cidr: '10.0.0.0/30', count: 2 },
    { cidr: '192.168.10.0/24', count: 2 },
    { cidr: '2001:db8:acad:10::/64', count: 2 },
  ], 'una máscara salteada, una dirección sin máscara y la de enlace local no cuentan');
  for (const { cidr } of subnets) assert.equal(parseQuery(cidr).kind, 'subnet');
  assert.equal(subnetsOf([device(['2001:0:0:1:0:0:0:1/128'])])[0].cidr, '2001:0:0:1::1/128');
});

test('2 direcciones en el filtro de paquetes son una conversación', () => {
  assert.deepEqual(parseConversation(' 192.0.2.1   198.51.100.7 '), ['192.0.2.1', '198.51.100.7']);
  assert.deepEqual(parseConversation('2001:DB8::1 2001:db8::2'), ['2001:db8::1', '2001:db8::2']);
  assert.deepEqual(parseConversation('00:00:5e:00:53:01 00:00:5e:00:53:02'), ['00:00:5e:00:53:01', '00:00:5e:00:53:02']);
  assert.equal(parseConversation('tcp 80'), null);
  assert.equal(parseConversation('192.0.2.1'), null);
  assert.equal(parseConversation('192.0.2.0/24 192.0.2.1'), null, 'una subred no es un extremo');
  assert.equal(parseConversation('192.0.2.1 198.51.100.7 203.0.113.9'), null);
});

test('en una VLAN entran el switch, el router que la enruta y lo enchufado a sus puertos de acceso', () => {
  const vlan = (id, ports = [], voice = [], routed = []) => ({ id, name: '', ports, voice, trunks: [], native: [], routed });
  const model = {
    devices: [
      { id: 's1', vlans: [vlan('10', ['FastEthernet0/1']), vlan('40', [], ['FastEthernet0/2'])],
        links: [{ port: 'FastEthernet0/1', peerId: 'pc1' }, { port: 'fastethernet0/2', peerId: 'phone' }, { port: 'Gig0/1', peerId: 'r1' }] },
      { id: 'r1', vlans: [vlan('10', [], [], ['Gig0/0.10'])], links: [] },
      { id: 'pc1', vlans: [], links: [] },
      { id: 'phone', vlans: [], links: [] },
      { id: 'pc2', vlans: [], links: [] },
    ],
  };
  const members = vlanMembers(model);

  assert.deepEqual([...members.get('10')].sort(), ['pc1', 'r1', 's1']);
  assert.deepEqual([...members.get('40')].sort(), ['phone', 's1']);
});

test('comparar 2 versiones de una red encuentra equipos, conexiones, configuración y direcciones', () => {
  const device = (id, name, runningConfig = [], interfaces = []) => ({ id, name, runningConfig, interfaces, links: [] });
  const pc = (id, name, address, gateway) => device(id, name, [], [{ name: '', mac: '0001', gateway, enabled: true, addresses: [{ address, mask: '255.255.255.0' }] }]);
  const before = {
    devices: [
      device('s1', 'S1', ['!', 'hostname S1', '!', 'interface FastEthernet0/1', ' switchport mode access', '!', 'interface FastEthernet0/2', '!', 'end']),
      pc('pc1', 'PC1', '192.168.1.10', '192.168.1.1'),
      device('viejo', 'Router viejo'),
    ],
    links: [{ from: 's1', fromPort: 'Fa0/1', to: 'pc1', toPort: 'Fa0' }, { from: 's1', fromPort: 'Fa0/24', to: 'viejo', toPort: 'Gi0/0' }],
  };
  const after = {
    devices: [
      device('s1', 'Switch piso 1', ['!', 'hostname S1', '!', 'interface FastEthernet0/1', ' switchport access vlan 10', ' switchport mode access', '!', 'interface FastEthernet0/2', '!', 'end']),
      pc('pc1', 'PC1', '192.168.1.20', '192.168.1.1'),
      device('nuevo', 'R2'),
    ],
    links: [{ from: 'pc1', fromPort: 'Fa0', to: 's1', toPort: 'Fa0/1' }, { from: 's1', fromPort: 'Gi0/1', to: 'nuevo', toPort: 'Gi0/0' }],
  };
  const result = compareNetworks(before, after);

  assert.deepEqual(result.added.map((d) => d.name), ['R2']);
  assert.deepEqual(result.removed.map((d) => d.name), ['Router viejo']);
  assert.deepEqual([...result.changed.keys()], ['s1', 'pc1']);
  assert.equal(result.changed.get('s1').renamed, 'S1');
  assert.deepEqual(result.changed.get('s1').config, [
    { type: 'context', text: 'interface FastEthernet0/1' },
    { type: 'added', text: ' switchport access vlan 10' },
  ]);
  assert.deepEqual(result.changed.get('pc1').addresses.map((c) => `${c.type} ${c.address}`), ['removed 192.168.1.10', 'added 192.168.1.20']);
  assert.deepEqual(result.linksAdded.map((l) => `${l.fromPort}-${l.toPort}`), ['Gi0/1-Gi0/0'], 'la misma conexión al revés se contó como nueva');
  assert.deepEqual(result.linksRemoved.map((l) => `${l.fromName} ${l.fromPort} ${l.toName}`), ['S1 Fa0/24 Router viejo']);
});

test('una configuración igual salvo lo que IOS reescribe al guardar no tiene cambios', () => {
  const a = { runningConfig: ['!', 'Building configuration...', 'Current configuration : 1234 bytes', 'hostname R1', 'end'] };
  const b = { runningConfig: ['Building configuration...', '', 'Current configuration : 1301 bytes', '!', 'hostname R1   ', '!', 'end'] };
  assert.deepEqual(configChanges(a, b), []);
});

test('el mismo cable con el puerto nombrado distinto cambió de puerto, sin aparecer como nuevo y quitado', () => {
  const device = (id, name) => ({ id, name, runningConfig: [], interfaces: [], links: [] });
  const before = { devices: [device('0', 'PC'), device('1', 'Switch0')], links: [{ from: '0', fromPort: 'FastEthernet', to: '1', toPort: 'Fa0/1' }] };
  const after = { devices: [device('a', 'PC'), device('b', 'Switch0')], links: [{ from: 'b', fromPort: 'Fa0/1', to: 'a', toPort: 'FastEthernet0' }] };
  const result = compareNetworks(before, after);

  assert.equal(result.linksAdded.length, 0);
  assert.equal(result.linksRemoved.length, 0);
  assert.deepEqual(result.linksMoved.map(({ before: old, after: now }) => `${old.fromPort} > ${now.toPort}`), ['FastEthernet > FastEthernet0']);
});

test('la revisión encuentra direcciones repetidas, puertas de enlace, puertos apagados y cables entre redes', () => {
  const pc = (id, address, gateway) => ({
    id, interfaces: [{ name: '', addresses: [{ address, mask: '255.255.255.0' }], gateway, enabled: true }], links: [],
  });
  const router = (id, ports, links) => ({
    id,
    interfaces: ports.map(([name, address, mask, enabled = true]) => ({ name, addresses: address ? [{ address, mask }] : [], enabled })),
    links: links.map(([port, peerId, peerPort]) => ({ port, peerId, peerPort })),
  });
  const devices = [
    pc('pc1', '192.168.1.10', '192.168.1.1'),
    pc('pc2', '192.168.1.10', '192.168.1.1'),
    pc('pc3', '192.168.1.30', '192.168.10.1'),
    pc('pc4', '169.254.7.8', '192.168.1.1'),
    router('r1', [['GigabitEthernet0/0', '10.0.0.1', '255.255.255.252'], ['GigabitEthernet0/1', '', '', false]],
      [['GigabitEthernet0/0', 'r2', 'GigabitEthernet0/0'], ['GigabitEthernet0/1', 'r3', 'GigabitEthernet0/0']]),
    router('r2', [['GigabitEthernet0/0', '10.0.1.2', '255.255.255.252']], [['GigabitEthernet0/0', 'r1', 'GigabitEthernet0/0']]),
    router('r3', [['GigabitEthernet0/0', '10.0.2.1', '255.255.255.252']], [['GigabitEthernet0/0', 'r1', 'GigabitEthernet0/1']]),
  ];
  assert.deepEqual(reviewNetwork(devices), [
    { kind: 'duplicate', devices: ['pc1', 'pc2'], address: '192.168.1.10' },
    { kind: 'subnets', devices: ['r1', 'r2'], ports: ['GigabitEthernet0/0', 'GigabitEthernet0/0'], addresses: ['10.0.0.1/30', '10.0.1.2/30'] },
    { kind: 'shutdown', devices: ['r1', 'r3'], port: 'GigabitEthernet0/1' },
    { kind: 'gateway', devices: ['pc3'], gateway: '192.168.10.1', network: '192.168.1.0/24' },
    { kind: 'automatic', devices: ['pc4'], address: '169.254.7.8' },
  ]);

  const fixed = devices.map((device) => (device.id === 'r2'
    ? router('r2', [['GigabitEthernet0/0', '10.0.0.2', '255.255.255.252']], [['GigabitEthernet0/0', 'r1', 'GigabitEthernet0/0']])
    : device));
  assert.ok(!reviewNetwork(fixed).some((finding) => finding.kind === 'subnets'), 'la misma red en las 2 puntas no se marca');
  assert.deepEqual(reviewNetwork([pc('a', '192.168.1.5', ''), pc('b', '192.168.1.6', '0.0.0.0')]), []);
  const tablet = pc('t', '192.168.1.9', '192.168.1.1');
  tablet.interfaces.push({ name: '', addresses: [{ address: '169.254.1.2', mask: '255.255.0.0' }], gateway: '192.168.1.1', enabled: true });
  assert.deepEqual(reviewNetwork([tablet]), [], 'una 169.254 en una interfaz que no se usa no es un error');
});
