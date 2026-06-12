import http from 'k6/http';
import { check, sleep, group } from 'k6';

export const options = {
    stages: [
        { duration: '1m', target: 5 },
        { duration: '3m', target: 20 },
        { duration: '1m', target: 0 },
    ],
    thresholds: {
        http_req_duration: ['p(95)<3000'],
        http_req_failed: ['rate<0.10'],
    },
};

const BASE_URL = __ENV.BASE_URL || 'https://api.zordnet.com';
const ADMIN_KEY = __ENV.ADMIN_KEY || 'zord123';

export default function () {
    let apiKey, tenantId;

    group('01_register_tenant', function () {
        const res = http.post(
            `${BASE_URL}/v1/admin/tenantReg`,
            JSON.stringify({ name: `flow-${Date.now()}-${__VU}-${__ITER}` }),
            { headers: { 'Content-Type': 'application/json', 'X-Zord-ADMIN-KEY': ADMIN_KEY } }
        );
        check(res, { 'tenant created': (r) => r.status === 201 });
        if (res.status === 201) {
            const body = JSON.parse(res.body);
            apiKey = body.APIKEY;
            tenantId = body.TenantId;
        }
    });

    sleep(1);
    if (!apiKey) return;

    group('02_single_ingest', function () {
        const res = http.post(
            `${BASE_URL}/v1/ingest`,
            JSON.stringify({
                amount: 50000,
                currency: 'INR',
                beneficiary_name: `PerfUser${__VU}`,
                beneficiary_account: `${1000000000 + __ITER}`,
                beneficiary_ifsc: 'HDFC0001234',
                purpose: 'salary',
            }),
            { headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` } }
        );
        check(res, { 'ingest accepted': (r) => r.status === 200 || r.status === 201 });
    });

    sleep(1);

    group('03_query_intents', function () {
        const res = http.get(
            `${BASE_URL}/v1/intents?tenant_id=${tenantId}&limit=5`,
            { headers: { 'Authorization': `Bearer ${apiKey}` } }
        );
        check(res, { 'intents returned': (r) => r.status === 200 });
    });

    sleep(1);

    group('04_ai_copilot', function () {
        const res = http.post(
            `${BASE_URL}/v1/query`,
            JSON.stringify({ query: 'show me payout summary' }),
            {
                headers: {
                    'Content-Type': 'application/json',
                    'X-Tenant-Id': tenantId,
                    'Authorization': `Bearer ${apiKey}`,
                },
            }
        );
        check(res, { 'ai responded': (r) => r.status === 200 });
    });

    sleep(2);
}
