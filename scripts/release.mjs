// scripts/release.mjs
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import dotenv from "dotenv";

const ROOT = process.cwd();
dotenv.config({ path: path.join(ROOT, ".env") });

const VERSION_FILE = path.join(ROOT, "src", "version.js");
const DIST_DIR = path.join(ROOT, "dist");
const MAIN_BRANCH = process.env.GIT_MAIN_BRANCH || "main";
const PROD_BRANCH = process.env.PROD_BRANCH || "Prod";

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

function runI18nScripts() {
  console.log("Running i18n scripts...");
  sh("node scripts/i18n.mjs");
  sh("node scripts/i18n-docs.mjs");
}

function build() {
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

function gitCommitAndPush(version) {
  try { sh("git add -A"); } catch {}
  try { sh(`git commit -m "release: v${version}"`); }
  catch { console.warn("No changes to commit."); }
  // Push current branch
  try { sh("git rev-parse --abbrev-ref HEAD"); } catch {}
  try { sh("git push"); } catch {}
  // Also push HEAD to Prod branch (without switching)
  try { sh(`git push origin HEAD:${PROD_BRANCH}`); } catch {}
}

// ensure we finish on MAIN_BRANCH (ff-only pull for freshness)
function ensureMainBranch() {
  try {
    const current = execSync("git rev-parse --abbrev-ref HEAD").toString().trim();
    if (current !== MAIN_BRANCH) {
      sh(`git checkout ${MAIN_BRANCH}`);
    }
    sh(`git pull --ff-only origin ${MAIN_BRANCH}`);
  } catch (e) {
    console.warn(`Could not switch back to ${MAIN_BRANCH}:`, e?.message || e);
  }
}

function deploy() {
  if (!DEPLOY_HOST || !DEPLOY_USER || !DEPLOY_PATH) {
    console.error("Missing DEPLOY_HOST / DEPLOY_USER / DEPLOY_PATH in .env — skipping SCP.");
    return;
  }
  const keyOpt = DEPLOY_SSH_KEY ? `-i "${DEPLOY_SSH_KEY}"` : "";
  const portOpt = DEPLOY_PORT ? `-p ${DEPLOY_PORT}` : "";

  // Ensure path exists, then scp
  sh(`ssh ${keyOpt} ${portOpt} ${DEPLOY_USER}@${DEPLOY_HOST} "mkdir -p '${DEPLOY_PATH}'"`);
  sh(`scp ${keyOpt} ${portOpt} -r dist/* ${DEPLOY_USER}@${DEPLOY_HOST}:"${DEPLOY_PATH}/"`);
}

(async function main() {
  const { major, minor, text } = readVersion();
  const nextVersion = writeVersion(major, minor + 1, text);
  console.log(`Bumped version to ${nextVersion}`);

  runI18nScripts();
  build();
  copyVersionFile();
  gitCommitAndPush(nextVersion);
  deploy();
  ensureMainBranch();

  console.log(`Done. Released v${nextVersion}.`);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});