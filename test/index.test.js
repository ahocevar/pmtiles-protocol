import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { register } from '../index.js';

describe('pmtiles-protocol', () => {
  /** @type {(() => void)|undefined} */
  let unregister;

  beforeEach(() => {
    unregister = register();
  });

  afterEach(() => {
    if (unregister) unregister();
  });

  it('intercepts fetch for pmtiles:// protocol (MVT)', async () => {
    const url = 'pmtiles://https://example.com/minimal.mvt.pmtiles/0/0/0.mvt';
    const response = await fetch(url);
    expect(response.ok).toBe(true);
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('application/x-protobuf');

    const buffer = await response.arrayBuffer();
    expect(buffer.byteLength).toBeGreaterThan(0);
  });

  it('intercepts fetch for pmtiles:// protocol (PNG)', async () => {
    const url = 'pmtiles://https://example.com/minimal.png.pmtiles/0/0/0.png';
    const response = await fetch(url);
    expect(response.ok).toBe(true);
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('image/png');
    const blob = await response.blob();
    expect(blob.size).toBeGreaterThan(0);
  });

  it('intercepts JSON metadata request', async () => {
    const url = 'pmtiles://https://example.com/minimal.mvt.pmtiles';
    const response = await fetch(url);
    expect(response.ok).toBe(true);
    expect(response.headers.get('Content-Type')).toBe('application/json');
    const json = await response.json();
    // The fixture generator sets name: "test"
    expect(json.name).toBe('test');
  });

  it('handles 404 for missing tile', async () => {
    const url = 'pmtiles://https://example.com/minimal.mvt.pmtiles/10/0/0.mvt';
    const response = await fetch(url);
    expect(response.status).toBe(404);
  });

  describe('Image', () => {
    it('intercepts Image src set', async () => {
      return new Promise(
        (/** @type {(value?: any) => void} */ resolve, reject) => {
          const img = new Image();

          const observer = new MutationObserver(() => {
            if (img.src.startsWith('blob:')) {
              observer.disconnect();
              resolve();
            }
          });

          observer.observe(img, { attributes: true });

          img.onerror = () => {
            reject(new Error('Image failed to load'));
          };
          img.src =
            'pmtiles://https://example.com/minimal.png.pmtiles/0/0/0.png';
        },
      );
    });
  });

  describe('XMLHttpRequest', () => {
    it('intercepts XHR', () =>
      new Promise((/** @type {(value?: any) => void} */ resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open(
          'GET',
          'pmtiles://https://example.com/minimal.mvt.pmtiles/0/0/0.mvt',
        );
        xhr.responseType = 'arraybuffer';
        xhr.onload = () => {
          try {
            expect(xhr.status).toBe(200);
            expect(xhr.response.byteLength).toBeGreaterThan(0);
            resolve();
          } catch (e) {
            reject(e);
          }
        };
        xhr.onerror = () => reject(new Error('XHR error'));
        xhr.send();
      }));
  });
});
