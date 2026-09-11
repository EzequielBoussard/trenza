import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  readAccessLists,
  readInterfaces,
  readRoutes,
  readRoutingProtocols,
  readVlans,
} from '../src/pkt/config.js';

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
  // Un switch configurado desde la interfaz de Packet Tracer no escribe bloques `vlan` en
  // la running-config: el número y el nombre sólo están en el XML del dispositivo.
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
  // Es lo que escribe Packet Tracer cuando alguien entra a `router rip` y sale sin más.
  const [rip] = readRoutingProtocols(['!', 'router rip', '!', 'ip classless', '!']);

  assert.equal(rip.protocol, 'RIP');
  assert.deepEqual(rip.networks, []);
});

test('la red de un protocolo no se confunde con la de otro bloque', () => {
  const config = ['!', 'router rip', ' network 10.0.0.0', '!', 'ip dhcp pool LAN', ' network 192.168.1.0 255.255.255.0', '!'];
  const [rip] = readRoutingProtocols(config);

  assert.deepEqual(rip.networks, ['10.0.0.0'], 'se coló la red de la reserva de DHCP');
});
