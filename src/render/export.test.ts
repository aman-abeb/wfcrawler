import { describe, expect, it } from 'vitest';
import { exportMapPng, sanitizeSeed } from './export';
import type { ExportableCanvas } from './export';

describe('sanitizeSeed', () => {
  it('parses plain decimal seeds, including surrounding whitespace', () => {
    expect(sanitizeSeed('42')).toBe(42);
    expect(sanitizeSeed('0')).toBe(0);
    expect(sanitizeSeed('  7  ')).toBe(7);
  });

  it('accepts the full unsigned 32-bit range', () => {
    expect(sanitizeSeed('4294967295')).toBe(4294967295);
  });

  it('wraps values above uint32 with >>> 0, matching the solver', () => {
    expect(sanitizeSeed('4294967296')).toBe(0);
    expect(sanitizeSeed('4294967297')).toBe(1);
  });

  it('rejects empty, non-numeric, negative and fractional input', () => {
    expect(sanitizeSeed('')).toBeNull();
    expect(sanitizeSeed('   ')).toBeNull();
    expect(sanitizeSeed('abc')).toBeNull();
    expect(sanitizeSeed('-1')).toBeNull();
    expect(sanitizeSeed('3.5')).toBeNull();
    expect(sanitizeSeed('0x10')).toBeNull();
    expect(sanitizeSeed('1e3')).toBeNull();
    expect(sanitizeSeed('12a')).toBeNull();
    expect(sanitizeSeed('99999999999999999999999999')).toBeNull();
  });
});

describe('exportMapPng', () => {
  const stubCanvas: ExportableCanvas = {
    toDataURL: (type?: string) => `data:${type ?? 'image/png'};base64,QUJD`,
  };

  it('returns a PNG data URL read from the canvas', () => {
    const result = exportMapPng(stubCanvas, 42);
    expect(result.dataUrl.startsWith('data:image/png')).toBe(true);
    expect(result.filename).toBe('wfcrawler-42.png');
  });

  it('requests the image/png mime type explicitly', () => {
    let seen = '';
    const canvas: ExportableCanvas = {
      toDataURL: (type?: string) => {
        seen = type ?? '';
        return 'data:image/png;base64,x';
      },
    };
    exportMapPng(canvas, 7);
    expect(seen).toBe('image/png');
  });

  it('normalizes the seed in the download filename', () => {
    expect(exportMapPng(stubCanvas, 0).filename).toBe('wfcrawler-0.png');
    expect(exportMapPng(stubCanvas, 4294967296).filename).toBe('wfcrawler-0.png');
    expect(exportMapPng(stubCanvas, 1337).filename).toBe('wfcrawler-1337.png');
  });

  it('does not throw outside the DOM (no document in the Node test env)', () => {
    expect(() => exportMapPng(stubCanvas, 1)).not.toThrow();
  });
});
