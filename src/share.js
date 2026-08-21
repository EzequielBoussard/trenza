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
    name: decodeURIComponent(url.pathname.split('/').pop()) || 'file',
    bytes: new Uint8Array(await response.arrayBuffer()),
  };
}
