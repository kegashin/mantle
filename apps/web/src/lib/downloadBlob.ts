import type { ExportResult } from '@mantle/schemas/model';

export function downloadBlob(result: ExportResult) {
  const url = URL.createObjectURL(result.blob);
  const anchor = document.createElement('a');

  anchor.href = url;
  anchor.download = result.filename;
  anchor.rel = 'noopener';
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();

  window.setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 30_000);
}
