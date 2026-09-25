/* eslint-disable no-console */
const fs = require("fs");
const os = require("os");
const path = require("path");
const https = require("https");
const { spawnSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const BIN_DIR = path.join(ROOT, "bin");
const K6_BIN = path.join(BIN_DIR, os.platform() === "win32" ? "k6.exe" : "k6");
const WORK_DIR = path.join(ROOT, ".k6");

const VERSION = process.env.K6_VERSION || "0.49.0";

function fail(msg) {
  console.error(`[k6-install] ${msg}`);
  process.exit(1);
}

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function mapPlatformArch() {
  const platform = os.platform();
  const arch = os.arch();

  if (platform === "linux") {
    if (arch === "x64") return { os: "linux", arch: "amd64" };
    if (arch === "arm64") return { os: "linux", arch: "arm64" };
  }
  if (platform === "darwin") {
    if (arch === "x64") return { os: "macos", arch: "amd64" };
    if (arch === "arm64") return { os: "macos", arch: "arm64" };
  }
  if (platform === "win32") {
    if (arch === "x64") return { os: "windows", arch: "amd64" };
  }

  return null;
}

function download(url, destPath) {
  return new Promise((resolve, reject) => {
    const request = https.get(
      url,
      { headers: { "User-Agent": "k6-load-testing-installer" } },
      (res) => {
        // Follow redirects
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          // Don't create/write any file for redirect responses.
          res.resume();
          download(res.headers.location, destPath).then(resolve).catch(reject);
          return;
        }

        if (res.statusCode !== 200) {
          res.resume();
          reject(new Error(`HTTP ${res.statusCode} for ${url}`));
          return;
        }

        const file = fs.createWriteStream(destPath);
        file.on("error", reject);
        res.on("error", reject);

        res.pipe(file);
        file.on("finish", () => file.close(resolve));
      }
    );

    request.on("error", (err) => {
      reject(err);
    });
  });
}

async function main() {
  // If already installed, skip.
  if (fs.existsSync(K6_BIN)) {
    console.log(`[k6-install] Found existing binary at ${path.relative(ROOT, K6_BIN)} (skipping)`);
    return;
  }

  const mapped = mapPlatformArch();
  if (!mapped) {
    fail(`Unsupported platform/arch: ${os.platform()}/${os.arch()}`);
  }

  ensureDir(BIN_DIR);
  ensureDir(WORK_DIR);

  const tag = `v${VERSION}`;
  const fileBase = `k6-${tag}-${mapped.os}-${mapped.arch}`;
  const ext = mapped.os === "windows" ? "zip" : "tar.gz";
  const filename = `${fileBase}.${ext}`;
  const url = `https://github.com/grafana/k6/releases/download/${tag}/${filename}`;

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "k6-"));
  const archivePath = path.join(tmpDir, filename);
  const extractDir = path.join(tmpDir, "extract");
  ensureDir(extractDir);

  console.log(`[k6-install] Downloading ${url}`);
  await download(url, archivePath);

  if (mapped.os === "windows") {
    fail("Windows zip install not implemented in this repo yet. Use Docker or install k6 via Chocolatey.");
  }

  // Extract tar.gz using system tar.
  const tar = spawnSync("tar", ["-xzf", archivePath, "-C", extractDir], { stdio: "inherit" });
  if (tar.status !== 0) fail("Failed to extract k6 archive (tar).");

  const extractedBin = path.join(extractDir, fileBase, "k6");
  if (!fs.existsSync(extractedBin)) {
    fail(`Extracted binary not found at ${extractedBin}`);
  }

  fs.copyFileSync(extractedBin, K6_BIN);
  fs.chmodSync(K6_BIN, 0o755);

  console.log(`[k6-install] Installed k6 ${VERSION} -> ${path.relative(ROOT, K6_BIN)}`);
  console.log(`[k6-install] Tip: add ./bin to PATH: export PATH=\"$PWD/bin:$PATH\"`);
}

main().catch((e) => fail(e.stack || e.message || String(e)));

