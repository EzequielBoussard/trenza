// Genera showcase/captura-ejemplo.pcap: una notebook entra a la red por DHCP, resuelve
// example.com, baja la página por HTTP, le hace ping al router y pregunta la hora por NTP.
// Todas las direcciones son de documentación (RFC 5737, RFC 3849 y RFC 7042), así que la
// captura no sale de ninguna red real.
//
//   node scripts/captura-ejemplo.mjs
import { writeFileSync } from 'node:fs';

const LAPTOP = { mac: '00:00:5e:00:53:17', ip: '192.0.2.23' };
const ROUTER = { mac: '00:00:5e:00:53:01', ip: '192.0.2.1' };
const BROADCAST = 'ff:ff:ff:ff:ff:ff';
const RESOLVER = '198.51.100.53';
const TIME_SERVER = '198.51.100.123';
const WEB = { ip: '203.0.113.10', ipv6: '2001:db8::10' };

// PRNG con semilla, para que el archivo salga igual cada vez.
let seed = 0x7e22a;
function random() {
  seed = (seed + 0x6d2b79f5) | 0;
  let x = Math.imul(seed ^ (seed >>> 15), seed | 1);
  x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
  return ((x ^ (x >>> 14)) >>> 0) / 2 ** 32;
}
const jitter = (ms, spread) => ms + (random() - 0.5) * spread;

const bytes = (...parts) => Uint8Array.from(parts.flatMap((part) => (typeof part === 'number' ? [part] : [...part])));
const u16 = (n) => [n >>> 8 & 255, n & 255];
const u32 = (n) => [n >>> 24 & 255, n >>> 16 & 255, n >>> 8 & 255, n & 255];
const mac = (text) => text.split(':').map((part) => parseInt(part, 16));
const ipv4Address = (text) => text.split('.').map(Number);
const ascii = (text) => [...Buffer.from(text, 'latin1')];

function ipv6Address(text) {
  const [head, tail = ''] = text.split('::');
  const groups = (part) => (part ? part.split(':').map((group) => parseInt(group, 16)) : []);
  const left = groups(head);
  const right = groups(tail);
  return [...left, ...Array(8 - left.length - right.length).fill(0), ...right].flatMap(u16);
}

function checksum(data) {
  let sum = 0;
  for (let i = 0; i < data.length; i += 2) sum += (data[i] << 8) | (data[i + 1] ?? 0);
  while (sum > 0xffff) sum = (sum & 0xffff) + (sum >>> 16);
  return ~sum & 0xffff;
}

let nextId = 0x3a41;

function ipv4({ source, destination, protocol, payload, ttl = 64, id = nextId++, dontFragment = true }) {
  const header = bytes(
    0x45, 0, u16(20 + payload.length), u16(id), dontFragment ? 0x40 : 0, 0, ttl, protocol, 0, 0,
    ipv4Address(source), ipv4Address(destination),
  );
  header.set(u16(checksum(header)), 10);
  return bytes(header, payload);
}

function transportChecksum(source, destination, protocol, segment) {
  const pseudo = bytes(ipv4Address(source), ipv4Address(destination), 0, protocol, u16(segment.length));
  return checksum(bytes(pseudo, segment));
}

function udp(source, destination, sourcePort, destinationPort, payload, ttl) {
  const segment = bytes(u16(sourcePort), u16(destinationPort), u16(8 + payload.length), 0, 0, payload);
  segment.set(u16(transportChecksum(source, destination, 17, segment) || 0xffff), 6);
  return ipv4({ source, destination, protocol: 17, payload: segment, ttl, dontFragment: source !== '0.0.0.0' });
}

const FLAGS = { FIN: 1, SYN: 2, PSH: 8, ACK: 16 };

function tcp(source, destination, { sourcePort, destinationPort, seq, ack = 0, flags, window, options = [], payload = [] }, ttl) {
  const bits = flags.split(' ').reduce((all, name) => all | FLAGS[name], 0);
  const headerLength = 20 + options.length;
  const segment = bytes(
    u16(sourcePort), u16(destinationPort), u32(seq), u32(ack),
    (headerLength / 4) << 4, bits, u16(window), 0, 0, 0, 0, options, payload,
  );
  segment.set(u16(transportChecksum(source, destination, 6, segment)), 16);
  return ipv4({ source, destination, protocol: 6, payload: segment, ttl });
}

