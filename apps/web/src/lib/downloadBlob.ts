import type { ExportResult } from '@glyphrame/schemas';

export function downloadBlob(result: ExportResult) {
  const url = URL.createObjectURL(result.blob);
  const anchor = document.createElement('a');

  anchor.href = url;
  anchor.download = result.filename;
  anchor.click();

  window.setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 0);
}
