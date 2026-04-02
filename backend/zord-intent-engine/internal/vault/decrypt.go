package vault

import (
	"crypto/aes"
	"crypto/cipher"
	"encoding/base64"
	"errors"
)

var encryptionKey []byte

func InitVaultKey(base64Key string) error {
	key, err := base64.StdEncoding.DecodeString(base64Key)
	if err != nil {
		return err
	}
	if len(key) != 32 {
		return errors.New("vault key must be 32 bytes")
	}
	encryptionKey = key
	return nil
}

func DecryptPayload(ciphertext []byte) ([]byte, error) {
	block, err := aes.NewCipher(encryptionKey)
	if err != nil {
		return nil, err
	}
	aesGCM, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}
	nonceSize := aesGCM.NonceSize()

	if len(ciphertext) < nonceSize {
		return nil, errors.New("ciphertext too short")
	}

	nonce := ciphertext[:nonceSize]
	encryptedData := ciphertext[nonceSize:]

	nonce = ciphertext[:nonceSize]
	encryptedData = ciphertext[nonceSize:]

	plaintext, err := aesGCM.Open(nil, nonce, encryptedData, nil)
	if err != nil {
		return nil, err
	}

	return plaintext, nil
}
