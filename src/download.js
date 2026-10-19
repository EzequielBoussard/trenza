export function download(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const BOM = String.fromCharCode(0xfeff);

function csvCell(value) {
  const text = String(value ?? '');
  return `"${text.replace(/"/g, '""')}"`;
}

// Con BOM: sin él, Excel abre el CSV en la codificación del sistema y rompe los acentos.
export function csvBlob(rows) {
  const text = rows.map((row) => row.map(csvCell).join(',')).join('\r\n');
  return new Blob([`${BOM}${text}\r\n`], { type: 'text/csv;charset=utf-8' });
}
