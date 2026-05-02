
package handler

import (
	"net/http"
	"strings"

	"zord-edge/auth/dto"
	"zord-edge/auth/service"
	"zord-edge/middleware"

	"github.com/gin-gonic/gin"
)
type Handler struct {
	service *service.Service
}

func New(authService *service.Service) *Handler {
	return &Handler{service: authService}
}

func (h *Handler) Login(c *gin.Context) {
	var request dto.LoginRequest
	if err := c.ShouldBindJSON(&request); err != nil {
		c.JSON(http.StatusBadRequest, dto.ErrorResponse{Code: "INVALID_AUTH_REQUEST", Message: "workspace_id, email, password, and login_surface are required"})
		return
	}

	response, appErr := h.service.Login(c.Request.Context(), request, requestMetaFromContext(c))
	if appErr != nil {
		writeAppError(c, appErr)
		return
	}

	c.JSON(http.StatusOK, response)
}

func (h *Handler) Refresh(c *gin.Context) {
	var request dto.RefreshRequest
	if err := c.ShouldBindJSON(&request); err != nil {
		c.JSON(http.StatusBadRequest, dto.ErrorResponse{Code: "REFRESH_TOKEN_REQUIRED", Message: "refresh_token is required"})
		return
	}

	response, appErr := h.service.Refresh(c.Request.Context(), request.RefreshToken, requestMetaFromContext(c))
	if appErr != nil {
		writeAppError(c, appErr)
		return
	}

	c.JSON(http.StatusOK, response)
}

func (h *Handler) Logout(c *gin.Context) {
	var request dto.LogoutRequest
	if err := c.ShouldBindJSON(&request); err != nil {
		c.JSON(http.StatusBadRequest, dto.ErrorResponse{Code: "REFRESH_TOKEN_REQUIRED", Message: "refresh_token is required"})
		return
	}

	appErr := h.service.Logout(c.Request.Context(), request.RefreshToken, requestMetaFromContext(c))
	if appErr != nil {
		writeAppError(c, appErr)
		return
	}

	c.JSON(http.StatusOK, gin.H{"success": true})
}

func (h *Handler) Me(c *gin.Context) {
	accessToken := extractBearerToken(c.GetHeader("Authorization"))
	if accessToken == "" {
		c.JSON(http.StatusUnauthorized, dto.ErrorResponse{Code: "INVALID_SESSION", Message: "Session expired"})
		return
	}

	response, appErr := h.service.Me(c.Request.Context(), accessToken)
	if appErr != nil {
		writeAppError(c, appErr)
		return
	}

	c.JSON(http.StatusOK, response)
}

func (h *Handler) CreateUser(c *gin.Context) {
	claims := middleware.GetSessionClaims(c)
	if claims == nil {
		c.JSON(http.StatusUnauthorized, dto.ErrorResponse{Code: "INVALID_SESSION", Message: "Session expired"})
		return
	}

	var request dto.CreateUserRequest
	if err := c.ShouldBindJSON(&request); err != nil {
		c.JSON(http.StatusBadRequest, dto.ErrorResponse{Code: "INVALID_CREATE_USER_REQUEST", Message: "tenant/workspace, email, password, role, and name are required"})
		return
	}

	response, appErr := h.service.CreateUser(c.Request.Context(), claims, request, requestMetaFromContext(c))
	if appErr != nil {
		writeAppError(c, appErr)
		return
	}

	c.JSON(http.StatusCreated, response)
}

func (h *Handler) ListUsers(c *gin.Context) {
	claims := middleware.GetSessionClaims(c)
	if claims == nil {
		c.JSON(http.StatusUnauthorized, dto.ErrorResponse{Code: "INVALID_SESSION", Message: "Session expired"})
		return
	}

	response, appErr := h.service.ListUsers(c.Request.Context(), claims)
	if appErr != nil {
		writeAppError(c, appErr)
		return
	}

	c.JSON(http.StatusOK, response)
}

func (h *Handler) UpdateUserStatus(c *gin.Context) {
	claims := middleware.GetSessionClaims(c)
	if claims == nil {
		c.JSON(http.StatusUnauthorized, dto.ErrorResponse{Code: "INVALID_SESSION", Message: "Session expired"})
		return
	}

	var request dto.UpdateUserStatusRequest
	if err := c.ShouldBindJSON(&request); err != nil {
		c.JSON(http.StatusBadRequest, dto.ErrorResponse{Code: "INVALID_STATUS", Message: "status must be ACTIVE or DISABLED"})
		return
	}

	response, appErr := h.service.UpdateUserStatus(c.Request.Context(), claims, c.Param("id"), request.Status, requestMetaFromContext(c))
	if appErr != nil {
		writeAppError(c, appErr)
		return
	}

	c.JSON(http.StatusOK, response)
}

func requestMetaFromContext(c *gin.Context) service.RequestMeta {
	return service.RequestMeta{
		IP:        c.ClientIP(),
		UserAgent: c.Request.UserAgent(),
	}
}

func writeAppError(c *gin.Context, appErr *service.AppError) {
	c.JSON(appErr.HTTPStatus, dto.ErrorResponse{Code: appErr.Code, Message: appErr.Message})
}

func extractBearerToken(header string) string {
	if !strings.HasPrefix(header, "Bearer ") {
		return ""
	}
	return strings.TrimSpace(strings.TrimPrefix(header, "Bearer "))
}
