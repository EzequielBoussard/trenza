import { t } from './i18n.js';

// Baja el archivo de ?src=, si lo hay. El visor no sube nada: sólo abre lo que ya está publicado.
export async function readSourceFromLocation() {
  const remote = new URLSearchParams(location.search).get('src');
  if (!remote) return null;

  let url;
  try {
    url = new URL(remote, location.href);
  } catch {
    throw new Error(t('error.badUrl'));
  }
  if (url.protocol !== 'https:' && url.origin !== location.origin) {
    throw new Error(t('error.insecureUrl'));
  }

  const response = await fetch(url, { redirect: 'follow' });
  if (!response.ok) throw new Error(t('error.httpStatus', { status: response.status }));

  return {
    name: fileNameFrom(url),
    bytes: new Uint8Array(await response.arrayBuffer()),
  };
}

// Con un `%` suelto decodeURIComponent lanza; en ese caso queda el nombre sin decodificar.
function fileNameFrom(url) {
  const last = url.pathname.split('/').pop();
  try {
    return decodeURIComponent(last) || 'file';
  } catch {
    return last || 'file';
  }
}