// Lo que recibe la placa llega rellenado a 60 bytes; lo que ella misma manda, no.
function ethernet(destination, source, type, payload) {
  const frame = bytes(mac(destination), mac(source), u16(type), payload);
  if (source === LAPTOP.mac || frame.length >= 60) return frame;
  return bytes(frame, Array(60 - frame.length).fill(0));
}

// DHCP

const DHCP_OPTION = { mask: 1, router: 3, dns: 6, hostname: 12, domain: 15, requested: 50, lease: 51, type: 53, server: 54, parameters: 55, client: 61 };
const xid = 0x5c1e0b93;

function dhcp(op, type, { yiaddr = '0.0.0.0', options = [] } = {}) {
  const body = bytes(
    op, 1, 6, 0, u32(xid), u16(op === 1 ? 3 : 0), 0, 0,
    ipv4Address('0.0.0.0'), ipv4Address(yiaddr), ipv4Address(op === 2 ? ROUTER.ip : '0.0.0.0'), ipv4Address('0.0.0.0'),
    mac(LAPTOP.mac), Array(10 + 64 + 128).fill(0),
    0x63, 0x82, 0x53, 0x63,
    DHCP_OPTION.type, 1, type,
    options.flatMap(([code, value]) => [DHCP_OPTION[code], value.length, ...value]),
    255,
  );
  return body.length >= 300 ? body : bytes(body, Array(300 - body.length).fill(0));
}

const clientOptions = [
  ['client', [1, ...mac(LAPTOP.mac)]],
  ['hostname', ascii('notebook-07')],
  ['parameters', [1, 28, 2, 3, 15, 6, 119, 12, 44, 47, 26, 121, 42]],
];
const serverOptions = [
  ['server', ipv4Address(ROUTER.ip)],
  ['lease', u32(86400)],
  ['mask', [255, 255, 255, 0]],
  ['router', ipv4Address(ROUTER.ip)],
  ['dns', ipv4Address(RESOLVER)],
  ['domain', ascii('example.net')],
];

// DNS

const qname = (name) => [...name.split('.').flatMap((label) => [label.length, ...ascii(label)]), 0];
const RECORD = { A: 1, AAAA: 28 };

const dnsQuery = (id, name, type) => bytes(u16(id), u16(0x0100), u16(1), u16(0), u16(0), u16(0), qname(name), u16(RECORD[type]), u16(1));

function dnsAnswer(id, name, type, address) {
  const data = type === 'A' ? ipv4Address(address) : ipv6Address(address);
  return bytes(
    u16(id), u16(0x8180), u16(1), u16(1), u16(0), u16(0),
    qname(name), u16(RECORD[type]), u16(1),
    0xc0, 0x0c, u16(RECORD[type]), u16(1), u32(3217), u16(data.length), data,
  );
}

// ICMP y NTP

function echo(type, id, sequence, sentAt) {
  const seconds = Math.floor(sentAt / 1e6);
  const timestamp = [...Buffer.from(new BigUint64Array([BigInt(seconds), BigInt(sentAt % 1e6)]).buffer)];
  const message = bytes(type, 0, 0, 0, u16(id), u16(sequence), timestamp, Array.from({ length: 40 }, (_, i) => 0x10 + i));
  message.set(u16(checksum(message)), 2);
  return message;
}

const NTP_EPOCH = 2208988800;
function ntpTime(microseconds) {
  const seconds = Math.floor(microseconds / 1e6) + NTP_EPOCH;
  const fraction = Math.floor(((microseconds % 1e6) / 1e6) * 2 ** 32);
  return [...u32(seconds), ...u32(fraction)];
}

// Línea de tiempo

const packets = [];
let clock = Date.UTC(2024, 3, 16, 13, 5, 42) * 1000 + 318214;
const after = (ms, frame) => {
  clock += Math.round(ms * 1000);
  packets.push({ time: clock, frame });
};

const fromLaptop = (payload) => ethernet(ROUTER.mac, LAPTOP.mac, 0x0800, payload);
const toLaptop = (payload) => ethernet(LAPTOP.mac, ROUTER.mac, 0x0800, payload);

after(0, ethernet(BROADCAST, LAPTOP.mac, 0x0800,
  udp('0.0.0.0', '255.255.255.255', 68, 67, dhcp(1, 1, { options: clientOptions }))));
after(jitter(2.1, 0.6), toLaptop(
  udp(ROUTER.ip, LAPTOP.ip, 67, 68, dhcp(2, 2, { yiaddr: LAPTOP.ip, options: serverOptions }))));
