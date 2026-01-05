# K6 load testing

This repo contains a K6 load test targeting:

- `https://lxp70rt7wj.execute-api.eu-west-2.amazonaws.com/api/orders/testing`

## Run the test

### Using npm scripts (recommended)

Install (downloads the official K6 binary into `./bin`):

```bash
npm install
```

Run:

```bash
npm run load
```

Run 500-parallel mode:

```bash
npm run load:parallel
```

### Local K6

If you want to run `k6 ...` directly in your shell, add this repo’s `./bin` to your PATH:

```bash
export PATH="$PWD/bin:$PATH"
```

```bash
mkdir -p results
k6 run loadtest/orders-testing.js
```

You can also run the repo-local binary directly:

```bash
mkdir -p results
./bin/k6 run loadtest/orders-testing.js
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
