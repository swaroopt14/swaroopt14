module github.com/zord/zord-intelligence

go 1.24.0

require (
	// chi → HTTP router (same as your team uses in other services)
	github.com/go-chi/chi/v5 v5.2.5

	// google/uuid → generate unique IDs like "act_01J..." for action contracts
	github.com/google/uuid v1.6.0

	// pgx → PostgreSQL driver (same as zord-relay uses)
	github.com/jackc/pgx/v5 v5.8.0

	// kafka-go → read/write Kafka messages
	github.com/segmentio/kafka-go v0.4.50
)

require (
	github.com/jackc/pgpassfile v1.0.0 // indirect
	github.com/jackc/pgservicefile v0.0.0-20240606120523-5a60cdf6a761 // indirect
	github.com/jackc/puddle/v2 v2.2.2 // indirect
	github.com/joho/godotenv v1.5.1
	github.com/klauspost/compress v1.15.9 // indirect
	github.com/pierrec/lz4/v4 v4.1.15 // indirect
	golang.org/x/sync v0.17.0 // indirect
	golang.org/x/text v0.29.0 // indirect
)
