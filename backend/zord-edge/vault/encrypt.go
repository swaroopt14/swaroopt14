package vault

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/base64"
	"errors"
	"io"
)

var encryptionKey []byte

func InitVaultKey(base64Key string) error {
	key, err := base64.StdEncoding.DecodeString(base64Key)
	if err != nil {
		return err
	}
	if len(key) != 32 {
		return errors.New("Vault Key must be 32 bytes")
	}
	encryptionKey = key
	return nil
}

func Encrypt(plaintext []byte) ([]byte, error) {
	block, err := aes.NewCipher(encryptionKey)
	if err != nil {
		return nil, err
	}
	aesGCM, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}
	nonce := make([]byte, aesGCM.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return nil, err
	}

	ciphertext := aesGCM.Seal(nil, nonce, plaintext, nil)

	return append(nonce, ciphertext...), nil
}
