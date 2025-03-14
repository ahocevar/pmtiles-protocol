# pmtiles-protocol

This package makes it easy to work with [Protomaps](https://protomaps.com) [PMTiles](https://docs.protomaps.com/pmtiles/) directly in the browser. It provides `fetch` and `XMLHttpRequest` versions that support urls starting with `pmtiles://`, returning the respective TileJSON or tiles. It is meant to be used in browser applications.

## Supported URLs

### TileJSON

- `pmtiles://https://example.com/path/to/mytiles.pmtiles` (absolute)
- `pmtiles://path/to/mytiles.pmtiles` (relative to `window.location.href`)

### Tiles

- `pmtiles://https://example.com/path/to/mytiles.pmtiles/{z}/{x}/{y}.mvt` (absolute)
- `pmtiles://path/to/mytiles.pmtiles/{z}/{x}/{y}.mvt` (relative to `window.location.href`)

## How to use

The global overrides for `fetch()` and `XMLHttpRequest` are the easiest way to use `pmtiles-protocol`:

```js
import { register } from 'pmtiles-protocol';

const unregister = register();
```

Now every request url that starts with `pmtiles://` for anything in your web application that uses `fetch()` or `XMLHttpRequest` will go through [pmtiles](https://npmjs.com/package/pmtiles).

To restore the original global `fetch()` and `XMLHttpRequest` versions, call

```js
unregister();
```

If global overrides are not desired, `pmtiles-protocol` also provides a dedicated `fetch()` function and a dedicated `XMLHttpRequest` replacement:

```js
import { fetch, XMLHttpRequest } from 'pmtiles-protocol';
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

This package won't add support for PMTiles when loading images by simply setting the `src` of an `Image` or `HTTPImageElement`. However, using an object url, the following would work:

```js
const img = new Image();
fetch('pmtiles://path/to/mytiles.pmtiles/0/0/0.png')
  .then((response) => response.blob())
  .then((blob) => {
    const objectUrl = URL.createObjectURL(blob);
    img.onload = () => {
      console.log('Image loaded');
      URL.revokeObjectURL(objectUrl);
    };
    img.onerror = () => {
      console.error('Image load error');
      URL.revokeObjectURL(objectUrl);
    };
    img.src = objectUrl;
  })
  .catch((error) => {
    console.error('Fetch error:', error);
  });
```

### fetch()

No known limitations.

### XMLHttpRequest

The limitations below only apply when `XMLHttpRequest` is used with a `pmtiles://` url.

- Only the `load` and `error` events are fired.
- The only methods that act on the PMTiles file are `open()` and `send()`.
- Only the `response` and `responseText` properties are supported.
- Only the `200` and `404` status codes are used.
