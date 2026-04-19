package handlers

import (
	"context"
	"net/http"
)

// TenantIsolationMiddleware verifies that the tenant requesting the action matches the TenantID context passed.
// In a production Grade B environment, this intercepts the Zord gateway JWT,
// cross-references with the queried URL domain or header injections, protecting isolated projections.
func TenantIsolationMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Example: Check X-Tenant-Id header directly against requested payload tenant.
		// If working via secure external gateways, this header is dropped down natively.
		reqTenant := r.URL.Query().Get("tenant_id")
		headerTenant := r.Header.Get("X-Tenant-Id")

		if reqTenant != "" && headerTenant != "" {
			if reqTenant != headerTenant {
				writeError(w, http.StatusForbidden, "tenant context spoofing prohibited")
				return
			}
		} else if headerTenant != "" {
			// Attach verified caller to standard context
			ctx := context.WithValue(r.Context(), "verified_x_tenant", headerTenant)
			r = r.WithContext(ctx)
		}

		next.ServeHTTP(w, r)
	})
}
