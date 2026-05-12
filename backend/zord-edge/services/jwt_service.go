package services

import (
	"errors"
	"os"
	"time"

	"zord-edge/vault"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
)

const (
	accessTokenTTL  = 24 * time.Hour
	refreshTokenTTL = 30 * 24 * time.Hour
)

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
	if vault.SigningKey == nil {
		return nil, errors.New("signing key not initialized")
	}
	now := time.Now().UTC()
	sessionID := uuid.New()
	refreshTokenID := uuid.New()

	accessExp := now.Add(accessTokenTTL)
	access := jwt.NewWithClaims(jwt.SigningMethodEdDSA, AccessClaims{
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
	accessStr, err := access.SignedString(vault.SigningKey)
	if err != nil {
		return nil, err
	}

	refreshExp := now.Add(refreshTokenTTL)
	refresh := jwt.NewWithClaims(jwt.SigningMethodEdDSA, RefreshClaims{
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
	refreshStr, err := refresh.SignedString(vault.SigningKey)
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
	if vault.SigningKey == nil {
		return errors.New("signing key not initialized")
	}
	publicKey := vault.SigningKey.Public()
	_, err := jwt.ParseWithClaims(tokenStr, claims, func(t *jwt.Token) (any, error) {
		if _, ok := t.Method.(*jwt.SigningMethodEd25519); !ok {
			return nil, errors.New("unexpected signing method")
		}
		return publicKey, nil
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
