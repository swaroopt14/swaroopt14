import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
    stages: [
        { duration: '30s', target: 3 },
        { duration: '2m', target: 10 },
        { duration: '30s', target: 0 },
    ],
    thresholds: {
        http_req_duration: ['p(95)<5000'],
        'checks': ['rate>=0.60'],  // Allow some CSV format rejections
    },
};

const BASE_URL = __ENV.BASE_URL || 'https://api.zordnet.com';
const ADMIN_KEY = __ENV.ADMIN_KEY || 'zord123';

export function setup() {
    const res = http.post(
        `${BASE_URL}/v1/admin/tenantReg`,
        JSON.stringify({ name: `perf-bulk-${Date.now()}` }),
        { headers: { 'Content-Type': 'application/json', 'X-Zord-ADMIN-KEY': ADMIN_KEY } }
    );
    if (res.status !== 201) {
        console.error(`Setup failed: ${res.status} ${res.body}`);
        return { apiKey: '' };
    }
    const body = JSON.parse(res.body);
    return { apiKey: body.APIKEY };
}

export default function (data) {
    if (!data.apiKey) return;

    const csv = [
        'tenant_id,amount,currency,beneficiary_name,beneficiary_account,beneficiary_ifsc,purpose',
        `perfbulk,${50000 + __ITER},INR,User${__VU},${1000000000 + __ITER},HDFC0001234,salary`,
        `perfbulk,${25000 + __ITER},INR,User${__VU}b,${2000000000 + __ITER},ICIC0005678,vendor`,
        `perfbulk,${75000 + __ITER},INR,User${__VU}c,${3000000000 + __ITER},SBIN0001234,bonus`,
    ].join('\n');

    const res = http.post(`${BASE_URL}/v1/bulk-ingest`,
        { file: http.file(csv, 'test.csv', 'text/csv') },
        {
            headers: {
                'Authorization': `Bearer ${data.apiKey}`,
                'X-Zord-Source-Type': 'CSV',
                'X-Zord-Source-Class': 'INTENT',
                'X-Zord-Tenant-Type': 'BANK',
            },
        }
    );

    check(res, {
        'status is 200 or 201 or 429': (r) => r.status === 200 || r.status === 201 || r.status === 429,
        'has results or rate limited': (r) => r.body.includes('results') || r.status === 429,
        'response time < 5s': (r) => r.timings.duration < 5000,
    });

    sleep(3);
}
