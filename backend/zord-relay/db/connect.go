package db

import (
	"database/sql"
	"log"
	"time"

	_ "github.com/lib/pq"
)

// Connect opens a PostgreSQL connection pool and retries until the DB
// is reachable or the retry budget is exhausted.
// maxOpen and maxIdle should be sized to match the total worker count
// across all loops — not arbitrarily large.
func Connect(dbURL string, maxOpen, maxIdle int) *sql.DB {
	conn, err := sql.Open("postgres", dbURL)
	if err != nil {
		log.Fatalf("db: failed to open connection: %v", err)
	}

	conn.SetMaxOpenConns(maxOpen)
	conn.SetMaxIdleConns(maxIdle)
	conn.SetConnMaxLifetime(5 * time.Minute)
	conn.SetConnMaxIdleTime(2 * time.Minute)

	for attempt := 1; attempt <= 30; attempt++ {
		if err = conn.Ping(); err == nil {
			log.Printf("db: connected (attempt %d)", attempt)
			return conn
		}
		log.Printf("db: ping failed (attempt %d/30): %v — retrying in 2s", attempt, err)
		time.Sleep(2 * time.Second)
	}

	log.Fatalf("db: failed to connect after 30 attempts: %v", err)
	return nil
}
