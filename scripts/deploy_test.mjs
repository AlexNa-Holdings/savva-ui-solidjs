// scripts/deploy_test.mjs
// Quick build and deploy to test server with version bump, but no git operations
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import dotenv from "dotenv";

const ROOT = process.cwd();
dotenv.config({ path: path.join(ROOT, ".env") });

const VERSION_FILE = path.join(ROOT, "src", "version.js");
const DIST_DIR = path.join(ROOT, "dist");

const DEPLOY_HOST = process.env.DEPLOY_HOST || "";
const DEPLOY_USER = process.env.DEPLOY_USER || "";
const DEPLOY_PATH = process.env.DEPLOY_PATH || "";
const DEPLOY_PORT = process.env.DEPLOY_PORT || "";
const DEPLOY_SSH_KEY = process.env.DEPLOY_SSH_KEY || "";

function sh(cmd, opts = {}) {
  console.log(`$ ${cmd}`);
  return execSync(cmd, { stdio: "inherit", ...opts });
}

function readVersion() {
  const text = fs.readFileSync(VERSION_FILE, "utf8");
  const m = text.match(/APP_VERSION\s*=\s*["'`](\d+)\.(\d+)["'`]/);
  if (!m) throw new Error("Could not parse APP_VERSION in src/version.js");
  return { major: Number(m[1]), minor: Number(m[2]), text };
}

function writeVersion(major, minor, prevText) {
  const next = `${major}.${minor}`;
  const out = prevText.replace(/APP_VERSION\s*=\s*["'`](\d+\.\d+)["'`]/, `APP_VERSION = "${next}"`);
  fs.writeFileSync(VERSION_FILE, out, "utf8");
  return next;
}

function build() {
  console.log("\n=== Building application ===\n");
  sh("npm run build");
}

function copyVersionFile() {
  if (!fs.existsSync(DIST_DIR)) {
    console.error(`Error: dist directory does not exist at ${DIST_DIR}. Build might have failed.`);
    process.exit(1);
  }
  const dest = path.join(DIST_DIR, "version.js");
  console.log(`Copying ${VERSION_FILE} to ${dest}`);
  fs.copyFileSync(VERSION_FILE, dest);
}

function copyNotoEmojiFont() {
  // The Noto Color Emoji CSS references fonts at ./files/*.woff2
  // These need to be in dist/assets/files/ since CSS is in dist/assets/
  const srcDir = path.join(ROOT, "node_modules", "@infolektuell", "noto-color-emoji", "files");
  const destDir = path.join(DIST_DIR, "assets", "files");

  if (!fs.existsSync(srcDir)) {
    console.warn("Warning: Noto Color Emoji font files not found, skipping copy");
    return;
  }

  console.log(`Copying Noto Color Emoji fonts to ${destDir}`);
  fs.mkdirSync(destDir, { recursive: true });

  const files = fs.readdirSync(srcDir);
  for (const file of files) {
    if (file.endsWith(".woff2")) {
      const src = path.join(srcDir, file);
      const dest = path.join(destDir, file);
      fs.copyFileSync(src, dest);
      console.log(`  Copied ${file}`);
    }
  }
}

function deploy() {
  console.log("\n=== Deploying to server ===\n");

  if (!DEPLOY_HOST || !DEPLOY_USER || !DEPLOY_PATH) {
    console.error("Missing DEPLOY_HOST / DEPLOY_USER / DEPLOY_PATH in .env — cannot deploy.");
    process.exit(1);
  }

  const portOpt = DEPLOY_PORT ? `-P ${DEPLOY_PORT}` : "";
  const sshPortOpt = DEPLOY_PORT ? `-p ${DEPLOY_PORT}` : "";
  const sshKeyOpt = DEPLOY_SSH_KEY ? `-i ${DEPLOY_SSH_KEY}` : "";
  const sshTarget = `${DEPLOY_USER}@${DEPLOY_HOST}`;
  const archiveName = "dist-release.tar.gz";

  // 1. Create compressed archive locally
  sh(`tar -czf ${archiveName} -C dist .`);

  // 2. Ensure remote path exists
  sh(`ssh ${sshPortOpt} ${sshKeyOpt} ${sshTarget} "mkdir -p '${DEPLOY_PATH}'"`);

  // 3. Transfer single archive
  sh(`scp ${portOpt} ${sshKeyOpt} ${archiveName} ${sshTarget}:"${DEPLOY_PATH}/${archiveName}"`);

  // 4. Extract on server and clean up remote archive
  sh(`ssh ${sshPortOpt} ${sshKeyOpt} ${sshTarget} "cd '${DEPLOY_PATH}' && tar -xzf ${archiveName} && rm ${archiveName}"`);

  // 5. Clean up local archive
  fs.unlinkSync(path.join(ROOT, archiveName));

  console.log("\n=== Deploy complete (tar transfer) ===\n");
}

(async function main() {
  console.log("Starting test deployment (with version bump, no git operations)\n");

  // Bump version
  const { major, minor, text } = readVersion();
  const nextVersion = writeVersion(major, minor + 1, text);
  console.log(`Bumped version to ${nextVersion}`);

  build();
  copyVersionFile();
  copyNotoEmojiFont();
  deploy();

  console.log(`Done. Test deployment complete. Version: ${nextVersion}`);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
