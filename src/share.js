import { t } from './i18n.js';

/**
 * Lee de la dirección actual el archivo que hay que abrir, si es que hay alguno.
 * El visor no publica archivos: sólo sabe descargar uno que ya esté en la web.
 */
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

/**
 * El último tramo de la ruta, ya sin codificar. Una dirección puede traer un `%` suelto
 * que no forma ninguna secuencia válida, y ahí `decodeURIComponent` lanza: el archivo se
 * descargó bien y quedarse sin abrirlo por el nombre sería absurdo, así que vale el crudo.
 */
function fileNameFrom(url) {
  const last = url.pathname.split('/').pop();
  try {
    return decodeURIComponent(last) || 'file';
  } catch {
    return last || 'file';
  }
}
