import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
    stages: [
        { duration: '10s', target: 0 },    // quiet
        { duration: '5s', target: 200 },   // SPIKE to 200 users in 5 seconds
        { duration: '30s', target: 200 },  // hold spike
        { duration: '10s', target: 0 },    // recovery
    ],
    thresholds: {
        http_req_duration: ['p(95)<5000'],  // relaxed: 5s during spike
        // Note: k6 counts non-2xx as "failed" — 401 auth responses are expected
        // We use custom checks instead to verify gateway stability
        'checks': ['rate>=0.90'],           // 90%+ of checks must pass
    },
};

const BASE_URL = __ENV.BASE_URL || 'https://api.zordnet.com';

export default function () {
    // Use multiple endpoints to simulate real spike traffic
    const endpoints = [
        `${BASE_URL}/edge/health`,
        `${BASE_URL}/v1/intents`,
        `${BASE_URL}/v1/projections`,
    ];
    const endpoint = endpoints[Math.floor(Math.random() * endpoints.length)];

    const res = http.get(endpoint);
    check(res, {
        'not 502/503 (gateway alive)': (r) => r.status !== 502 && r.status !== 503,
        'response time < 5s': (r) => r.timings.duration < 5000,
    });
    sleep(0.2);
}
