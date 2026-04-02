package config

import (
	"encoding/base64"
	"fmt"
	"log"
	"os"
)

type Config struct {
	DBURL     string
	MasterKey []byte // ✅ decoded raw key bytes
}

func Load() *Config {
	host := os.Getenv("DB_HOST")
	port := os.Getenv("DB_PORT")
	user := os.Getenv("DB_USER")
	pass := os.Getenv("DB_PASSWORD")
	name := os.Getenv("DB_NAME")
	ssl := os.Getenv("DB_SSLMODE")

	if port == "" {
		port = "5432"
	}
	if ssl == "" {
		ssl = "disable"
	}

	if host == "" || user == "" || name == "" {
		log.Fatal("❌ DB config missing: DB_HOST / DB_USER / DB_NAME must be set")
	}

	dbURL := fmt.Sprintf(
		"postgres://%s:%s@%s:%s/%s?sslmode=%s",
		user, pass, host, port, name, ssl,
	)

	// 🔐 Load and decode MASTER_KEY
	masterKeyB64 := os.Getenv("MASTER_KEY")
	if masterKeyB64 == "" {
		log.Fatal("❌ MASTER_KEY not set")
	}

	masterKey, err := base64.StdEncoding.DecodeString(masterKeyB64)
	if err != nil {
		log.Fatal("❌ MASTER_KEY is not valid base64:", err)
	}

	if len(masterKey) != 32 {
		log.Fatalf("❌ MASTER_KEY must decode to 32 bytes, got %d bytes", len(masterKey))
	}

	return &Config{
		DBURL:     dbURL,
		MasterKey: masterKey,
	}
}