after(jitter(1.4, 0.4), ethernet(BROADCAST, LAPTOP.mac, 0x0800,
  udp('0.0.0.0', '255.255.255.255', 68, 67, dhcp(1, 3, {
    options: [['requested', ipv4Address(LAPTOP.ip)], ['server', ipv4Address(ROUTER.ip)], ...clientOptions],
  }))));
after(jitter(2.3, 0.6), toLaptop(
  udp(ROUTER.ip, LAPTOP.ip, 67, 68, dhcp(2, 5, { yiaddr: LAPTOP.ip, options: serverOptions }))));

const arp = (operation, senderMac, senderIp, targetMac, targetIp) =>
  bytes(u16(1), u16(0x0800), 6, 4, u16(operation), mac(senderMac), ipv4Address(senderIp), mac(targetMac), ipv4Address(targetIp));

after(jitter(48, 12), ethernet(BROADCAST, LAPTOP.mac, 0x0806, arp(1, LAPTOP.mac, LAPTOP.ip, '00:00:00:00:00:00', ROUTER.ip)));
after(jitter(0.9, 0.3), ethernet(LAPTOP.mac, ROUTER.mac, 0x0806, arp(2, ROUTER.mac, ROUTER.ip, LAPTOP.mac, LAPTOP.ip)));

// El resolver del sistema pide A y AAAA a la vez, desde puertos distintos.
after(jitter(1830, 300), fromLaptop(udp(LAPTOP.ip, RESOLVER, 41852, 53, dnsQuery(0x8f1d, 'example.com', 'A'))));
after(jitter(0.12, 0.05), fromLaptop(udp(LAPTOP.ip, RESOLVER, 57219, 53, dnsQuery(0x2b77, 'example.com', 'AAAA'))));
after(jitter(17.8, 4), toLaptop(udp(RESOLVER, LAPTOP.ip, 53, 41852, dnsAnswer(0x8f1d, 'example.com', 'A', WEB.ip), 57)));
after(jitter(0.6, 0.3), toLaptop(udp(RESOLVER, LAPTOP.ip, 53, 57219, dnsAnswer(0x2b77, 'example.com', 'AAAA', WEB.ipv6), 57)));

const client = { sourcePort: 51544, destinationPort: 80 };
const server = { sourcePort: 80, destinationPort: 51544 };
let clientSeq = 0x9f3c21a4;
let serverSeq = 0x1d6e08c3;
let clientClock = 2974310551;
let serverClock = 381205117;
const timestamps = (own, echoed) => [1, 1, 8, 10, ...u32(own), ...u32(echoed)];
const synOptions = (own, echoed) => [2, 4, ...u16(1460), 4, 2, 8, 10, ...u32(own), ...u32(echoed), 1, 3, 3, 7];

const request = ascii('GET / HTTP/1.1\r\nHost: example.com\r\nUser-Agent: curl/8.5.0\r\nAccept: */*\r\n\r\n');
const page = '<!doctype html>\n<html>\n<head><title>example.com</title></head>\n<body>\n<p>Placeholder page for documentation.</p>\n</body>\n</html>\n';
const response = ascii(
  'HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=UTF-8\r\n'
  + `Content-Length: ${page.length}\r\nDate: Tue, 16 Apr 2024 13:05:44 GMT\r\nServer: nginx\r\n\r\n${page}`,
);

