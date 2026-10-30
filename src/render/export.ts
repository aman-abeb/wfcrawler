/**
 * PNG export helpers for the generated map.
 *
 * The module is deliberately DOM-light: `sanitizeSeed` and the data-URL part of
 * `exportMapPng` are pure, and the actual download is guarded behind a
 * `typeof document` check so everything stays unit-testable in Node.
 */

/**
 * The minimal canvas surface needed for export. Structurally satisfied by
 * `HTMLCanvasElement`, and easy to stub in tests.
 */
export interface ExportableCanvas {
  toDataURL(type?: string): string;
}

/** Result of exporting a map canvas to PNG. */
export interface PngExport {
  /** `data:image/png;base64,...` URL of the canvas contents. */
  readonly dataUrl: string;
  /** Suggested download filename, `wfcrawler-<seed>.png`. */
  readonly filename: string;
}

/**
 * Parse user-supplied seed text into an unsigned 32-bit seed.
 * Returns null for empty, non-numeric, negative or fractional input.
 * Values above 2^32-1 wrap around with `>>> 0`, matching the solver.
 */
export function sanitizeSeed(raw: string): number | null {
  const trimmed = raw.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const value = Number(trimmed);
  if (!Number.isSafeInteger(value)) return null;
  return value >>> 0;
}

/**
 * Export the current canvas contents as a PNG: read `toDataURL('image/png')`
 * and, in a browser, trigger a download named `wfcrawler-<seed>.png`.
 * Returns the data URL and filename so callers (and tests) can inspect them.
 */
export function exportMapPng(canvas: ExportableCanvas, seed: number): PngExport {
  const dataUrl = canvas.toDataURL('image/png');
  const filename = `wfcrawler-${seed >>> 0}.png`;
  triggerDownload(dataUrl, filename);
  return { dataUrl, filename };
}

/** Click a temporary anchor to download `dataUrl` as `filename`. No-op outside the DOM. */
function triggerDownload(dataUrl: string, filename: string): void {
  if (typeof document === 'undefined') return;
  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
}
