const express = require("express");
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const { randomUUID } = require("crypto");

const ROOT = path.resolve(__dirname, "..");
const RESULTS_DIR = path.join(ROOT, "results");
const PUBLIC_DIR = path.join(__dirname, "public");
const K6_BIN = path.join(ROOT, "bin", process.platform === "win32" ? "k6.exe" : "k6");
const K6_SCRIPT = path.join(ROOT, "loadtest", "orders-testing.js");

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
app.use(express.json({ limit: "32kb" }));

function ensureResultsDir() {
  fs.mkdirSync(RESULTS_DIR, { recursive: true });
}

function sanitizeDuration(value) {
  if (value === undefined || value === null) return null;
  const s = String(value).trim();
  if (!s) return null;
  // allow: 10s, 5m, 2h, or seconds numeric
  if (/^\d+(\.\d+)?$/.test(s)) return s;
  if (/^\d+(\.\d+)?[smh]$/i.test(s)) return s;
  return null;
}

function sanitizeUrl(value) {
  if (value === undefined || value === null) return null;
  const s = String(value).trim();
  if (!s) return null;
  try {
    const u = new URL(s);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.toString();
  } catch {
    return null;
  }
}

function sanitizeInt(value, min, max) {
  if (value === undefined || value === null || value === "") return null;
  const n = Number.parseInt(String(value), 10);
  if (!Number.isFinite(n)) return null;
  if (n < min || n > max) return null;
  return n;
}

function sanitizeMethod(value) {
  if (value === undefined || value === null) return null;
  const s = String(value).trim().toUpperCase();
  if (!s) return null;
  // Allow common HTTP methods
  if (!/^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)$/.test(s)) return null;
  return s;
}

function sanitizeContentType(value) {
  if (value === undefined || value === null) return null;
  const s = String(value).trim();
  if (!s) return null;
  // Basic safety: keep it short and single-line.
  if (s.length > 200 || /[\r\n]/.test(s)) return null;
  return s;
}

function sanitizeCookieString(value) {
  if (value === undefined || value === null) return null;
  const s = String(value).trim();
  if (!s) return null;
  if (s.length > 4000 || /[\r\n]/.test(s)) return null;
  return s;
}

function sanitizePayload(value) {
  if (value === undefined || value === null) return null;
  const s = String(value);
  if (!s.trim()) return null;
  if (s.length > 20000) return null;
  return s;
}

function safeSummaryFilename(runId) {
  const d = new Date();
  const pad2 = (n) => (n < 10 ? `0${n}` : String(n));
  const ts =
    d.getFullYear() +
    pad2(d.getMonth() + 1) +
    pad2(d.getDate()) +
    "-" +
    pad2(d.getHours()) +
    pad2(d.getMinutes()) +
    pad2(d.getSeconds());
  return `summary-${ts}-${runId}.json`;
}

// Run management (single active run to keep things safe/simple)
let activeRun = null;
const runs = new Map(); // id -> run

function emit(run, type, payload) {
  const data = typeof payload === "string" ? payload : JSON.stringify(payload);
  for (const res of run.clients) {
    res.write(`event: ${type}\n`);
    res.write(`data: ${data.replace(/\r?\n/g, "\\n")}\n\n`);
  }
}

app.get("/api/results", (_req, res) => {
  res.json({ files: listResultFiles() });
});

app.get("/api/results/:filename", (req, res) => {
  const full = safeResultPath(req.params.filename);
  if (!full) return res.status(400).json({ error: "invalid filename" });
  if (!fs.existsSync(full)) return res.status(404).json({ error: "not found" });
  res.type("application/json").send(fs.readFileSync(full, "utf8"));
});

app.get("/api/run", (_req, res) => {
  if (!activeRun) return res.json({ active: false });
  return res.json({
    active: true,
    run: {
      id: activeRun.id,
      status: activeRun.status,
      startedAt: activeRun.startedAt,
      finishedAt: activeRun.finishedAt,
      exitCode: activeRun.exitCode,
      summaryFile: activeRun.summaryFile,
    },
  });
});

