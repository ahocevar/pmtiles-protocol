import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.join(__dirname, 'fixtures');

if (!globalThis.URL.createObjectURL) {
  globalThis.URL.createObjectURL = (blob) =>
    `blob:${/** @type {Blob} */ (blob).size}`;
  globalThis.URL.revokeObjectURL = () => {};
}

// Simple fetch mock to serve local fixtures
/**
 * @param {RequestInfo|URL} input
 * @param {RequestInit} [init]
 */
globalThis.fetch = async (input, init) => {
  let url, method, headers;

  // Handle input being Request or string
  if (typeof input === 'object' && input !== null && 'url' in input) {
    // It's likely a Request object (or similar interface)
    url = input.url;
    method = input.method || 'GET';
    headers = input.headers;
  } else {
    url = input.toString();
    method = init?.method || 'GET';
    headers = init?.headers;
  }

  // Unify headers access
  /** @param {string} name */
  const getHeader = (name) => {
    if (headers instanceof Headers) {
      return headers.get(name);
    }
    if (headers && typeof headers === 'object' && !Array.isArray(headers)) {
      // Case insensitive match for plain object
      const key = Object.keys(headers).find(
        (k) => k.toLowerCase() === name.toLowerCase(),
      );
      return key ? /** @type {Record<string, string>} */ (headers)[key] : null;
    }
    return null;
  };

  const name = url.split('/').pop();
  if (name === 'minimal.mvt.pmtiles' || name === 'minimal.png.pmtiles') {
    const filePath = path.join(fixturesDir, name);
    if (fs.existsSync(filePath)) {
      const buffer = fs.readFileSync(filePath);
      const size = buffer.length;

      if (method.toUpperCase() === 'HEAD') {
        return new Response(null, {
          status: 200,
          headers: {
            'Content-Length': size.toString(),
            'Accept-Ranges': 'bytes',
          },
        });
      }

      const range = getHeader('Range');

      if (range) {
        const parts = range.replace(/bytes=/, '').split('-');
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : size - 1;
        const validEnd = Math.min(end, size - 1);

        const chunk = buffer.subarray(start, validEnd + 1);

        return new Response(chunk, {
          status: 206,
          headers: {
            'Content-Range': `bytes ${start}-${validEnd}/${size}`,
            'Content-Length': chunk.length.toString(),
            'Accept-Ranges': 'bytes',
          },
        });
      }

      return new Response(buffer, {
        status: 200,
        headers: {
          'Content-Length': size.toString(),
          'Accept-Ranges': 'bytes',
        },
      });
    }
  }

  // Return 404
  return new Response(null, { status: 404, statusText: 'Not Found: ' + url });
};
