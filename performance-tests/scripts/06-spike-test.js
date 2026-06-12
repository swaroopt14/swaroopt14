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
        http_req_failed: ['rate<0.20'],     // allow up to 20% failure during spike
    },
};

const BASE_URL = __ENV.BASE_URL || 'https://api.zordnet.com';

export default function () {
    const res = http.get(`${BASE_URL}/edge/health`);
    check(res, {
        'status is 200 or 429': (r) => r.status === 200 || r.status === 429,
        'response time < 5s': (r) => r.timings.duration < 5000,
    });
    sleep(0.2);
}
