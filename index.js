import { PMTiles } from 'pmtiles';

const contentType = [
  'application/octet-stream',
  'application/x-protobuf',
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/avif',
];

const tileUrlRegex = /\/([0-9]+)\/([0-9]+)\/([0-9]+).(mvt|png|jpg|webp|avif)$/;
const protocolRegex = /^pmtiles:\/\//;
const fixUrlRegex = /^http(s?)\/\//; // workaround for broken URLs in Safari
/** @type {Object<string, PMTiles>} */
const pmtilesByUrl = {};

const { fetch: originalFetch, XMLHttpRequest: OriginalXHR } = globalThis;

export const fetch = originalFetch
  ? new Proxy(originalFetch, {
      apply: async (target, that, [input, init]) => {
        /** @type {string} */
        let url;
        if (input instanceof Request) {
          if (input.method !== 'GET') {
            return target.call(that, input, init);
          }
          url = input.url;
        } else {
          url = input.toString();
        }
        if (!protocolRegex.test(url)) {
          return target.call(that, input, init);
        }
        url = url.replace(protocolRegex, '').replace(fixUrlRegex, 'http$1://');
        let baseUrl = url;
        /** @type {[number, number, number]|null} */
        let zxy = null;
        if (tileUrlRegex.test(url)) {
          baseUrl = url.replace(tileUrlRegex, '');
          zxy = /** @type {[number, number, number]} */ (
            url.match(tileUrlRegex)?.slice(1).map(Number)
          );
        }
        if (!(baseUrl in pmtilesByUrl)) {
          pmtilesByUrl[baseUrl] = new PMTiles(baseUrl);
        }
        if (zxy) {
          const tileResult = await pmtilesByUrl[baseUrl].getZxy(...zxy);
          if (!tileResult) {
            return new Response(null, { status: 404 });
          }
          const header = await pmtilesByUrl[baseUrl].getHeader();
          return new Response(tileResult.data, {
            headers: { 'Content-Type': contentType[header.tileType] },
          });
        } else {
          const data = await pmtilesByUrl[baseUrl].getTileJson(
            'pmtiles://' + baseUrl,
          );
          return new Response(JSON.stringify(data), {
            headers: { 'Content-Type': 'application/json' },
          });
        }
      },
    })
  : undefined;

export const XMLHttpRequest = OriginalXHR
  ? class extends OriginalXHR {
      constructor() {
        super();
        /** @type {string} */
        let baseUrl;
        /** @type {undefined|((event: ProgressEvent) => void)} */
        let onload;
        /** @type {undefined|((event: ProgressEvent) => void)} */
        let onerror;
        /** @type {ArrayBuffer|null} */
        let response;
        /** @type {string|null} */
        let responseText,
          /** @type {200 | 404} */
          status;
        /** @type {Array<number>|null} */
        let zxy = null;
        return new Proxy(this, {
          get: (target, prop) => {
            if (prop === 'open') {
              /**
               * @param {string} method
               * @param {string} url
               * @param {boolean} async
               * @param {string} user
               * @param {string} password
               */
              return (method, url, async = true, user, password) => {
                if (method !== 'GET' || !protocolRegex.test(url)) {
                  return this.open(method, url, async, user, password);
                }
                url = url
                  .replace(protocolRegex, '')
                  .replace(fixUrlRegex, 'http$1://');
                baseUrl = url;
                /** @type {[number, number, number]} */
                if (tileUrlRegex.test(url)) {
                  baseUrl = url.replace(tileUrlRegex, '');
                  zxy = url.match(tileUrlRegex)?.slice(1).map(Number) || null;
                }
                if (!(baseUrl in pmtilesByUrl)) {
                  pmtilesByUrl[baseUrl] = new PMTiles(baseUrl);
                }
              };
            } else if (prop === 'send') {
              /**
               * @param {XMLHttpRequestBodyInit|Document|null} [body]
               */
              return async (body) => {
                if (!baseUrl) {
                  return this.send(body);
                }
                try {
                  const loadEvent = new ProgressEvent('load');
                  if (zxy) {
                    const tileResult = await pmtilesByUrl[baseUrl].getZxy(
                      zxy[0],
                      zxy[1],
                      zxy[2],
                    );
                    if (tileResult) {
                      status = 200;
                      response = tileResult.data;
                    } else {
                      status = 404;
                      response = null;
                    }
                    this.dispatchEvent(loadEvent);
                    if (onload) {
                      onload(loadEvent);
                    }
                  } else {
                    const tileResult = await pmtilesByUrl[baseUrl].getTileJson(
                      'pmtiles://' + baseUrl,
                    );
                    status = 200;
                    responseText = JSON.stringify(tileResult);
                    this.dispatchEvent(loadEvent);
                    if (onload) {
                      onload(loadEvent);
                    }
                  }
                } catch (e) {
                  console.error(e);
                  const errorEvent = new ProgressEvent('error');
                  this.dispatchEvent(errorEvent);
                  if (onerror) {
                    onerror(errorEvent);
                  }
                }
              };
            } else if (prop === 'response' && response) {
              return response;
            } else if (prop === 'responseText' && responseText) {
              return responseText;
            } else if (prop === 'status' && status) {
              return status;
            }
            // @ts-expect-error
            return target[prop];
          },
          set: (target, prop, value) => {
            if (prop === 'onload') {
              onload = value;
            } else if (prop === 'onerror') {
              onerror = value;
            }
            // @ts-expect-error
            target[prop] = value;
            return true;
          },
        });
      }
    }
  : undefined;

/**
 * Registers fetch and XMLHttpRequest global overrides.
 * @returns {() => void} Unregister function
 */
export const register = () => {
  if (fetch) {
    globalThis.fetch = fetch;
  }
  if (XMLHttpRequest) {
    globalThis.XMLHttpRequest = XMLHttpRequest;
  }
  return () => {
    globalThis.fetch = originalFetch;
    globalThis.XMLHttpRequest = OriginalXHR;
  };
};
