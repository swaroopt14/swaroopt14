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
        http_req_failed: ['rate<0.01'],
    },
};

const BASE_URL = __ENV.BASE_URL || 'https://api.zordnet.com';

export default function () {
    const endpoints = [
        `${BASE_URL}/edge/health`,
        `${BASE_URL}/intent/health`,
        `${BASE_URL}/relay/health`,
        `${BASE_URL}/outcome/health`,
        `${BASE_URL}/evidence/health`,
        `${BASE_URL}/intelligence/health`,
        `${BASE_URL}/prompt/health`,
        `${BASE_URL}/token/health`,
    ];

    const endpoint = endpoints[Math.floor(Math.random() * endpoints.length)];
    const res = http.get(endpoint);

    check(res, {
        'status is 200': (r) => r.status === 200,
        'response time < 500ms': (r) => r.timings.duration < 500,
    });

    sleep(0.5);
}
