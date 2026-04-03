package db

// Why package "db"?
// All files in the db/ folder have "package db"
// main.go imports it as:
//   import "github.com/zord/zord-intelligence/db"
//   pool := db.Connect(cfg)

import (
	"context"
	"log"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/zord/zord-intelligence/config"
)

// Connect opens a PostgreSQL connection pool and returns it.
//
// A "pool" means Go keeps multiple DB connections open and reuses them.
// Instead of opening a new connection for every query (slow),
// your code borrows one from the pool, uses it, returns it.
//
// Call this once in main.go:
//
//	pool := db.Connect(cfg)
//	defer pool.Close()   ← close pool when service shuts down
//
// Then pass pool to your repositories:
//
//	projRepo := persistence.NewProjectionRepo(pool)
func Connect(cfg *config.Config) *pgxpool.Pool {

	// context.Background() is Go's way of saying "no deadline, no cancellation"
	// We use it here because this is startup code — we want it to run fully
	ctx := context.Background()

	// pgxpool.New() parses the DATABASE_URL and creates the connection pool
	// It does NOT open connections yet — connections open lazily when first used
	pool, err := pgxpool.New(ctx, cfg.DatabaseURL)

	// err is the second return value — Go always returns errors as values
	// If err != nil, something went wrong
	if err != nil {
		// log.Fatalf prints the error and crashes the program immediately
		// At startup, if we can't reach the DB, there is no point running
		log.Fatalf("db: failed to create connection pool: %v", err)
	}

	// Ping sends a test query to verify the connection actually works
	// Catches problems like: wrong password, DB not running, network issue
	if err := pool.Ping(ctx); err != nil {
		log.Fatalf("db: failed to ping database: %v", err)
	}

	log.Println("db: connected to PostgreSQL successfully")

	// Return the pool — main.go will pass this to all repositories
	return pool
}
