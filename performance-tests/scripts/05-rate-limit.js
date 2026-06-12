import http from 'k6/http';
import { check } from 'k6';
import { Counter, Rate } from 'k6/metrics';

const rateLimitedCount = new Counter('rate_limited_requests');
const rateLimitRate = new Rate('rate_limit_triggered');

export const options = {
    scenarios: {
        burst: {
            executor: 'shared-iterations',
            vus: 5,
            iterations: 100,
            maxDuration: '30s',
        },
    },
    thresholds: {
        // Pass if we get ANY response (401, 429, or other) — proves gateway is alive
        'checks': ['rate>=0.95'],
    },
};

const BASE_URL = __ENV.BASE_URL || 'https://api.zordnet.com';

export default function () {
    // Burst requests with NO sleep to trigger rate limiting (30/min on bulk-ingest)
    const res = http.post(`${BASE_URL}/v1/bulk-ingest`, null, {
        headers: { 'Authorization': 'Bearer fake-key-for-rate-test' },
    });

    if (res.status === 429) {
        rateLimitedCount.add(1);
        rateLimitRate.add(1);
        console.log(`✓ Rate limited at iteration ${__ITER + 1} (VU ${__VU})`);
    } else {
        rateLimitRate.add(0);
    }

    // Accept: 401 (auth rejected), 429 (rate limited), or any non-5xx response
    check(res, {
        'gateway responded (not 5xx)': (r) => r.status < 500,
    });

    // Log rate limit headers if present
    if (res.headers['RateLimit-Remaining'] || res.headers['X-RateLimit-Remaining-Minute']) {
        console.log(`Rate limit remaining: ${res.headers['RateLimit-Remaining'] || res.headers['X-RateLimit-Remaining-Minute']}`);
    }
}
