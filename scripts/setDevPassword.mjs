#!/usr/bin/env node
import { createHash } from "crypto";
import { readFileSync, writeFileSync } from "fs";
import { createInterface } from "readline";

const JSON_PATH = "public/default_connect.json";

const rl = createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise((r) => rl.question(q, r));

const password = await ask("Enter new dev password (empty to remove): ");
rl.close();

const config = JSON.parse(readFileSync(JSON_PATH, "utf-8"));

if (!password) {
  delete config.devPassword;
  console.log("devPassword removed from", JSON_PATH);
} else {
  const hash = createHash("sha256").update(password).digest("hex");
  console.log("SHA-256:", hash);
  config.devPassword = hash;
  console.log("devPassword updated in", JSON_PATH);
}

writeFileSync(JSON_PATH, JSON.stringify(config, null, 2) + "\n");
