# K6 load testing

This repo contains a K6 load test targeting:

- `https://lxp70rt7wj.execute-api.eu-west-2.amazonaws.com/api/orders/testing`

## Prerequisites

Install K6 locally (recommended) or run via Docker.

- Local install docs: `https://k6.io/docs/get-started/installation/`

## Run the test

### Using npm scripts (recommended)

Install (there are no JS dependencies, this just gives you `npm run ...` commands):

```bash
npm install
```

Run with Docker (no local K6 install required):

```bash
npm run load:docker
```

Run 500-parallel mode with Docker:

```bash
npm run load:parallel:docker
```

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

Send 500 requests in parallel (500 concurrent VUs):

```bash
PARALLEL_VUS=500 PARALLEL_DURATION="30s" k6 run loadtest/orders-testing.js
```

Pass additional headers (JSON):

```bash
EXTRA_HEADERS_JSON='{"Authorization":"Bearer YOUR_TOKEN"}' k6 run loadtest/orders-testing.js
```

## Results

- A run will write `results/summary.json` (K6 end-of-test summary).
