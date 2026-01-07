import http from "k6/http";
import { check, sleep } from "k6";
import { Rate } from "k6/metrics";
 
// Configurable target URL (defaults to the provided endpoint)
const TARGET_URL =
  __ENV.TARGET_URL ||
  "https://lxp70rt7wj.execute-api.eu-west-2.amazonaws.com/api/orders/testing";

// Request configuration
const REQUEST_METHOD = String(__ENV.REQUEST_METHOD || "GET").toUpperCase();
const CONTENT_TYPE = __ENV.CONTENT_TYPE ? String(__ENV.CONTENT_TYPE) : "";

function requestBody() {
  if (__ENV.PAYLOAD_JSON) return String(__ENV.PAYLOAD_JSON);
  if (__ENV.PAYLOAD_RAW) return String(__ENV.PAYLOAD_RAW);
  return null;
}

function cookiesHeaderValue() {
  if (__ENV.COOKIES_JSON) {
    try {
      const obj = JSON.parse(__ENV.COOKIES_JSON);
      if (!obj || typeof obj !== "object") return "";
      const parts = [];
      for (const k in obj) {
        // eslint-disable-next-line no-prototype-builtins
        if (!obj.hasOwnProperty(k)) continue;
        const v = obj[k];
        if (v === undefined || v === null) continue;
        parts.push(encodeURIComponent(String(k)) + "=" + encodeURIComponent(String(v)));
      }
      return parts.join("; ");
    } catch (_) {
      return "";
    }
  }
  if (__ENV.COOKIES) return String(__ENV.COOKIES);
  return "";
}
 
