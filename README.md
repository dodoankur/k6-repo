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

## View results in a web page

Start the local results viewer:

```bash
npm run web
```

Then open `http://localhost:3000`.

- You can **run a new test from the page** (TARGET_URL / PARALLEL_VUS / TOTAL_DURATION / etc.), watch live output, and then click **View result**.
- You can also select any existing `results/summary-*.json` file (newest first) and see charts.

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

Send a POST request with JSON payload:

```bash
REQUEST_METHOD=POST PAYLOAD_JSON='{"foo":"bar"}' k6 run loadtest/orders-testing.js
```

Send a POST request with raw payload + content-type:

```bash
REQUEST_METHOD=POST CONTENT_TYPE="text/plain" PAYLOAD_RAW="hello" k6 run loadtest/orders-testing.js
```

Send cookies (raw header string):

```bash
COOKIES="a=b; c=d" k6 run loadtest/orders-testing.js
```

Send cookies (JSON map):

```bash
COOKIES_JSON='{"session":"abc","user":"123"}' k6 run loadtest/orders-testing.js
```

Send 500 requests in parallel (500 concurrent VUs):

```bash
PARALLEL_VUS=500 PARALLEL_DURATION="30s" k6 run loadtest/orders-testing.js
```

Override total test duration (accepts `10s`, `5m`, `1h` or plain seconds like `600`):

```bash
TOTAL_DURATION="10m" k6 run loadtest/orders-testing.js
```

In 500-parallel mode, `TOTAL_DURATION` overrides `PARALLEL_DURATION`:

```bash
PARALLEL_VUS=500 TOTAL_DURATION="2m" k6 run loadtest/orders-testing.js
```

Pass additional headers (JSON):

```bash
EXTRA_HEADERS_JSON='{"Authorization":"Bearer YOUR_TOKEN"}' k6 run loadtest/orders-testing.js
```

## Results

- Each run writes a new K6 end-of-test summary file like `results/summary-YYYYMMDD-HHMMSS.json` (so runs don’t overwrite each other).