after(jitter(0.4, 0.1), fromLaptop(tcp(LAPTOP.ip, WEB.ip, {
  ...client, seq: clientSeq, flags: 'SYN', window: 64240, options: synOptions(clientClock, 0),
})));
after(jitter(24.6, 3), toLaptop(tcp(WEB.ip, LAPTOP.ip, {
  ...server, seq: serverSeq, ack: clientSeq + 1, flags: 'SYN ACK', window: 65160, options: synOptions(serverClock, clientClock),
}, 56)));
clientSeq += 1;
serverSeq += 1;
clientClock += 25;
after(jitter(0.08, 0.03), fromLaptop(tcp(LAPTOP.ip, WEB.ip, {
  ...client, seq: clientSeq, ack: serverSeq, flags: 'ACK', window: 502, options: timestamps(clientClock, serverClock),
})));
after(jitter(0.1, 0.03), fromLaptop(tcp(LAPTOP.ip, WEB.ip, {
  ...client, seq: clientSeq, ack: serverSeq, flags: 'PSH ACK', window: 502, options: timestamps(clientClock, serverClock), payload: request,
})));
clientSeq += request.length;
serverClock += 24;
after(jitter(24.9, 3), toLaptop(tcp(WEB.ip, LAPTOP.ip, {
  ...server, seq: serverSeq, ack: clientSeq, flags: 'ACK', window: 509, options: timestamps(serverClock, clientClock),
}, 56)));
after(jitter(1.3, 0.4), toLaptop(tcp(WEB.ip, LAPTOP.ip, {
  ...server, seq: serverSeq, ack: clientSeq, flags: 'PSH ACK', window: 509, options: timestamps(serverClock + 1, clientClock), payload: response,
}, 56)));
serverSeq += response.length;
clientClock += 27;
after(jitter(0.05, 0.02), fromLaptop(tcp(LAPTOP.ip, WEB.ip, {
  ...client, seq: clientSeq, ack: serverSeq, flags: 'ACK', window: 501, options: timestamps(clientClock, serverClock + 1),
})));
after(jitter(0.3, 0.1), fromLaptop(tcp(LAPTOP.ip, WEB.ip, {
  ...client, seq: clientSeq, ack: serverSeq, flags: 'FIN ACK', window: 501, options: timestamps(clientClock, serverClock + 1),
})));
clientSeq += 1;
serverClock += 26;
after(jitter(25.2, 3), toLaptop(tcp(WEB.ip, LAPTOP.ip, {
  ...server, seq: serverSeq, ack: clientSeq, flags: 'FIN ACK', window: 509, options: timestamps(serverClock, clientClock),
}, 56)));
serverSeq += 1;
after(jitter(0.07, 0.02), fromLaptop(tcp(LAPTOP.ip, WEB.ip, {
  ...client, seq: clientSeq, ack: serverSeq, flags: 'ACK', window: 501, options: timestamps(clientClock + 25, serverClock),
})));

// La respuesta devuelve el mismo contenido, con la hora de envío que puso ping.
const pingId = 0x1c2e;
for (let sequence = 1; sequence <= 4; sequence++) {
  const wait = sequence === 1 ? jitter(4210, 600) : jitter(1000.3, 0.4);
  const sent = clock + Math.round(wait * 1000);
  after(wait, fromLaptop(ipv4({
    source: LAPTOP.ip, destination: ROUTER.ip, protocol: 1, payload: echo(8, pingId, sequence, sent),
  })));
  after(jitter(0.45, 0.15), toLaptop(ipv4({
    source: ROUTER.ip, destination: LAPTOP.ip, protocol: 1, payload: echo(0, pingId, sequence, sent), dontFragment: false,
  })));
}

const transmit = clock + 2_600_000;
after(2600, fromLaptop(udp(LAPTOP.ip, TIME_SERVER, 123, 123,
  bytes(0x23, 0, 6, 0x20, Array(12).fill(0), Array(24).fill(0), ntpTime(transmit)))));
after(jitter(21.6, 4), toLaptop(udp(TIME_SERVER, LAPTOP.ip, 123, 123, bytes(
  0x24, 2, 6, 0xe9, u32(0x0a1f), u32(0x1c4b), ipv4Address('192.0.2.200'),
  ntpTime(transmit - 3_581_000), ntpTime(transmit), ntpTime(transmit + 10_730), ntpTime(transmit + 10_760),
), 57)));

// pcap clásico, little-endian, microsegundos, Ethernet.
const header = Buffer.alloc(24);
header.writeUInt32LE(0xa1b2c3d4, 0);
header.writeUInt16LE(2, 4);
header.writeUInt16LE(4, 6);
header.writeUInt32LE(262144, 16);
header.writeUInt32LE(1, 20);

const records = packets.map(({ time, frame }) => {
  const record = Buffer.alloc(16);
  record.writeUInt32LE(Math.floor(time / 1e6), 0);
  record.writeUInt32LE(time % 1e6, 4);
  record.writeUInt32LE(frame.length, 8);
  record.writeUInt32LE(frame.length, 12);
  return Buffer.concat([record, frame]);
});

const target = new URL('../showcase/captura-ejemplo.pcap', import.meta.url);
writeFileSync(target, Buffer.concat([header, ...records]));
console.log(`${packets.length} paquetes, ${Buffer.concat([header, ...records]).length} bytes`);