app.post("/api/run", (req, res) => {
  if (activeRun && activeRun.status === "running") {
    return res.status(409).json({ error: "a run is already in progress" });
  }

  if (!fs.existsSync(K6_BIN)) {
    return res.status(500).json({ error: "k6 binary not found. Run `npm install` first." });
  }

  ensureResultsDir();
  const id = randomUUID();

  const targetUrl = sanitizeUrl(req.body?.targetUrl);
  const parallelVus = sanitizeInt(req.body?.parallelVus, 1, 5000);
  const parallelDuration = sanitizeDuration(req.body?.parallelDuration);
  const totalDuration = sanitizeDuration(req.body?.totalDuration);
  const extraHeadersJson = req.body?.extraHeadersJson ? String(req.body.extraHeadersJson) : null;
  const requestMethod = sanitizeMethod(req.body?.requestMethod);
  const contentType = sanitizeContentType(req.body?.contentType);
  const payload = sanitizePayload(req.body?.payload);
  const cookies = sanitizeCookieString(req.body?.cookies);

  const summaryFile = safeSummaryFilename(id);
  const env = {
    ...process.env,
    SUMMARY_FILE: summaryFile,
  };
  if (targetUrl) env.TARGET_URL = targetUrl;
  if (parallelVus !== null) env.PARALLEL_VUS = String(parallelVus);
  if (parallelDuration) env.PARALLEL_DURATION = parallelDuration;
  if (totalDuration) env.TOTAL_DURATION = totalDuration;
  if (extraHeadersJson) env.EXTRA_HEADERS_JSON = extraHeadersJson;
  if (requestMethod) env.REQUEST_METHOD = requestMethod;
  if (contentType) env.CONTENT_TYPE = contentType;

  if (cookies) {
    // If valid JSON object, pass as COOKIES_JSON; else pass raw cookie header string.
    try {
      const parsed = JSON.parse(cookies);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        env.COOKIES_JSON = JSON.stringify(parsed);
      } else {
        env.COOKIES = cookies;
      }
    } catch (_) {
      env.COOKIES = cookies;
    }
  }

  if (payload) {
    // If valid JSON, pass as PAYLOAD_JSON; else PAYLOAD_RAW.
    try {
      const parsed = JSON.parse(payload);
      env.PAYLOAD_JSON = JSON.stringify(parsed);
    } catch (_) {
      env.PAYLOAD_RAW = payload;
    }
  }

  const args = ["run", K6_SCRIPT];

  const child = spawn(K6_BIN, args, {
    cwd: ROOT,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });

  const run = {
    id,
    status: "running",
    startedAt: new Date().toISOString(),
    finishedAt: null,
    exitCode: null,
    summaryFile,
    child,
    clients: new Set(),
  };
  runs.set(id, run);
  activeRun = run;

  const onData = (chunk, stream) => {
    const s = chunk.toString("utf8");
    emit(run, "log", { stream, line: s });
  };
  child.stdout.on("data", (c) => onData(c, "stdout"));
  child.stderr.on("data", (c) => onData(c, "stderr"));
  child.on("close", (code) => {
    run.status = "finished";
    run.exitCode = code;
    run.finishedAt = new Date().toISOString();
    emit(run, "done", {
      id: run.id,
      exitCode: run.exitCode,
      summaryFile: run.summaryFile,
      ok: code === 0,
    });
    // Keep run in map for later lookup; clear active pointer.
    activeRun = null;
    // Close any open SSE clients.
    for (const client of run.clients) {
      try {
        client.end();
      } catch (_) {
        // ignore
      }
    }
    run.clients.clear();
  });

  return res.json({
    id,
    summaryFile,
    status: run.status,
    startedAt: run.startedAt,
  });
});

app.post("/api/run/:id/stop", (req, res) => {
  const run = runs.get(req.params.id);
  if (!run) return res.status(404).json({ error: "not found" });
  if (run.status !== "running") return res.status(409).json({ error: "not running" });
  run.child.kill("SIGINT");
  return res.json({ ok: true });
});

app.get("/api/run/:id/events", (req, res) => {
  const run = runs.get(req.params.id);
  if (!run) return res.status(404).end();

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  run.clients.add(res);
  emit(run, "status", {
    id: run.id,
    status: run.status,
    startedAt: run.startedAt,
    finishedAt: run.finishedAt,
    exitCode: run.exitCode,
    summaryFile: run.summaryFile,
  });

  req.on("close", () => {
    run.clients.delete(res);
  });
});

app.use("/", express.static(PUBLIC_DIR));

const port = Number.parseInt(process.env.PORT || "3000", 10);
app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`Results UI running on http://localhost:${port}`);
});

