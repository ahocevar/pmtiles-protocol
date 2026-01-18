import { PMTiles } from 'pmtiles';

const contentType = [
  'application/octet-stream',
  'application/x-protobuf',
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/avif',
];

const tileUrlRegex =
  /\/([0-9]+)\/([0-9]+)\/([0-9]+)\.(mvt|png|jpg|jpeg|webp|avif)$/;
const protocolRegex = /^\s*pmtiles:\/\//i;
const fixUrlRegex = /^http(s?)\/\//; // workaround for broken URLs in Safari
/** @type {Object<string, PMTiles>} */
const pmtilesByUrl = {};

const {
  fetch: originalFetch,
  XMLHttpRequest: OriginalXHR,
  Image: OriginalImage,
} = globalThis;

/**
 * @param {HTMLImageElement} image
 * @param {string} url
 * @param {(src: string) => void} setSrc
 */
const loadPmtilesImage = async (image, url, setSrc) => {
  try {
    /** @type {RequestInit} */
    const options = {};
    if (image.referrerPolicy) {
      options.referrerPolicy = /** @type {ReferrerPolicy} */ (
        image.referrerPolicy
      );
    }
    if (image.crossOrigin === 'use-credentials') {
      options.credentials = 'include';
    } else if (image.crossOrigin === 'anonymous') {
      options.credentials = 'same-origin';
    }
    // @ts-ignore
    const response = await fetch(url, options);
    if (!response.ok) {
      throw new Error(response.statusText);
    }
    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    setSrc(objectUrl);

    // Cleanup potentially? We don't know when the image is done.
    // A robust implementation might hook into onload to revoke the URL.
    const cleanup = () => {
      URL.revokeObjectURL(objectUrl);
      // Restore user's onload if it existed... complex to handle nicely without full descriptor interception.
      if (image.onload === cleanup) {
        // This assumes we assigned it to onload, but in addEventListener case it is fine.
      }
      image.removeEventListener('load', cleanup);
      image.removeEventListener('error', cleanup);
    };
    // For Image proxy we assigned to onload, for HTMLImageElement we used addEventListener
    // But since we can use addEventListener on both (Image proxy supports it via bind now),
    // let's stick to addEventListener.
    // However, for Image proxy, the `target` is NOT an EventTarget in the sense that it might not have the listeners attached yet?
    // Wait, `OriginalImage` DOES have addEventListener.
    image.addEventListener('load', cleanup);
    image.addEventListener('error', cleanup);

    // For the Image proxy specific case where we wanted to assign onload?
    // The previous code did `target.onload = ...`.
    // The previous code in HTMLImageElement used `this.addEventListener`.
    // Let's standardise on addEventListener?
    // But wait, if the user Sets `onload`, they might overwrite ours if we set it.
    // So `addEventListener` is safer.
  } catch (e) {
    console.error(e);
    // Trigger error event
    image.dispatchEvent(new Event('error'));
  }
};

export const fetch = originalFetch
  ? new Proxy(originalFetch, {
      apply: async (target, that, [input, init]) => {
        /** @type {string} */
        let url;
        if (input instanceof Request) {
          if (input.method !== 'GET') {
            return originalFetch(input, init);
          }
          url = input.url;
        } else {
          url = input.toString();
        }
        if (!protocolRegex.test(url)) {
          return originalFetch(input, init);
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

export const Image = OriginalImage
  ? class extends OriginalImage {
      get src() {
        return super.src;
      }

      set src(value) {
        const url = value.toString();
        if (protocolRegex.test(url)) {
          void loadPmtilesImage(this, url, (src) => {
            super.src = src;
          });
        } else {
          super.src = value;
        }
      }
    }
  : undefined;

const createHtmlImageElementOverride = () => {
  /** @type {PropertyDescriptor|undefined} */
  const originalImageSrcDescriptor = globalThis.HTMLImageElement
    ? Object.getOwnPropertyDescriptor(
        globalThis.HTMLImageElement.prototype,
        'src',
      )
    : undefined;

  if (globalThis.HTMLImageElement && originalImageSrcDescriptor) {
    Object.defineProperty(globalThis.HTMLImageElement.prototype, 'src', {
      /**
       * @this {HTMLImageElement}
       */
      set(value) {
        const url = value.toString();
        if (protocolRegex.test(url)) {
          void loadPmtilesImage(this, url, (src) => {
            if (originalImageSrcDescriptor && originalImageSrcDescriptor.set) {
              originalImageSrcDescriptor.set.call(this, src);
            }
          });
        } else {
          if (originalImageSrcDescriptor && originalImageSrcDescriptor.set) {
            originalImageSrcDescriptor.set.call(this, value);
          }
        }
      },
      get() {
        if (originalImageSrcDescriptor && originalImageSrcDescriptor.get) {
          return originalImageSrcDescriptor.get.call(this);
        }
        return '';
      },
      configurable: true,
      enumerable: true,
    });
  }

  return originalImageSrcDescriptor;
};

/**
 * Registers fetch, XMLHttpRequest and Image global overrides.
 * @returns {() => void} Unregister function
 */
export const register = () => {
  if (fetch) {
    globalThis.fetch = fetch;
  }
  if (XMLHttpRequest) {
    globalThis.XMLHttpRequest = XMLHttpRequest;
  }
  if (Image) {
    globalThis.Image = Image;
  }

  const originalImageSrcDescriptor = createHtmlImageElementOverride();

  return () => {
    globalThis.fetch = originalFetch;
    globalThis.XMLHttpRequest = OriginalXHR;
    if (Image) {
      globalThis.Image = OriginalImage;
    }
    if (originalImageSrcDescriptor && globalThis.HTMLImageElement) {
      Object.defineProperty(
        globalThis.HTMLImageElement.prototype,
        'src',
        originalImageSrcDescriptor,
      );
    }
  };
};
