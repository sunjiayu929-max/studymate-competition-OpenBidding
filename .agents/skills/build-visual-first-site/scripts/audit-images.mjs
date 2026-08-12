#!/usr/bin/env node

import assert from "node:assert/strict";
import { lstat, readdir, readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const supported = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".gif",
  ".avif",
  ".heic",
  ".heif",
]);

async function collect(target, output, failures, visitedDirectories) {
  const resolved = path.resolve(target);
  let info;

  try {
    info = await lstat(resolved);
  } catch (error) {
    failures.push({ path: target, error: error instanceof Error ? error.message : String(error) });
    return;
  }

  if (info.isSymbolicLink()) return;

  if (info.isDirectory()) {
    const canonical = await realpath(resolved);
    if (visitedDirectories.has(canonical)) return;
    visitedDirectories.add(canonical);

    let entries;
    try {
      entries = await readdir(resolved, { withFileTypes: true });
    } catch (error) {
      failures.push({ path: target, error: error instanceof Error ? error.message : String(error) });
      return;
    }

    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      await collect(path.join(resolved, entry.name), output, failures, visitedDirectories);
    }
    return;
  }

  if (info.isFile() && supported.has(path.extname(resolved).toLowerCase())) {
    output.push(resolved);
  }
}

function pngSize(buffer) {
  if (
    buffer.length < 24 ||
    buffer[0] !== 0x89 ||
    buffer.toString("ascii", 1, 4) !== "PNG"
  ) return null;

  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

function gifSize(buffer) {
  if (buffer.length < 10 || buffer.toString("ascii", 0, 3) !== "GIF") return null;
  return { width: buffer.readUInt16LE(6), height: buffer.readUInt16LE(8) };
}

function parseExifOrientation(segment) {
  if (segment.length < 14 || segment.toString("ascii", 0, 6) !== "Exif\0\0") return 1;

  const tiffStart = 6;
  const byteOrder = segment.toString("ascii", tiffStart, tiffStart + 2);
  if (byteOrder !== "II" && byteOrder !== "MM") return 1;

  const littleEndian = byteOrder === "II";
  const read16 = (offset) => littleEndian
    ? segment.readUInt16LE(offset)
    : segment.readUInt16BE(offset);
  const read32 = (offset) => littleEndian
    ? segment.readUInt32LE(offset)
    : segment.readUInt32BE(offset);

  try {
    if (read16(tiffStart + 2) !== 42) return 1;
    const ifdOffset = read32(tiffStart + 4);
    const ifdStart = tiffStart + ifdOffset;
    if (ifdStart + 2 > segment.length) return 1;

    const entryCount = read16(ifdStart);
    for (let index = 0; index < entryCount; index += 1) {
      const entry = ifdStart + 2 + index * 12;
      if (entry + 12 > segment.length) break;
      if (read16(entry) !== 0x0112) continue;

      const type = read16(entry + 2);
      const count = read32(entry + 4);
      if (type !== 3 || count < 1) return 1;

      const orientation = read16(entry + 8);
      return orientation >= 1 && orientation <= 8 ? orientation : 1;
    }
  } catch {
    return 1;
  }

  return 1;
}

function applyExifOrientation(size, exifOrientation = 1) {
  if (!size) return null;
  const swapsAxes = exifOrientation >= 5 && exifOrientation <= 8;
  return {
    width: swapsAxes ? size.height : size.width,
    height: swapsAxes ? size.width : size.height,
    rawWidth: size.width,
    rawHeight: size.height,
    exifOrientation,
  };
}

function jpegMetadata(buffer) {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) return null;

  const startOfFrame = new Set([
    0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7,
    0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf,
  ]);

  let rawSize = null;
  let exifOrientation = 1;
  let offset = 2;

  while (offset + 4 <= buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset += 1;
      continue;
    }

    while (offset < buffer.length && buffer[offset] === 0xff) offset += 1;
    if (offset >= buffer.length) break;

    const marker = buffer[offset];
    offset += 1;

    if (marker === 0xd9 || marker === 0xda) break;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 2 > buffer.length) break;

    const length = buffer.readUInt16BE(offset);
    if (length < 2 || offset + length > buffer.length) break;

    const dataStart = offset + 2;
    const dataEnd = offset + length;

    if (marker === 0xe1) {
      exifOrientation = parseExifOrientation(buffer.subarray(dataStart, dataEnd));
    }

    if (startOfFrame.has(marker) && dataStart + 5 <= dataEnd) {
      rawSize = {
        width: buffer.readUInt16BE(dataStart + 3),
        height: buffer.readUInt16BE(dataStart + 1),
      };
    }

    if (rawSize && exifOrientation !== 1) break;
    offset += length;
  }

  return applyExifOrientation(rawSize, exifOrientation);
}

