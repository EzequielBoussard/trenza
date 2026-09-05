import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readInterfaces, readRoutes, readVlans } from '../src/pkt/config.js';

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
});
