// tests/e2e/helpers/test-image.js
//
// Generates valid PNG buffers for testing: gradient image + pixel-art robot avatars.

import { deflateSync } from "node:zlib";

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function makeChunk(type, data) {
  const typeBuffer = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const crcInput = Buffer.concat([typeBuffer, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(crcInput), 0);
  return Buffer.concat([length, typeBuffer, data, crc]);
}

function buildPng(width, height, rawData) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8;  // bit depth
  ihdrData[9] = 2;  // color type: RGB
  const ihdr = makeChunk("IHDR", ihdrData);
  const idat = makeChunk("IDAT", deflateSync(rawData));
  const iend = makeChunk("IEND", Buffer.alloc(0));
  return Buffer.concat([signature, ihdr, idat, iend]);
}

/**
 * Create a valid PNG image buffer (RGB gradient).
 * Default 64x64 — large enough for the avatar editor's 256px crop.
 */
export function createTestPng(width = 64, height = 64) {
  const rowBytes = 1 + width * 3;
  const rawData = Buffer.alloc(height * rowBytes);
  for (let y = 0; y < height; y++) {
    const offset = y * rowBytes;
    rawData[offset] = 0; // No filter
    for (let x = 0; x < width; x++) {
      const px = offset + 1 + x * 3;
      rawData[px] = Math.floor((x / width) * 255);
      rawData[px + 1] = Math.floor((y / height) * 255);
      rawData[px + 2] = 128;
    }
  }
  return buildPng(width, height, rawData);
}

// ── Pixel-art robot avatars ──────────────────────────────────────────────────
// Each robot is defined as a 16×16 color-index grid scaled 4× to 64×64.

function createPixelArtPng(size, palette, grid) {
  const gridH = grid.length;
  const gridW = grid[0].length;
  const scale = Math.floor(size / gridW);
  const rowBytes = 1 + size * 3;
  const rawData = Buffer.alloc(size * rowBytes);
  for (let y = 0; y < size; y++) {
    const offset = y * rowBytes;
    rawData[offset] = 0;
    const gy = Math.min(Math.floor(y / scale), gridH - 1);
    for (let x = 0; x < size; x++) {
      const gx = Math.min(Math.floor(x / scale), gridW - 1);
      const [r, g, b] = palette[grid[gy][gx]];
      const px = offset + 1 + x * 3;
      rawData[px] = r;
      rawData[px + 1] = g;
      rawData[px + 2] = b;
    }
  }
  return buildPng(size, size, rawData);
}

// Robot 1 — "Blinky": Teal robot, single red-light antenna, round eyes, zigzag mouth
const R1_PALETTE = [
  [20,  20,  40 ], // 0: dark background
  [15,  80,  100], // 1: dark teal border
  [30,  180, 200], // 2: bright teal fill
  [240, 240, 255], // 3: white eyes
  [10,  10,  10 ], // 4: black pupils
  [255, 60,  60 ], // 5: red (mouth + antenna light)
  [140, 140, 155], // 6: gray antenna shaft
  [200, 210, 220], // 7: silver bolts
];
const R1_GRID = [
  [0,0,0,0,0,0,0,5,5,0,0,0,0,0,0,0], // antenna light
  [0,0,0,0,0,0,0,6,0,0,0,0,0,0,0,0], // antenna shaft
  [0,0,0,1,1,1,1,6,1,1,1,1,1,0,0,0], // head top
  [0,0,1,2,2,2,2,2,2,2,2,2,2,1,0,0],
  [0,0,1,2,3,3,3,2,2,3,3,3,2,1,0,0], // big round eyes
  [0,0,1,2,3,4,3,2,2,3,4,3,2,1,0,0], // pupils
  [0,0,1,2,3,3,3,2,2,3,3,3,2,1,0,0],
  [0,0,1,7,2,2,2,2,2,2,2,2,7,1,0,0], // cheek bolts
  [0,0,1,2,2,5,2,5,2,5,2,2,2,1,0,0], // zigzag mouth top
  [0,0,1,2,5,2,5,2,5,2,5,2,2,1,0,0], // zigzag mouth bottom
  [0,0,1,2,2,2,2,2,2,2,2,2,2,1,0,0], // chin
  [0,0,0,1,1,1,1,1,1,1,1,1,1,0,0,0], // head bottom
  [0,0,0,0,0,1,2,2,2,1,0,0,0,0,0,0], // neck
  [0,0,0,0,1,2,2,7,2,2,1,0,0,0,0,0], // body (bolt)
  [0,0,0,0,1,2,2,2,2,2,1,0,0,0,0,0],
  [0,0,0,0,0,1,1,1,1,1,0,0,0,0,0,0],
];

// Robot 2 — "Sparky": Orange robot, twin yellow antennae, green visor eyes, toothy grin
const R2_PALETTE = [
  [40,  20,  60 ], // 0: dark purple background
  [160, 70,  10 ], // 1: dark orange border
  [240, 160, 40 ], // 2: bright orange fill
  [0,   255, 100], // 3: green visor eyes
  [10,  10,  10 ], // 4: (unused)
  [255, 255, 255], // 5: white teeth
  [140, 140, 155], // 6: gray antenna shaft
  [255, 230, 0  ], // 7: yellow antenna tips
  [50,  20,  20 ], // 8: mouth interior
  [200, 210, 220], // 9: silver bolt
];
const R2_GRID = [
  [0,0,0,0,7,0,0,0,0,0,0,7,0,0,0,0], // twin antenna tips
  [0,0,0,0,6,0,0,0,0,0,0,6,0,0,0,0], // antenna shafts
  [0,0,0,1,1,1,1,1,1,1,1,1,1,0,0,0], // head top
  [0,0,1,2,2,2,2,2,2,2,2,2,2,1,0,0],
  [0,0,1,2,3,3,3,2,2,3,3,3,2,1,0,0], // rectangular visor eyes
  [0,0,1,2,3,3,3,2,2,3,3,3,2,1,0,0],
  [0,0,1,2,2,2,2,2,2,2,2,2,2,1,0,0],
  [0,0,1,2,2,2,2,2,2,2,2,2,2,1,0,0],
  [0,0,1,2,8,5,8,5,8,5,8,5,2,1,0,0], // toothy grin
  [0,0,1,2,8,8,8,8,8,8,8,8,2,1,0,0], // mouth base
  [0,0,1,2,2,2,2,2,2,2,2,2,2,1,0,0], // chin
  [0,0,0,1,1,1,1,1,1,1,1,1,1,0,0,0], // head bottom
  [0,0,0,0,0,1,2,2,2,1,0,0,0,0,0,0], // neck
  [0,0,0,0,1,2,2,9,2,2,1,0,0,0,0,0], // body (bolt)
  [0,0,0,0,1,2,2,2,2,2,1,0,0,0,0,0],
  [0,0,0,0,0,1,1,1,1,1,0,0,0,0,0,0],
];

/** Teal robot with single antenna, round eyes, zigzag mouth */
export function createRobotAvatar1(size = 64) {
  return createPixelArtPng(size, R1_PALETTE, R1_GRID);
}

/** Orange robot with twin antennae, green visor eyes, toothy grin */
export function createRobotAvatar2(size = 64) {
  return createPixelArtPng(size, R2_PALETTE, R2_GRID);
}
