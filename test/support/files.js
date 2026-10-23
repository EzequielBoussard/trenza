import { deflateSync } from 'node:zlib';

// El formato heredado no lleva Twofish: se puede generar acá, y el visor lo abre igual.
export function buildLegacyFile(xml) {
  const payload = deflateSync(Buffer.from(xml, 'utf8'));
  const withHeader = Buffer.alloc(4 + payload.length);
  withHeader.writeUInt32BE(Buffer.byteLength(xml, 'utf8'), 0);
  payload.copy(withHeader, 4);

  const output = new Uint8Array(withHeader.length);
  for (let i = 0; i < withHeader.length; i++) {
    output[i] = withHeader[i] ^ ((withHeader.length - i) & 0xff);
  }
  return output;
}

const escape = (text) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function deviceXml({ id, name, type, model, x, y, config = [], ports = [] }) {
  const lines = config.map((line) => `<LINE>${escape(line)}</LINE>`).join('');
  const portXml = ports.map((port) => `<PORT><IP>${port.ip}</IP><SUBNET>${port.mask}</SUBNET>${port.mac ? `<MACADDRESS>${port.mac}</MACADDRESS>` : ''}</PORT>`).join('');
  return `<DEVICE><ENGINE><TYPE model="${model}">${type}</TYPE><NAME>${escape(name)}</NAME>`
    + `<SAVE_REF_ID>${id}</SAVE_REF_ID><MODULE>${portXml}</MODULE>`
    + `<RUNNINGCONFIG>${lines}</RUNNINGCONFIG></ENGINE>`
    + `<WORKSPACE><LOGICAL><X>${x}</X><Y>${y}</Y></LOGICAL></WORKSPACE></DEVICE>`;
}

export function linkXml(from, fromPort, to, toPort) {
  return `<LINK><TYPE>eCopper</TYPE><CABLE><FUNCTIONAL>true</FUNCTIONAL><FROM>${from}</FROM><PORT>${fromPort}</PORT>`
    + `<TO>${to}</TO><PORT>${toPort}</PORT><TYPE>eStraightThrough</TYPE></CABLE></LINK>`;
}

export function networkXml(devices, links = []) {
  return `<PACKETTRACER5><VERSION>8.2.1</VERSION><NETWORK><DEVICES>${devices.join('')}</DEVICES>`
    + `<LINKS>${links.join('')}</LINKS></NETWORK></PACKETTRACER5>`;
}

// Una actividad como las que arma Packet Tracer: la red guardada, la inicial y la de respuesta,
// y las instrucciones en HTML dentro de un CDATA.
export function activityXml(network, instructions, start = network) {
  const control = String.fromCharCode(1, 17, 2);
  return `<PACKETTRACER5_ACTIVITY><VERSION>8.2.1</VERSION>${network}${start}${network}`
    + `<ACTIVITY ENABLED="no" VALUE="${control}"><INSTRUCTIONS><PAGE translate="true"><![CDATA[${instructions}]]></PAGE>`
    + '</INSTRUCTIONS></ACTIVITY></PACKETTRACER5_ACTIVITY>';
}
