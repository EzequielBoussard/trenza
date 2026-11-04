// En GitHub Actions cada prueba que falla queda como anotación del commit: se lee sin abrir el log.
import { relative } from 'node:path';

const escape = (text) => text.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');

export default async function* github(source) {
  for await (const event of source) {
    if (event.type !== 'test:fail' || event.data.details.type === 'suite') continue;
    const { name, file, line, details } = event.data;
    const error = details.error?.cause ?? details.error;
    const where = file ? `file=${relative(process.cwd(), file).replaceAll('\\', '/')},line=${line}` : '';
    yield `::error ${where}::${escape(`${name}: ${error?.message ?? error}`)}\n`;
  }
}
