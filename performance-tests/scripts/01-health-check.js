import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
    stages: [
        { duration: '30s', target: 10 },
        { duration: '1m', target: 50 },
        { duration: '30s', target: 100 },
        { duration: '1m', target: 100 },
        { duration: '30s', target: 0 },
    ],
    thresholds: {
        http_req_duration: ['p(95)<500'],
        // k6 counts non-2xx as "failed" — 401/403 auth responses are expected
        'checks': ['rate>=0.90'],
    },
};

const BASE_URL = __ENV.BASE_URL || 'https://api.zordnet.com';

export default function () {
    // Use actual API routes that return responses (not health check paths)
    const endpoints = [
        `${BASE_URL}/v1/admin/tenantReg`,
        `${BASE_URL}/v1/intents`,
        `${BASE_URL}/v1/settlement`,
        `${BASE_URL}/v1/evidence`,
        `${BASE_URL}/v1/projections`,
        `${BASE_URL}/v1/dispatch`,
    ];

    const endpoint = endpoints[Math.floor(Math.random() * endpoints.length)];
    const res = http.get(endpoint);

    check(res, {
        'kong routes correctly (not 502/503)': (r) => r.status !== 502 && r.status !== 503,
        'response time < 500ms': (r) => r.timings.duration < 500,
    });

    sleep(0.5);
}
