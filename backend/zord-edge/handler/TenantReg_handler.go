package handler

import (
	"log"
	"net/http"

	"zord-edge/db"
	"zord-edge/model"
	"zord-edge/services"

	"github.com/gin-gonic/gin"
)

func Tenant_Registry(context *gin.Context) {
	var req model.MerchantRequest
	err := context.ShouldBindJSON(&req)
	log.Println(req)
	if err != nil {
		context.JSON(http.StatusBadRequest, gin.H{"Message": "Invalid Merchent Name", "Error": err})
		return
	}
	TenantId, FullApiKey, err := services.TenantReg(context.Request.Context(), db.DB, req.Name)
	if err != nil {
		log.Printf("Tenant registration failed: %v", err)
		context.JSON(http.StatusInternalServerError, gin.H{
			"error":   "tenant registration failed",
			"details": err.Error(), // TEMPORARY for debugging
		})
		return
	}
	context.JSON(http.StatusCreated, gin.H{"Message": "Merchent Registered",
		"TenantId": TenantId,
		"APIKEY":   FullApiKey})
}
