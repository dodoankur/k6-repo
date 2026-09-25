/* eslint-disable no-console */
const { spawnSync } = require("child_process");
const os = require("os");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const k6Path = path.join(ROOT, "bin", os.platform() === "win32" ? "k6.exe" : "k6");

const args = process.argv.slice(2);
const res = spawnSync(k6Path, args, { stdio: "inherit" });

process.exit(res.status ?? 1);