function webpSize(buffer) {
  if (
    buffer.length < 30 ||
    buffer.toString("ascii", 0, 4) !== "RIFF" ||
    buffer.toString("ascii", 8, 12) !== "WEBP"
  ) return null;

  const chunk = buffer.toString("ascii", 12, 16);
  if (chunk === "VP8X") {
    return {
      width: 1 + buffer.readUIntLE(24, 3),
      height: 1 + buffer.readUIntLE(27, 3),
    };
  }
  if (chunk === "VP8 " && buffer.length >= 30) {
    return {
      width: buffer.readUInt16LE(26) & 0x3fff,
      height: buffer.readUInt16LE(28) & 0x3fff,
    };
  }
  if (chunk === "VP8L" && buffer.length >= 25 && buffer[20] === 0x2f) {
    const b1 = buffer[21];
    const b2 = buffer[22];
    const b3 = buffer[23];
    const b4 = buffer[24];
    return {
      width: 1 + b1 + ((b2 & 0x3f) << 8),
      height: 1 + ((b2 & 0xc0) >> 6) + (b3 << 2) + ((b4 & 0x0f) << 10),
    };
  }
  return null;
}

function isoBmffSize(buffer) {
  const candidates = [];

  let typeOffset = buffer.indexOf("ispe", 4, "ascii");
  while (typeOffset !== -1 && typeOffset + 16 <= buffer.length) {

    const boxStart = typeOffset - 4;
    const boxSize = buffer.readUInt32BE(boxStart);
    if (boxSize >= 20 && boxStart + boxSize <= buffer.length) {
      const width = buffer.readUInt32BE(typeOffset + 8);
      const height = buffer.readUInt32BE(typeOffset + 12);
      if (width > 0 && height > 0 && width <= 100000 && height <= 100000) {
        candidates.push({ width, height });
      }
    }

    typeOffset = buffer.indexOf("ispe", typeOffset + 4, "ascii");
  }

  if (!candidates.length) return null;
  return candidates.sort((a, b) => (b.width * b.height) - (a.width * a.height))[0];
}

function dimensions(buffer, extension) {
  if (extension === ".png") return pngSize(buffer);
  if (extension === ".gif") return gifSize(buffer);
  if (extension === ".jpg" || extension === ".jpeg") return jpegMetadata(buffer);
  if (extension === ".webp") return webpSize(buffer);
  if (extension === ".avif" || extension === ".heic" || extension === ".heif") {
    return isoBmffSize(buffer);
  }
  return null;
}

function roleCandidates(width, height) {
  const ratio = width / height;
  const result = [];

  if (ratio >= 2.4 && width >= 1600 && height >= 500) result.push("panorama-strip");
  if (ratio >= 1.25 && width >= 1440 && height >= 800) result.push("desktop-full-bleed");
  if (ratio >= 1.15 && width >= 1200 && height >= 720) result.push("desktop-art-directed-hero");
  if (ratio <= 1 && height >= 1200 && width >= 700) result.push("mobile-full-bleed");
  if (ratio <= 1.2 && height >= 1000 && width >= 600) result.push("mobile-art-directed-hero");
  if (ratio >= 0.8 && ratio <= 1.25) result.push("chapter-or-detail");
  if (Math.max(width, height) >= 1200) result.push("supporting-image");
  if (!result.length) result.push("detail-or-thumbnail");

  return [...new Set(result)];
}

function warnings(bytes, size, extension) {
  const result = [];

  if (!size) {
    result.push("unknown-dimensions", "native-inspection-or-conversion-needed");
  } else {
    if (Math.max(size.width, size.height) < 1200) result.push("limited-full-bleed-resolution");
    if (size.width < 1440 && size.width / size.height >= 1.25) {
      result.push("review-desktop-full-bleed-upscale");
    }
    const ratio = size.width / size.height;
    if (ratio > 3 || ratio < 0.34) result.push("extreme-aspect-ratio");
    if (size.exifOrientation && size.exifOrientation !== 1) result.push("exif-orientation-applied");
  }

  if (bytes > 12 * 1024 * 1024) result.push("very-large-file");
  if (extension === ".heic" || extension === ".heif") {
    result.push("web-derivative-recommended", "native-orientation-review-needed");
  }
  if (extension === ".avif") result.push("container-orientation-review-needed");
  if (extension === ".gif") result.push("inspect-animation-before-use");

  return [...new Set(result)];
}

function orientation(width, height) {
  if (width > height) return "landscape";
  if (width < height) return "portrait";
  return "square";
}

function relativeForReport(file) {
  const relative = path.relative(process.cwd(), file).split(path.sep).join("/");
  return relative.startsWith("..") ? path.resolve(file).split(path.sep).join("/") : relative;
}

