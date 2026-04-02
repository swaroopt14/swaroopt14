package config

import (
	"database/sql"
	"fmt"
	"log"
	"os"
	"time"

	"zord-edge/db"

	"github.com/joho/godotenv"
	_ "github.com/lib/pq"
)

type Config struct {
	VaultKey string
}

func InitDB() {
	var err error
	_ = godotenv.Load()
	dsn := fmt.Sprintf("user=%s password=%s host=%s port=%s dbname=%s sslmode=%s",
		os.Getenv("DB_USER"),     // Database username
		os.Getenv("DB_PASSWORD"), // Database password
		os.Getenv("DB_HOST"),     // Database host (e.g., localhost, postgres container)
		os.Getenv("DB_PORT"),     // Database port (default: 5432)
		os.Getenv("DB_NAME"),     // Database name
		os.Getenv("DB_SSLMODE"),  // SSL mode (disable for local development)
	)
	db.DB, err = sql.Open("postgres", dsn)
	if err != nil {
		log.Fatalf("Database configuration failed: %v", err)
	}

	maxRetries := 10
	retryDelay := 1 * time.Second

	for i := 0; i < maxRetries; i++ {
		err = db.DB.Ping()
		if err == nil {
			log.Println("Database connection established successfully")
			break
		}

		if i < maxRetries-1 {
			log.Printf("Database Ping Error (attempt %d/%d): %v - retrying in %v", i+1, maxRetries, err, retryDelay)
			time.Sleep(retryDelay)
			retryDelay *= 2 // Exponential backoff
		} else {
			log.Fatalf("Database Ping Error after %d attempts: %v", maxRetries, err)
		}
	}
	db.DB.SetMaxOpenConns(1000)
	db.DB.SetMaxIdleConns(500)
	db.DB.SetConnMaxLifetime(5 * time.Minute)
}

func LoadConfig() *Config {
	return &Config{
		VaultKey: os.Getenv("ZORD_VAULT_KEY"),
	}
}
