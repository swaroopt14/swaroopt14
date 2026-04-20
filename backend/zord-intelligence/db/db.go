package db

// Why package "db"?
// All files in the db/ folder have "package db"
// main.go imports it as:
//   import "github.com/zord/zord-intelligence/db"
//   pool := db.Connect(cfg)

import (
	"context"
	_ "embed"
	"log"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/zord/zord-intelligence/config"
	"time"
)

//go:embed init.sql
var schemaSQL string

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

	// pgxpool.ParseConfig allows us to define pool size and boundaries
	pgxCfg, err := pgxpool.ParseConfig(cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("db: failed to parse database connection string: %v", err)
	}

	// ── Phase 7 Fix: Pool Limits ──────────────────────────────
	// Explicit caps prevent queue exhaustion
	pgxCfg.MaxConns = 50
	pgxCfg.MinConns = 5
	pgxCfg.MaxConnLifetime = 1 * time.Hour
	pgxCfg.HealthCheckPeriod = 1 * time.Minute

	pool, err := pgxpool.NewWithConfig(ctx, pgxCfg)

	if err != nil {
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

// EnsureSchema applies the intelligence schema on startup so Kubernetes
// deployments do not rely on external SQL bootstrap steps.
func EnsureSchema(ctx context.Context, pool *pgxpool.Pool) {
	if ctx == nil {
		ctx = context.Background()
	}
	if _, err := pool.Exec(ctx, schemaSQL); err != nil {
		log.Fatalf("db: failed to apply intelligence schema: %v", err)
	}
	log.Println("db: intelligence schema ensured")
}
