# pmtiles-protocol

This package makes it easy to work with [Protomaps](https://protomaps.com) [PMTiles](https://docs.protomaps.com/pmtiles/) directly in the browser. It provides `fetch` and `XMLHttpRequest` versions as well as an `Image` or `HTMLImageElement` setter for `src` that support urls starting with `pmtiles://`, returning the respective TileJSON or tiles. It is meant to be used in browser applications.

## Supported URLs

### TileJSON

- `pmtiles://https://example.com/path/to/mytiles.pmtiles` (absolute)
- `pmtiles://path/to/mytiles.pmtiles` (relative to `window.location.href`)

### Tiles

- `pmtiles://https://example.com/path/to/mytiles.pmtiles/{z}/{x}/{y}.mvt` (absolute)
- `pmtiles://path/to/mytiles.pmtiles/{z}/{x}/{y}.png` (relative to `window.location.href`)

## How to use

The global overrides for `fetch()`, `XMLHttpRequest` and `Image` or `HTMLImageElment`'s `src` setter are the easiest way to use `pmtiles-protocol`:

```js
import { register } from 'pmtiles-protocol';

const unregister = register();
```

Now every request url that starts with `pmtiles://` for anything in your web application that uses `fetch()` or `XMLHttpRequest` will go through [pmtiles](https://npmjs.com/package/pmtiles). Also, setting the `src` attribute of an `Image` or `HTMLImageElement` to a `pmtiles://` url will load the image from the PMTiles archive.

To restore the original global `fetch()` and `XMLHttpRequest` versions, and the original `src` setter on `Image` and `HTMLImageElement`, call

```js
unregister();
```

If global overrides are not desired, `pmtiles-protocol` also provides a dedicated `fetch()` function, a dedicated `XMLHttpRequest` replacement, and a dedicated `Image` constructor:

```js
import { fetch, XMLHttpRequest, Image } from 'pmtiles-protocol';
```

## Examples

### fetch

```js
fetch('pmtiles://https://example.com/mytiles.pmtiles/0/0/0.mvt');
```

fetches the 0/0/0 tile from the PMTiles file at `https://example.com/mytiles.pmtiles`.

### XMLHttpRequest

```js
const xhr = new XMLHttpRequest();
xhr.open('GET', 'pmtiles://path/to/mytiles.pmtiles');
xhr.onload = () => {
  console.log('TileJSON', xhr.responseText);
};
```

logs the TileJSON from the PMTiles file at `path/to/mytiles.pmtiles` (relative to `window.location.href`) to the console.

### Image

```js
const img = new Image();
img.src = 'pmtiles://https://example.com/mytiles.pmtiles/0/0/0.png';
document.body.appendChild(img);
```

### In a Mapbox Style document

The `pmtiles` source below will use the TileJSON and tiles from `https://example.com/mytiles.pmtiles`:

```json
{
  "sources": {
    "pmtiles": {
      "type": "vector",
      "url": "pmtiles://https://example.com/mytiles.pmtiles"
    }
  }
}
```

## Limitations

### fetch()

No known limitations.

### XMLHttpRequest

The limitations below only apply when `XMLHttpRequest` is used with a `pmtiles://` url.

- Only the `load` and `error` events are fired.
- The only methods that act on the PMTiles file are `open()` and `send()`.
- Only the `response` and `responseText` properties are supported.
- Only the `200` and `404` status codes are used.

### Image

The limitations below only apply when `Image` or `HTMLImageElement` is used with a `pmtiles://` url.

- **HTML Attributes**: Setting the `src` attribute via HTML markup (e.g., `<img src="pmtiles://...">`) or `setAttribute` (e.g. `img.setAttribute('src', ...)`) is not supported, because the browser's native network loader handles these before the library's JavaScript interception can run. You must assign to the `src` property (e.g. `img.src = ...`) for it to work.
- **CSS**: `pmtiles://` URLs are not supported in CSS `background-image` or other CSS properties.
- **Property Read-back**: When assigning a `pmtiles://` URL to `img.src`, reading `img.src` immediately after will not return the `pmtiles://` URL. Instead, it will return the previous value or the `blob:` URL once the image has loaded. This also applies when inspecting `img.src` inside an `onload` or `onerror` handler.
- **srcset**: The `srcset` attribute is not supported.
- **Error Handling**: If loading fails, an `error` event is dispatched on the image element. Note that the error is also logged to `console.error`.
