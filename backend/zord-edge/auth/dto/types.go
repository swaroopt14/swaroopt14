package dto

// This package owns the JSON contracts for the human-login auth API.
// Keeping them centralized makes it easier for the console and backend to stay aligned.
type LoginRequest struct {
	WorkspaceID  string `json:"workspace_id" binding:"required"`
	Email        string `json:"email" binding:"required"`
	Password     string `json:"password" binding:"required"`
	LoginSurface string `json:"login_surface" binding:"required"`
}

type RefreshRequest struct {
	RefreshToken string `json:"refresh_token" binding:"required"`
}

type LogoutRequest struct {
	RefreshToken string `json:"refresh_token" binding:"required"`
}

type CreateUserRequest struct {
	TenantID      string `json:"tenant_id"`
	WorkspaceCode string `json:"workspace_code"`
	Email         string `json:"email" binding:"required"`
	Password      string `json:"password" binding:"required"`
	Role          string `json:"role" binding:"required"`
	Name          string `json:"name" binding:"required"`
}

type UpdateUserStatusRequest struct {
	Status string `json:"status" binding:"required"`
}

type UserResponse struct {
	ID            string `json:"id"`
	Email         string `json:"email"`
	Role          string `json:"role"`
	Name          string `json:"name"`
	TenantID      string `json:"tenant_id"`
	TenantName    string `json:"tenant_name"`
	WorkspaceCode string `json:"workspace_code"`
	Status        string `json:"status"`
	MFAEnabled    bool   `json:"mfa_enabled"`
	LastLoginAt   string `json:"last_login_at,omitempty"`
}

type SessionResponse struct {
	SessionID       string `json:"session_id"`
	TenantID        string `json:"tenant_id"`
	WorkspaceCode   string `json:"workspace_code"`
	Role            string `json:"role"`
	AccessExpiresAt string `json:"access_expires_at"`
}

type LoginResponse struct {
	User            UserResponse    `json:"user"`
	Session         SessionResponse `json:"session"`
	RequiresMFA     bool            `json:"requires_mfa"`
	AccessToken     string          `json:"access_token,omitempty"`
	RefreshToken    string          `json:"refresh_token,omitempty"`
	AccessExpiresAt string          `json:"access_expires_at"`
}

type MeResponse struct {
	User    UserResponse    `json:"user"`
	Session SessionResponse `json:"session"`
}

type ListUsersResponse struct {
	Items []UserResponse `json:"items"`
}

type ErrorResponse struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}
