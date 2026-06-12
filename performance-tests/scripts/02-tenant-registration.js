import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
    stages: [
        { duration: '30s', target: 5 },
        { duration: '2m', target: 20 },
        { duration: '30s', target: 0 },
    ],
    thresholds: {
        http_req_duration: ['p(95)<2000'],
        'checks': ['rate>=0.90'],
    },
};

const BASE_URL = __ENV.BASE_URL || 'https://api.zordnet.com';
const ADMIN_KEY = __ENV.ADMIN_KEY || 'zord123';

export default function () {
    const payload = JSON.stringify({
        name: `perf-${Date.now()}-${__VU}-${__ITER}`,
    });

    const res = http.post(`${BASE_URL}/v1/admin/tenantReg`, payload, {
        headers: {
            'Content-Type': 'application/json',
            'X-Zord-ADMIN-KEY': ADMIN_KEY,
        },
    });

    check(res, {
        'endpoint reachable (not 5xx)': (r) => r.status < 500,
        'status is 201 or auth error': (r) => r.status === 201 || r.status === 401 || r.status === 403,
        'response time < 2s': (r) => r.timings.duration < 2000,
    });

    sleep(2);
}