async function audit(roots) {
  const files = [];
  const failures = [];
  const visitedDirectories = new Set();

  for (const root of roots) {
    await collect(root, files, failures, visitedDirectories);
  }

  const images = [];
  const uniqueFiles = [...new Set(files)].sort((a, b) => a.localeCompare(b));

  for (const file of uniqueFiles) {
    try {
      const [buffer, info] = await Promise.all([readFile(file), stat(file)]);
      const extension = path.extname(file).toLowerCase();
      const size = dimensions(buffer, extension);
      const candidates = size ? roleCandidates(size.width, size.height) : ["inspect-manually"];

      images.push({
        path: relativeForReport(file),
        format: extension.slice(1),
        bytes: info.size,
        width: size?.width ?? null,
        height: size?.height ?? null,
        rawWidth: size?.rawWidth ?? size?.width ?? null,
        rawHeight: size?.rawHeight ?? size?.height ?? null,
        exifOrientation: size?.exifOrientation ?? null,
        aspectRatio: size ? Number((size.width / size.height).toFixed(3)) : null,
        megapixels: size ? Number(((size.width * size.height) / 1_000_000).toFixed(2)) : null,
        orientation: size ? orientation(size.width, size.height) : null,
        roleCandidates: candidates,
        primaryMetadataCandidate: candidates[0],
        requiresVisualInspection: true,
        warnings: warnings(info.size, size, extension),
      });
    } catch (error) {
      failures.push({ path: file, error: error instanceof Error ? error.message : String(error) });
    }
  }

  const formats = {};
  for (const image of images) formats[image.format] = (formats[image.format] ?? 0) + 1;

  return {
    scannedRoots: roots,
    summary: {
      imageCount: images.length,
      unknownDimensionCount: images.filter((image) => image.width === null).length,
      formats,
    },
    images,
    failures,
    note: "Role candidates are metadata hints only; inspect pixels before assigning layout roles or crop anchors.",
  };
}

function selfTest() {
  assert(supported.has(".avif") && supported.has(".heic") && supported.has(".heif"));
  assert(roleCandidates(1536, 1024).includes("desktop-full-bleed"));
  assert(roleCandidates(900, 1600).includes("mobile-full-bleed"));
  assert.deepEqual(
    applyExifOrientation({ width: 4032, height: 3024 }, 6),
    { width: 3024, height: 4032, rawWidth: 4032, rawHeight: 3024, exifOrientation: 6 },
  );

  const exif = Buffer.alloc(32);
  exif.write("Exif\0\0", 0, "binary");
  exif.write("II", 6, "ascii");
  exif.writeUInt16LE(42, 8);
  exif.writeUInt32LE(8, 10);
  exif.writeUInt16LE(1, 14);
  exif.writeUInt16LE(0x0112, 16);
  exif.writeUInt16LE(3, 18);
  exif.writeUInt32LE(1, 20);
  exif.writeUInt16LE(6, 24);

  const app1Header = Buffer.from([0xff, 0xe1, 0x00, exif.length + 2]);
  const sofData = Buffer.alloc(15);
  sofData[0] = 8;
  sofData.writeUInt16BE(3024, 1);
  sofData.writeUInt16BE(4032, 3);
  const sofHeader = Buffer.from([0xff, 0xc0, 0x00, sofData.length + 2]);
  const orientedJpeg = Buffer.concat([
    Buffer.from([0xff, 0xd8]),
    app1Header,
    exif,
    sofHeader,
    sofData,
  ]);

  assert.deepEqual(
    jpegMetadata(orientedJpeg),
    { width: 3024, height: 4032, rawWidth: 4032, rawHeight: 3024, exifOrientation: 6 },
  );

  const ispe = Buffer.alloc(20);
  ispe.writeUInt32BE(20, 0);
  ispe.write("ispe", 4, "ascii");
  ispe.writeUInt32BE(1536, 12);
  ispe.writeUInt32BE(1024, 16);
  assert.deepEqual(isoBmffSize(ispe), { width: 1536, height: 1024 });

  assert(warnings(2_000_000, { width: 1536, height: 1024 }, ".png").length === 0);
  assert(warnings(2_000_000, null, ".heic").includes("native-inspection-or-conversion-needed"));

  return {
    passed: true,
    checks: [
      "1536x1024 desktop full-bleed candidacy",
      "portrait mobile candidacy",
      "AVIF/HEIC/HEIF collection support",
      "JPEG EXIF parsing and axis rotation",
      "AVIF/HEIC ISO-BMFF ispe dimensions",
      "warning calibration",
    ],
  };
}

function printHelp() {
  console.log(`Usage:
  node audit-images.mjs <image paths or directories>
  node audit-images.mjs --self-test

When no path is supplied, public/images is scanned. Supported extensions:
${[...supported].join(", ")}`);
}

async function main() {
  const args = process.argv.slice(2);

  if (args.includes("--help") || args.includes("-h")) {
    printHelp();
    return;
  }

  if (args.includes("--self-test")) {
    console.log(JSON.stringify(selfTest(), null, 2));
    return;
  }

  const roots = args.length ? args : ["public/images"];
  const result = await audit(roots);
  console.log(JSON.stringify(result, null, 2));

  if (result.failures.length && result.images.length === 0) process.exitCode = 1;
}

const isDirectRun = process.argv[1]
  && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;

if (isDirectRun) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.stack ?? error.message : String(error));
    process.exitCode = 1;
  });
}

export {
  applyExifOrientation,
  audit,
  dimensions,
  isoBmffSize,
  jpegMetadata,
  roleCandidates,
  selfTest,
  warnings,
};
