const express = require("express");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const RESULTS_DIR = path.join(ROOT, "results");
const PUBLIC_DIR = path.join(__dirname, "public");

function listResultFiles() {
  if (!fs.existsSync(RESULTS_DIR)) return [];
  const entries = fs.readdirSync(RESULTS_DIR, { withFileTypes: true });

  const files = [];
  for (const e of entries) {
    if (!e.isFile()) continue;
    if (!e.name.endsWith(".json")) continue;
    if (!e.name.startsWith("summary-")) continue;
    const full = path.join(RESULTS_DIR, e.name);
    const stat = fs.statSync(full);
    files.push({
      name: e.name,
      size: stat.size,
      mtimeMs: stat.mtimeMs,
      mtimeIso: stat.mtime.toISOString(),
    });
  }
  files.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return files;
}

function safeResultPath(filename) {
  // Basic traversal protection: filenames only.
  if (filename.includes("/") || filename.includes("\\") || filename.includes("..")) return null;
  if (!filename.startsWith("summary-") || !filename.endsWith(".json")) return null;
  return path.join(RESULTS_DIR, filename);
}

const app = express();

app.get("/api/results", (_req, res) => {
  res.json({ files: listResultFiles() });
});

app.get("/api/results/:filename", (req, res) => {
  const full = safeResultPath(req.params.filename);
  if (!full) return res.status(400).json({ error: "invalid filename" });
  if (!fs.existsSync(full)) return res.status(404).json({ error: "not found" });
  res.type("application/json").send(fs.readFileSync(full, "utf8"));
});

app.use("/", express.static(PUBLIC_DIR));

const port = Number.parseInt(process.env.PORT || "3000", 10);
app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`Results UI running on http://localhost:${port}`);
});

