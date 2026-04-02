package services

import (
	"context"
	"crypto/rand"
	"log"
	"time"

	"zord-token-enclave/internal/crypto"
	"zord-token-enclave/internal/keymanager"
	"zord-token-enclave/internal/models"
	"zord-token-enclave/internal/repository"

	"github.com/google/uuid"
)

type TokenService struct {
	repo       *repository.TokenRepository
	keyManager keymanager.KeyManager
}

// ✅ Constructor
func NewTokenService(r *repository.TokenRepository, km keymanager.KeyManager) *TokenService {
	return &TokenService{
		repo:       r,
		keyManager: km,
	}
}

// ✅ Single field tokenize (STATEFUL)
func (s *TokenService) Tokenize(
	ctx context.Context,
	tenantID,
	kind string,
	plaintext []byte,
) (string, error) {

	//  Ensure key exists (ADD THIS HERE)
	if err := s.EnsureInitialKey(ctx, tenantID); err != nil {
		return "", err
	}

	// 🔥 1. Get ACTIVE key
	key, err := s.keyManager.GetActiveKey(ctx, tenantID)
	if err != nil {
		return "", err
	}

	// 🔥 2. Encrypt using key
	cryptoSvc := crypto.NewCrypto(key.RawKey)

	ciphertext, nonce, err := cryptoSvc.Encrypt(plaintext)
	if err != nil {
		return "", err
	}

	tokenID := uuid.New().String()

	// 🔥 3. Store in DB with key reference
	rec := models.TokenRecord{
		TokenID:         tokenID,
		TenantID:        tenantID,
		Kind:            kind,
		Ciphertext:      ciphertext,
		Nonce:           nonce,
		EncryptionKeyID: key.KeyID,
		KeyVersion:      key.Version,
		Status:          "ACTIVE",
	}

	if err := s.repo.Insert(ctx, rec); err != nil {
		return "", err
	}

	return tokenID, nil
}

// ✅ Bulk tokenize (UNCHANGED logic)
func (s *TokenService) TokenizePII(
	ctx context.Context,
	tenantID string,
	traceID string,
	pii map[string]string,
) (map[string]string, error) {

	result := make(map[string]string)

	for field, value := range pii {

		if value == "" {
			continue
		}

		token, err := s.Tokenize(ctx, tenantID, field, []byte(value))
		if err != nil {
			return nil, err
		}

		result[field] = token
	}

	return result, nil
}

// ✅ Bulk detokenize (STATEFUL)
func (s *TokenService) DetokenizeFields(
	ctx context.Context,
	tokens map[string]string,
) (map[string]string, error) {

	result := make(map[string]string)

	for field, tokenID := range tokens {

		if tokenID == "" {
			continue
		}

		// 🔥 1. Fetch token from DB
		rec, err := s.repo.Get(ctx, tokenID)
		if err != nil {
			return nil, err
		}

		// 🔥 2. Get correct key
		key, err := s.keyManager.GetKeyByID(ctx, rec.EncryptionKeyID)
		if err != nil {
			return nil, err
		}

		// 🔥 3. Decrypt
		cryptoSvc := crypto.NewCrypto(key.RawKey)

		plain, err := cryptoSvc.Decrypt(rec.Ciphertext, rec.Nonce)
		if err != nil {
			return nil, err
		}

		result[field] = string(plain)
	}

	return result, nil
}

func (s *TokenService) RotateKey(ctx context.Context, tenantID string, createdBy string) error {

	// 🔐 Generate new AES-256 key (32 bytes)
	newKey := make([]byte, 32)
	if _, err := rand.Read(newKey); err != nil {
		return err
	}

	newKeyID := uuid.New().String()

	return s.repo.RotateKey(ctx, tenantID, newKeyID, newKey, createdBy)
}

func (s *TokenService) MigrateKeys(ctx context.Context, tenantID string) error {

	// 1️⃣ Get RETIRING key (old key)
	oldKey, err := s.repo.GetRetiringKey(ctx, tenantID)
	if err != nil {
		// no retiring key → nothing to migrate
		return nil
	}

	// 2️⃣ Get ACTIVE key (new key)
	newKey, err := s.keyManager.GetActiveKey(ctx, tenantID)
	if err != nil {
		return err
	}

	oldCrypto := crypto.NewCrypto(oldKey.RawKey)
	newCrypto := crypto.NewCrypto(newKey.RawKey)

	for {
		// 3️⃣ Fetch batch
		tokens, err := s.repo.GetTokensByKey(ctx, oldKey.KeyID, 100)
		if err != nil {
			return err
		}

		if len(tokens) == 0 {
			break
		}

		log.Printf("🔁 Migrating %d tokens from key %s → %s",
			len(tokens), oldKey.KeyID, newKey.KeyID)

		for _, t := range tokens {

			// 🔓 decrypt with old key
			plain, err := oldCrypto.Decrypt(t.Ciphertext, t.Nonce)
			if err != nil {
				return err
			}

			// 🔐 encrypt with new key
			newCipher, newNonce, err := newCrypto.Encrypt(plain)
			if err != nil {
				return err
			}

			// 💾 update DB
			err = s.repo.UpdateTokenKey(
				ctx,
				t.TokenID,
				newCipher,
				newNonce,
				newKey.KeyID,
				newKey.Version,
			)
			if err != nil {
				return err
			}
		}

		// 📊 progress log
		remaining, _ := s.repo.CountTokensByKey(ctx, oldKey.KeyID)
		log.Printf("📊 Remaining tokens on old key: %d", remaining)
	}

	// 4️⃣ Final check
	count, err := s.repo.CountTokensByKey(ctx, oldKey.KeyID)
	if err != nil {
		return err
	}

	if count == 0 {
		log.Printf("🎉 Migration complete for tenant %s, key %s retired",
			tenantID, oldKey.KeyID)

		return s.repo.MarkKeyRetired(ctx, oldKey.KeyID)
	}

	return nil
}

func (s *TokenService) AutoRotateKeys(ctx context.Context) error {

	tenants, err := s.repo.GetAllTenants(ctx)
	if err != nil {
		return err
	}

	for _, tenantID := range tenants {

		key, err := s.keyManager.GetActiveKey(ctx, tenantID)
		if err != nil {
			continue
		}

		// 🔥 ROTATION POLICY (example: 90 days)
		// if time.Since(key.ActiveFrom) > 90*24*time.Hour {
		if time.Now().After(key.ActiveFrom.AddDate(0, 10, 0)) {
			log.Printf("🔐 Rotating key for tenant %s", tenantID)

			err := s.RotateKey(ctx, tenantID, "auto-rotation")
			if err != nil {
				log.Println("❌ Rotation failed:", err)
			}
		}
	}

	return nil
}

func (s *TokenService) EnsureInitialKey(ctx context.Context, tenantID string) error {

	_, err := s.keyManager.GetActiveKey(ctx, tenantID)
	if err == nil {
		return nil // already exists
	}

	// 🔐 create first key
	log.Printf("🔐 Creating initial key for tenant %s", tenantID)

	return s.RotateKey(ctx, tenantID, "bootstrap")
}
