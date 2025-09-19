#!/usr/bin/env node
// Build __files.json manifests for every directory under /public/domain_default
// Usage: node scripts/build-domain-default-manifest.mjs [rootDir]
// Default rootDir: public/domain_default

import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT = path.resolve(process.argv[2] || "public/domain_default");
const MANIFEST_NAME = "__files.json";

// RFC 1123 / HTTP-date (e.g., "Wed, 17 Sep 2025 21:19:39 GMT")
const httpDate = (d) => new Date(d).toUTCString();

// Return an array of entry objects for a directory
async function buildEntries(dir) {
  const list = await fs.readdir(dir, { withFileTypes: true });

  const entries = [];
  for (const de of list) {
    const name = de.name;

    // Skip our own manifests
    if (name === MANIFEST_NAME) continue;

    // Stat to get mtime/size (follow symlinks as-is)
    const full = path.join(dir, name);
    const st = await fs.stat(full);

    if (de.isDirectory()) {
      entries.push({
        name,
        type: "directory",
        mtime: httpDate(st.mtime),
      });
    } else {
      entries.push({
        name,
        type: "file",
        mtime: httpDate(st.mtime),
        size: st.size,
      });
    }
  }

  // Sort like nginx typically shows: directories first, then files; alpha by name
  entries.sort((a, b) => {
    if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  return entries;
}

async function writeManifest(dir) {
  const entries = await buildEntries(dir);
  const json = JSON.stringify(entries, null, 2) + "\n";
  await fs.writeFile(path.join(dir, MANIFEST_NAME), json);
}

// Walk recursively and write a manifest in each directory
async function walk(dir) {
  await writeManifest(dir);
  const list = await fs.readdir(dir, { withFileTypes: true });
  for (const de of list) {
    if (de.isDirectory()) {
      await walk(path.join(dir, de.name));
    }
  }
}

async function main() {
  try {
    const st = await fs.stat(ROOT);
    if (!st.isDirectory()) {
      console.error(`Not a directory: ${ROOT}`);
      process.exit(2);
    }
    await walk(ROOT);
    console.log(`OK: wrote manifests under ${ROOT}`);
  } catch (err) {
    console.error("Error:", err?.message || err);
    process.exit(1);
  }
}

main();
