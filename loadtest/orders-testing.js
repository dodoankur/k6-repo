import http from "k6/http";
import { check, sleep } from "k6";
import { Rate } from "k6/metrics";
 
// Configurable target URL (defaults to the provided endpoint)
const TARGET_URL =
  __ENV.TARGET_URL ||
  "https://lxp70rt7wj.execute-api.eu-west-2.amazonaws.com/api/orders/testing";
 
function asInt(value, fallback) {
  const s = value === undefined || value === null ? "" : String(value);
  const n = Number.parseInt(s, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

// If set (e.g. 500), run a constant-concurrency test with that many VUs.
// This effectively sends ~N requests in parallel (one per VU per iteration).
const PARALLEL_VUS = asInt(__ENV.PARALLEL_VUS, 0);
const PARALLEL_DURATION = __ENV.PARALLEL_DURATION || "30s";

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
    return {
      discardResponseBodies: true,
      thresholds: thresholds,
      scenarios: {
        parallel: {
          executor: "constant-vus",
          vus: PARALLEL_VUS,
          duration: PARALLEL_DURATION,
        },
      },
    };
  }

  return {
    discardResponseBodies: true,
    thresholds: thresholds,
    stages: [
      { duration: "30s", target: 5 }, // warm up
      { duration: "1m", target: 25 }, // ramp up
      { duration: "2m", target: 25 }, // steady
      { duration: "1m", target: 50 }, // spike
      { duration: "1m", target: 0 }, // ramp down
    ],
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

  const res = http.get(TARGET_URL, {
    headers: headers,
    tags: { endpoint: "orders-testing" },
  });
 
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

  return {
    ["results/summary-" + ts + ".json"]: JSON.stringify(data, null, 2),
  };
}
