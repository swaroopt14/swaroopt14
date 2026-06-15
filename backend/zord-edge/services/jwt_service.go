package services

import (
	"errors"
	"os"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
)

const (
	accessTokenTTL  = 1 * time.Hour
	refreshTokenTTL = 30 * 24 * time.Hour
)

// jwtSigningSecret holds the HMAC shared secret used to sign/verify JWTs.
// Loaded from the JWT_SIGNING_SECRET environment variable at startup.
// This same secret is configured in Kong for gateway-level token validation.
var jwtSigningSecret []byte

// InitJWTSigningSecret loads the HS256 signing secret from environment.
// Must be called during application startup (e.g. in main.go).
func InitJWTSigningSecret() error {
	secret := os.Getenv("JWT_SIGNING_SECRET")
	if secret == "" {
		return errors.New("JWT_SIGNING_SECRET environment variable is required")
	}
	jwtSigningSecret = []byte(secret)
	return nil
}

type AccessClaims struct {
	TenantID uuid.UUID `json:"tenant_id"`
	UserID   uuid.UUID `json:"user_id"`
	Email    string    `json:"email"`
	Role     string    `json:"role"`
	jwt.RegisteredClaims
}

type RefreshClaims struct {
	TenantID  uuid.UUID `json:"tenant_id"`
	UserID    uuid.UUID `json:"user_id"`
	SessionID uuid.UUID `json:"session_id"`
	TokenID   uuid.UUID `json:"token_id"`
	jwt.RegisteredClaims
}

type IssuedTokens struct {
	AccessToken      string
	AccessExpiresAt  time.Time
	RefreshToken     string
	RefreshExpiresAt time.Time
	SessionID        uuid.UUID
	RefreshTokenID   uuid.UUID
}

func issuer() string {
	if v := os.Getenv("JWT_ISSUER"); v != "" {
		return v
	}
	return "zord-edge"
}

func audience() string {
	if v := os.Getenv("JWT_AUDIENCE"); v != "" {
		return v
	}
	return "zord-console"
}

func IssueTokens(tenantID, userID uuid.UUID, email, role string) (*IssuedTokens, error) {
	if len(jwtSigningSecret) == 0 {
		return nil, errors.New("JWT signing secret not initialized")
	}
	now := time.Now().UTC()
	sessionID := uuid.New()
	refreshTokenID := uuid.New()

	// Access token — HS256, validated by Kong at the gateway level.
	// Kong checks: algorithm (HS256), iss claim ("zord-edge"), exp claim.
	accessExp := now.Add(accessTokenTTL)
	access := jwt.NewWithClaims(jwt.SigningMethodHS256, AccessClaims{
		TenantID: tenantID,
		UserID:   userID,
		Email:    email,
		Role:     role,
		RegisteredClaims: jwt.RegisteredClaims{
			Issuer:    issuer(),
			Audience:  jwt.ClaimStrings{audience()},
			Subject:   userID.String(),
			IssuedAt:  jwt.NewNumericDate(now),
			NotBefore: jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(accessExp),
			ID:        uuid.NewString(),
		},
	})
	accessStr, err := access.SignedString(jwtSigningSecret)
	if err != nil {
		return nil, err
	}

	// Refresh token — HS256, only validated by zord-edge (not Kong).
	refreshExp := now.Add(refreshTokenTTL)
	refresh := jwt.NewWithClaims(jwt.SigningMethodHS256, RefreshClaims{
		TenantID:  tenantID,
		UserID:    userID,
		SessionID: sessionID,
		TokenID:   refreshTokenID,
		RegisteredClaims: jwt.RegisteredClaims{
			Issuer:    issuer(),
			Audience:  jwt.ClaimStrings{audience()},
			Subject:   userID.String(),
			IssuedAt:  jwt.NewNumericDate(now),
			NotBefore: jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(refreshExp),
			ID:        refreshTokenID.String(),
		},
	})
	refreshStr, err := refresh.SignedString(jwtSigningSecret)
	if err != nil {
		return nil, err
	}

	return &IssuedTokens{
		AccessToken:      accessStr,
		AccessExpiresAt:  accessExp,
		RefreshToken:     refreshStr,
		RefreshExpiresAt: refreshExp,
		SessionID:        sessionID,
		RefreshTokenID:   refreshTokenID,
	}, nil
}

func parseToken(tokenStr string, claims jwt.Claims) error {
	if len(jwtSigningSecret) == 0 {
		return errors.New("JWT signing secret not initialized")
	}
	_, err := jwt.ParseWithClaims(tokenStr, claims, func(t *jwt.Token) (any, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, errors.New("unexpected signing method")
		}
		return jwtSigningSecret, nil
	}, jwt.WithIssuer(issuer()), jwt.WithAudience(audience()))
	return err
}

func ParseAccessToken(tokenStr string) (*AccessClaims, error) {
	claims := &AccessClaims{}
	if err := parseToken(tokenStr, claims); err != nil {
		return nil, err
	}
	return claims, nil
}

func ParseRefreshToken(tokenStr string) (*RefreshClaims, error) {
	claims := &RefreshClaims{}
	if err := parseToken(tokenStr, claims); err != nil {
		return nil, err
	}
	return claims, nil
}
