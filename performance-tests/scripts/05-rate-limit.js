import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter } from 'k6/metrics';

const rateLimitedCount = new Counter('rate_limited_requests');

export const options = {
    vus: 1,
    iterations: 40,
    thresholds: {
        rate_limited_requests: ['count>0'], // Must hit rate limit at least once
    },
};

const BASE_URL = __ENV.BASE_URL || 'https://api.zordnet.com';

export default function () {
    const res = http.post(`${BASE_URL}/v1/bulk-ingest`, null, {
        headers: { 'Authorization': 'Bearer fake-key-for-rate-test' },
    });

    if (res.status === 429) {
        rateLimitedCount.add(1);
        console.log(`✓ Rate limited at iteration ${__ITER + 1}`);
    }

    check(res, {
        'got response (401 or 429)': (r) => r.status === 401 || r.status === 429,
    });

    sleep(0.5);
}
