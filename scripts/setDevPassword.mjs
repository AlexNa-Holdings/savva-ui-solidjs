#!/usr/bin/env node
import { createHash } from "crypto";
import { readFileSync, writeFileSync } from "fs";
import { createInterface } from "readline";

const YAML_PATH = "public/default_connect.yaml";

const rl = createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise((r) => rl.question(q, r));

const password = await ask("Enter new dev password (empty to remove): ");
rl.close();

const yaml = readFileSync(YAML_PATH, "utf-8");

if (!password) {
  // Remove devPassword line and its comments
  const updated = yaml.replace(/# SHA-256 hash of the site password.*\n# Generate with:.*\ndevPassword:.*\n/, "");
  writeFileSync(YAML_PATH, updated);
  console.log("devPassword removed from", YAML_PATH);
} else {
  const hash = createHash("sha256").update(password).digest("hex");
  console.log("SHA-256:", hash);

  if (yaml.includes("devPassword:")) {
    const updated = yaml.replace(/devPassword:.*/, `devPassword: "${hash}"`);
    writeFileSync(YAML_PATH, updated);
  } else {
    // Insert after devMode line
    const updated = yaml.replace(
      /(devMode:.*\n)/,
      `$1# SHA-256 hash of the site password. Remove to disable password gate.\n# Generate with: node -e "console.log(require('crypto').createHash('sha256').update('YOUR_PASSWORD').digest('hex'))"\ndevPassword: "${hash}"\n`
    );
    writeFileSync(YAML_PATH, updated);
  }
  console.log("devPassword updated in", YAML_PATH);
}