function asInt(value, fallback) {
  const s = value === undefined || value === null ? "" : String(value);
  const n = Number.parseInt(s, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function parseDurationToSeconds(value) {
  if (value === undefined || value === null) return null;
  const s = String(value).trim();
  if (!s) return null;

  // Plain number => seconds
  if (/^\d+(\.\d+)?$/.test(s)) {
    const n = Number(s);
    return Number.isFinite(n) && n > 0 ? n : null;
  }

  // k6-like short format: 30s, 5m, 2h
  const m = /^(\d+(\.\d+)?)(s|m|h)$/i.exec(s);
  if (!m) return null;
  const n = Number(m[1]);
  if (!Number.isFinite(n) || n <= 0) return null;
  const unit = m[3].toLowerCase();
  if (unit === "s") return n;
  if (unit === "m") return n * 60;
  if (unit === "h") return n * 3600;
  return null;
}

function formatSecondsAsK6Duration(totalSeconds) {
  // Keep it simple and always emit seconds (k6 accepts "123s").
  const s = Math.max(1, Math.round(totalSeconds));
  return String(s) + "s";
}

// If set (e.g. 500), run a constant-concurrency test with that many VUs.
// This effectively sends ~N requests in parallel (one per VU per iteration).
const PARALLEL_VUS = asInt(__ENV.PARALLEL_VUS, 0);
const PARALLEL_DURATION = __ENV.PARALLEL_DURATION || "30s";

// Optional total test duration override (e.g. "45s", "10m", "1h", or "600" (seconds)).
// - In PARALLEL mode: overrides PARALLEL_DURATION
// - In stage mode: scales all stage durations proportionally to fit this total
const TOTAL_DURATION_SECONDS = parseDurationToSeconds(__ENV.TOTAL_DURATION);

// Optional headers (e.g., auth) can be passed via env var:
//   EXTRA_HEADERS_JSON='{"Authorization":"Bearer ..."}'
function extraHeaders() {
  if (!__ENV.EXTRA_HEADERS_JSON) return {};
  try {
    const parsed = JSON.parse(__ENV.EXTRA_HEADERS_JSON);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (_) {
    return {};
  }
}
 
export const errors = new Rate("errors");
 
export const options = (function () {
  const thresholds = {
    http_req_failed: ["rate<0.01"], // <1% errors
    http_req_duration: ["p(95)<500", "p(99)<1000"], // latency SLOs (ms)
    errors: ["rate<0.01"],
  };

  if (PARALLEL_VUS > 0) {
    const duration =
      TOTAL_DURATION_SECONDS !== null
        ? formatSecondsAsK6Duration(TOTAL_DURATION_SECONDS)
        : PARALLEL_DURATION;
    return {
      discardResponseBodies: true,
      thresholds: thresholds,
      scenarios: {
        parallel: {
          executor: "constant-vus",
          vus: PARALLEL_VUS,
          duration: duration,
        },
      },
    };
  }

  const defaultStages = [
    { duration: "30s", target: 5 }, // warm up
    { duration: "1m", target: 25 }, // ramp up
    { duration: "2m", target: 25 }, // steady
    { duration: "1m", target: 50 }, // spike
    { duration: "1m", target: 0 }, // ramp down
  ];

  let stages = defaultStages;
  if (TOTAL_DURATION_SECONDS !== null) {
    // Scale each stage duration to match TOTAL_DURATION_SECONDS, preserving the shape.
    let baseTotal = 0;
    for (let i = 0; i < defaultStages.length; i++) {
      const sec = parseDurationToSeconds(defaultStages[i].duration);
      baseTotal += sec || 0;
    }
    if (baseTotal > 0) {
      const factor = TOTAL_DURATION_SECONDS / baseTotal;
      stages = [];
      for (let i = 0; i < defaultStages.length; i++) {
        const sec = parseDurationToSeconds(defaultStages[i].duration) || 1;
        const scaled = Math.max(1, sec * factor);
        stages.push({
          duration: formatSecondsAsK6Duration(scaled),
          target: defaultStages[i].target,
        });
      }
    }
  }

  return {
    discardResponseBodies: true,
    thresholds: thresholds,
    stages: stages,
  };
})();
 
export default function () {
  const headers = {
    "User-Agent": "k6-loadtest",
  };
  const extra = extraHeaders();
  for (const k in extra) {
    // eslint-disable-next-line no-prototype-builtins
    if (extra.hasOwnProperty(k)) headers[k] = extra[k];
  }

  const cookieValue = cookiesHeaderValue();
  if (cookieValue) headers["Cookie"] = cookieValue;
  if (CONTENT_TYPE && requestBody() !== null) headers["Content-Type"] = CONTENT_TYPE;
  if (!headers["Content-Type"] && __ENV.PAYLOAD_JSON) headers["Content-Type"] = "application/json";

  const method = REQUEST_METHOD;
  const body = requestBody();
  const params = { headers: headers, tags: { endpoint: "orders-testing" } };

  // k6 ignores bodies for GET/HEAD; pass null to keep intent explicit.
  const res =
    method === "GET" || method === "HEAD"
      ? http.request(method, TARGET_URL, null, params)
      : http.request(method, TARGET_URL, body === null ? "" : body, params);
 
  const ok = check(res, {
    "status is 2xx": (r) => r.status >= 200 && r.status < 300,
  });
 
  errors.add(!ok);
  sleep(1);
}
 
export function handleSummary(data) {
  function pad2(n) {
    return n < 10 ? "0" + n : "" + n;
  }

  function sanitizeFileName(name) {
    if (!name) return null;
    const s = String(name).trim();
    if (!s) return null;
    if (s.includes("/") || s.includes("\\") || s.includes("..")) return null;
    if (!s.endsWith(".json")) return null;
    return s;
  }

  // Use local time for filenames to match your machine clock.
  const now = new Date();
  const ts =
    now.getFullYear() +
    pad2(now.getMonth() + 1) +
    pad2(now.getDate()) +
    "-" +
    pad2(now.getHours()) +
    pad2(now.getMinutes()) +
    pad2(now.getSeconds());

  const requested = sanitizeFileName(__ENV.SUMMARY_FILE);
  const filename = requested || "summary-" + ts + ".json";

  return {
    ["results/" + filename]: JSON.stringify(data, null, 2),
  };
}
