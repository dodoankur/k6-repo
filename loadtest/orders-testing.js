import http from "k6/http";
import { check, sleep } from "k6";
import { Rate } from "k6/metrics";
 
// Configurable target URL (defaults to the provided endpoint)
const TARGET_URL =
  __ENV.TARGET_URL ||
  "https://lxp70rt7wj.execute-api.eu-west-2.amazonaws.com/api/orders/testing";
 
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
 
export const options = {
  discardResponseBodies: true,
  stages: [
    { duration: "30s", target: 5 },   // warm up
    { duration: "1m", target: 25 },   // ramp up
    { duration: "2m", target: 25 },   // steady
    { duration: "1m", target: 50 },   // spike
    { duration: "1m", target: 0 },    // ramp down
  ],
  thresholds: {
    http_req_failed: ["rate<0.01"],          // <1% errors
    http_req_duration: ["p(95)<500", "p(99)<1000"], // latency SLOs (ms)
    errors: ["rate<0.01"],
  },
};
 
export default function () {
  const res = http.get(TARGET_URL, {
    headers: {
      "User-Agent": "k6-loadtest",
      ...extraHeaders(),
    },
    tags: { endpoint: "orders-testing" },
  });
 
  const ok = check(res, {
    "status is 2xx": (r) => r.status >= 200 && r.status < 300,
  });
 
  errors.add(!ok);
  sleep(1);
}
 
export function handleSummary(data) {
  return {
    "results/summary.json": JSON.stringify(data, null, 2),
  };
}
