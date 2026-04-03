package routes

import (
	"github.com/gin-gonic/gin"

	"zord-edge/handler"
	"zord-edge/middleware"
	"zord-edge/validator"
)

func Routes(router *gin.Engine, h *handler.Handler) {

	public := router.Group("/v1")
	{
		public.POST("/tenantReg", handler.Tenant_Registry)
		public.GET("/health", handler.HealthCheck)
		public.GET("/tenants", handler.ListTenants) // NEW
		public.GET("/tenants/:tenant_id", handler.GetTenantByID)
	}

	// Webhook routes
	webhooks := router.Group("/v1/raw/envelopes")
	webhooks.Use(middleware.VerifyWebhookSignature(), middleware.TransportValidation()) //Need to check with sudarshan
	{
		webhooks.POST("/webhooks/:provider/:connectorID", h.WebhookHandler)
	}

	if err := validator.InitSchemaValidator(); err != nil {
		panic("Failed to initialize schema validator: " + err.Error())
	}

	protected := router.Group("/v1")
	protected.Use(
		middleware.Authenticate(),
		//middleware.TraceMiddleware(),
		middleware.TransportValidation(),
	)

	// JSON ingest (needs JSON validation + idempotency header)
	protected.POST(
		"/ingest",
		middleware.ValidateIntentRequest(),
		middleware.GetIdempotencyKey(),
		h.IntentHandler,
	)

	// Bulk ingest (multipart, so no JSON validation, no header idempotency)
	protected.POST(
		"/bulk-ingest",
		h.BulkIntentHandler,
	)

}
