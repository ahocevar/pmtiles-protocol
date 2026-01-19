import { describe, it, expect } from 'vitest';

describe('mock fetch', () => {
  const vectorUrl = 'http://localhost/minimal.mvt.pmtiles';

  it('serves the full file with correct headers', async () => {
    const response = await fetch(vectorUrl);
    expect(response.ok).toBe(true);
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Length')).toBeTruthy();
    expect(response.headers.get('Accept-Ranges')).toBe('bytes');

    const buffer = await response.arrayBuffer();
    expect(buffer.byteLength).toBeGreaterThan(0);
    expect(response.headers.get('Content-Length')).toBe(
      buffer.byteLength.toString(),
    );
  });

  it('serves a byte range (206)', async () => {
    // Request first 10 bytes (0-9)
    const response = await fetch(vectorUrl, {
      headers: { Range: 'bytes=0-9' },
    });

    expect(response.ok).toBe(true);
    expect(response.status).toBe(206);
    expect(response.headers.get('Content-Range')).toContain('bytes 0-9/');
    expect(response.headers.get('Content-Length')).toBe('10');

    const buffer = await response.arrayBuffer();
    expect(buffer.byteLength).toBe(10);
  });

  it('serves HEAD requests', async () => {
    const response = await fetch(vectorUrl, { method: 'HEAD' });
    expect(response.ok).toBe(true);
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Length')).toBeTruthy();
    expect(response.headers.get('Accept-Ranges')).toBe('bytes');

    // HEAD response body should be empty/null, but Headers should match the full file
    const text = await response.text();
    expect(text).toBe('');
  });

  it('returns 404 for unknown files', async () => {
    const response = await fetch('http://localhost/unknown.pmtiles');
    expect(response.ok).toBe(false);
    expect(response.status).toBe(404);
  });
});
