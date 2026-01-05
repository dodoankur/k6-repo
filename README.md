# K6 load testing

This repo contains a K6 load test targeting:

- `https://lxp70rt7wj.execute-api.eu-west-2.amazonaws.com/api/orders/testing`

## Prerequisites

Install K6 locally (recommended) or run via Docker.

- Local install docs: `https://k6.io/docs/get-started/installation/`

## Run the test

### Local K6

```bash
mkdir -p results
k6 run loadtest/orders-testing.js
```

### Docker

```bash
mkdir -p results
docker run --rm -i -v "$PWD:/work" -w /work grafana/k6:latest run loadtest/orders-testing.js
```

## Configuration

Override the target URL:

```bash
TARGET_URL="https://lxp70rt7wj.execute-api.eu-west-2.amazonaws.com/api/orders/testing" k6 run loadtest/orders-testing.js
```

Pass additional headers (JSON):

```bash
EXTRA_HEADERS_JSON='{"Authorization":"Bearer YOUR_TOKEN"}' k6 run loadtest/orders-testing.js
```

## Results

- A run will write `results/summary.json` (K6 end-of-test summary).
