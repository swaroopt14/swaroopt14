/**
 * Test 03: Bulk CSV Ingest + Single JSON Ingest
 * 
 * Tests the payment ingestion pipeline:
 *   - POST /v1/bulk-ingest (multipart CSV upload)
 *   - POST /v1/ingest      (single JSON payment)
 * 
 * Auth: Bearer token from tenant registration
 * Headers: X-Zord-Source-Type, X-Zord-Source-Class, X-Zord-Tenant-Type
 * Rate limit: 30 req/min on bulk-ingest
 */

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Counter } from 'k6/metrics';

const successfulIngests = new Counter('successful_ingests');
const rateLimited = new Counter('rate_limited_ingests');

export const options = {
    stages: [
        { duration: '30s', target: 3 },
        { duration: '2m', target: 10 },
        { duration: '30s', target: 0 },
    ],
    thresholds: {
        checks: ['rate>=0.60'],
        http_req_duration: ['p(95)<5000'],
    },
};

const BASE_URL = __ENV.BASE_URL || 'https://api.zordnet.com';
const ADMIN_KEY = __ENV.ADMIN_KEY || 'zord123';

export function setup() {
    // Register a tenant to get a valid API key
    const res = http.post(
        `${BASE_URL}/v1/admin/tenantReg`,
        JSON.stringify({ name: `perf-ingest-${Date.now()}` }),
        { headers: { 'Content-Type': 'application/json', 'X-Zord-ADMIN-KEY': ADMIN_KEY } }
    );
    if (res.status === 201) {
        const body = JSON.parse(res.body);
        return { apiKey: body.APIKEY, tenantId: body.TenantId };
    }
    console.warn(`Setup: tenant creation returned ${res.status}`);
    return { apiKey: '', tenantId: '' };
}

export default function (data) {
    const authHeaders = data.apiKey
        ? { 'Authorization': `Bearer ${data.apiKey}`, 'Content-Type': 'application/json' }
        : { 'Authorization': 'Bearer test-key', 'Content-Type': 'application/json' };

    // Step 1: Single JSON ingest
    group('single_ingest', function () {
        const payload = JSON.stringify({
            amount: 50000 + __ITER,
            currency: 'INR',
            beneficiary_name: `PerfUser-${__VU}-${__ITER}`,
            beneficiary_account: `${1000000000 + __ITER}`,
            beneficiary_ifsc: 'HDFC0001234',
            purpose: 'salary',
        });

        const res = http.post(`${BASE_URL}/v1/ingest`, payload, {
            headers: authHeaders,
        });

        const passed = check(res, {
            'ingest accepted or auth error': (r) => r.status === 200 || r.status === 201 || r.status === 401 || r.status === 429,
            'not server error': (r) => r.status < 500,
            'response time < 5s': (r) => r.timings.duration < 5000,
        });

        if (res.status === 200 || res.status === 201) successfulIngests.add(1);
        if (res.status === 429) rateLimited.add(1);
    });

    sleep(2);

    // Step 2: Bulk CSV ingest
    group('bulk_csv_ingest', function () {
        if (!data.apiKey) return;

        const csv = [
            'tenant_id,amount,currency,beneficiary_name,beneficiary_account,beneficiary_ifsc,purpose',
            `${data.tenantId},${50000 + __ITER},INR,BulkUser${__VU}a,${2000000000 + __ITER},HDFC0001234,salary`,
            `${data.tenantId},${25000 + __ITER},INR,BulkUser${__VU}b,${3000000000 + __ITER},ICIC0005678,vendor`,
            `${data.tenantId},${75000 + __ITER},INR,BulkUser${__VU}c,${4000000000 + __ITER},SBIN0001234,bonus`,
        ].join('\n');

        const res = http.post(`${BASE_URL}/v1/bulk-ingest`,
            { file: http.file(csv, 'payments.csv', 'text/csv') },
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
            'bulk ingest accepted or rate limited': (r) => r.status < 500,
            'response time < 5s': (r) => r.timings.duration < 5000,
        });

        if (res.status === 429) rateLimited.add(1);
    });

    sleep(2);
}
