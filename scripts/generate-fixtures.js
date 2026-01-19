import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { zxyToTileId } from 'pmtiles';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, '../test/fixtures');

if (!fs.existsSync(OUT_DIR)) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
}

// 1x1 Transparent PNG
const PNG_BUFFER = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64',
);

// Minimal MVT (gzipped) - Arbitrary valid-looking bytes or just text for testing
// MapLibre might complain if not valid PBF, but for protocol testing it should be fine.
// We'll trust the protocol just passes bytes through.
const MVT_BUFFER = zlib.gzipSync(Buffer.from('DUMMY_MVT_DATA'));

/**
 * @param {number} num
 */
function writeVarint(num) {
  /** @type {number[]} */
  const arr = [];
  while (num > 127) {
    arr.push((num & 127) | 128);
    num = Math.floor(num / 128);
  }
  arr.push(num);
  return Buffer.from(arr);
}

/**
 * @param {{tileId: number, offset: number, length: number, runLength: number}[]} entries
 */
function buildDirectory(entries) {
  const numEntries = entries.length;
  /** @type {Buffer[]} */
  const bufParts = [];

  // 1. numEntries
  bufParts.push(writeVarint(numEntries));

  // 2. tileIds (delta encoded)
  let lastId = 0;
  for (const entry of entries) {
    bufParts.push(writeVarint(entry.tileId - lastId));
    lastId = entry.tileId;
  }

  // 3. runLengths
  for (const entry of entries) {
    bufParts.push(writeVarint(entry.runLength));
  }

  // 4. lengths
  for (const entry of entries) {
    bufParts.push(writeVarint(entry.length));
  }

  // 5. offsets
  for (let i = 0; i < numEntries; i++) {
    const entry = entries[i];
    if (
      i > 0 &&
      entry.offset === entries[i - 1].offset + entries[i - 1].length
    ) {
      bufParts.push(writeVarint(0));
    } else {
      bufParts.push(writeVarint(entry.offset + 1));
    }
  }

  return Buffer.concat(bufParts);
}

/**
 * @param {number} rootDirOffset
 * @param {number} rootDirLength
 * @param {number} metadataOffset
 * @param {number} metadataLength
 * @param {number} tileDataOffset
 * @param {number} tileDataLength
 * @param {any} pmtilesProps
 */
function writeHeader(
  rootDirOffset,
  rootDirLength,
  metadataOffset,
  metadataLength,
  tileDataOffset,
  tileDataLength,
  pmtilesProps,
) {
  // 127 bytes
  const buf = Buffer.alloc(127);
  buf.write('PMTiles', 0, 'utf-8');
  buf.writeUInt8(3, 7); // Version 3

  /**
   * @param {number} val
   * @param {number} offset
   */
  const writeUInt64 = (val, offset) => {
    const big = BigInt(val);
    buf.writeBigUInt64LE(big, offset);
  };

  writeUInt64(rootDirOffset, 8);
  writeUInt64(rootDirLength, 16);
  writeUInt64(metadataOffset, 24);
  writeUInt64(metadataLength, 32);
  writeUInt64(0, 40); // LeafDirectoryOffset (0=none)
  writeUInt64(0, 48); // LeafDirectoryLength
  writeUInt64(tileDataOffset, 56);
  writeUInt64(tileDataLength, 64);
  writeUInt64(pmtilesProps.numMethodTiles || 1, 72);
  writeUInt64(pmtilesProps.numTileEntries || 1, 80);
  writeUInt64(pmtilesProps.numTileContents || 1, 88);

  buf.writeUInt8(0, 96); // Clustered (false)
  buf.writeUInt8(pmtilesProps.internalCompression, 97);
  buf.writeUInt8(pmtilesProps.tileCompression, 98);
  buf.writeUInt8(pmtilesProps.tileType, 99);
  buf.writeUInt8(pmtilesProps.minZoom, 100);
  buf.writeUInt8(pmtilesProps.maxZoom, 101);

  /** @param {number} val */
  const e7 = (val) => Math.round(val * 10000000);
  buf.writeInt32LE(e7(pmtilesProps.minLon), 102);
  buf.writeInt32LE(e7(pmtilesProps.minLat), 106);
  buf.writeInt32LE(e7(pmtilesProps.maxLon), 110);
  buf.writeInt32LE(e7(pmtilesProps.maxLat), 114);

  buf.writeUInt8(pmtilesProps.centerZoom, 118);
  buf.writeInt32LE(e7(pmtilesProps.centerLon), 119);
  buf.writeInt32LE(e7(pmtilesProps.centerLat), 123);

  return buf;
}

/**
 * @param {string} filename
 * @param {number} tileType
 * @param {number} tileCompression
 * @param {Buffer} tileData
 * @param {number} z
 * @param {number} x
 * @param {number} y
 */
function createArchive(filename, tileType, tileCompression, tileData, z, x, y) {
  // 1. Metadata
  const metadata = {
    name: 'test',
    vector_layers: tileType === 1 ? [{ id: 'test' }] : undefined,
  };
  const metadataBuf = Buffer.from(JSON.stringify(metadata));
  const compressedMetadata = zlib.gzipSync(metadataBuf);

  // 2. Directory
  // Root Directory contains one entry
  const tileId = zxyToTileId(z, x, y);
  const entry = {
    tileId: tileId,
    offset: 0,
    length: tileData.length,
    runLength: 1,
  };
  const dirBuf = buildDirectory([entry]);
  const compressedDir = zlib.gzipSync(dirBuf);

  // 3. Assembly
  const headerLen = 127;
  const rootDirOffset = headerLen;
  const rootDirLength = compressedDir.length;
  const metadataOffset = rootDirOffset + rootDirLength;
  const metadataLength = compressedMetadata.length;
  const tileDataOffset = metadataOffset + metadataLength;
  const tileDataLength = tileData.length;

  const pmtilesProps = {
    internalCompression: 2, // Gzip
    tileCompression: tileCompression,
    tileType: tileType, // 1=MVT, 2=PNG
    minZoom: z,
    maxZoom: z,
    minLon: -180,
    minLat: -85,
    maxLon: 180,
    maxLat: 85,
    centerZoom: z,
    centerLon: 0,
    centerLat: 0,
    numMethodTiles: 1,
    numTileEntries: 1,
    numTileContents: 1,
  };

  const headerBuf = writeHeader(
    rootDirOffset,
    rootDirLength,
    metadataOffset,
    metadataLength,
    tileDataOffset,
    tileDataLength,
    pmtilesProps,
  );

  const fd = fs.openSync(path.join(OUT_DIR, filename), 'w');
  fs.writeSync(fd, headerBuf);
  fs.writeSync(fd, compressedDir);
  fs.writeSync(fd, compressedMetadata);
  fs.writeSync(fd, tileData);
  fs.closeSync(fd);

  console.log(`Created ${filename}`);
}

// Create minimal.mvt.pmtiles
// TileType 1 = MVT
// TileCompression 2 = Gzip (since we wrote GZIP buffer)
createArchive('minimal.mvt.pmtiles', 1, 2, MVT_BUFFER, 0, 0, 0);

// Create minimal.png.pmtiles
// TileType 2 = PNG
// TileCompression 1 = None
createArchive('minimal.png.pmtiles', 2, 1, PNG_BUFFER, 0, 0, 0);
