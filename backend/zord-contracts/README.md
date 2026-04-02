# Zord Contracts Service

## Overview
The Contracts & Evidence Service handles contract generation, evidence packaging, digital signing, and compliance reporting for the Zord Vault platform.

## Features
- Contract generation from templates
- Evidence packaging and archival
- Digital signing and verification
- Compliance reporting
- Template management
- Multi-format output (PDF, JSON, XML)

## Folder Structure
```
zord-contracts/
├── cmd/
│   └── main.go                          # Main entry point
├── internal/
│   ├── handlers/
│   │   ├── contract_handler.go          # Contract API handlers
│   │   ├── evidence_handler.go          # Evidence API handlers
│   │   └── download_handler.go          # Download handlers
│   ├── services/
│   │   ├── contract_generator.go        # Contract generation logic
│   │   ├── evidence_packager.go         # Evidence packaging logic
│   │   ├── signing_service.go           # Digital signing service
│   │   └── template_service.go          # Template management
│   ├── models/
│   │   ├── contract.go                  # Contract data models
│   │   ├── evidence_pack.go             # Evidence pack models
│   │   ├── signature.go                 # Digital signature models
│   │   └── template.go                  # Template models
│   ├── repository/
│   │   ├── contract_repo.go             # Contract data access
│   │   └── evidence_repo.go             # Evidence data access
│   ├── storage/
│   │   ├── contract_store.go            # Contract storage interface
│   │   └── evidence_store.go            # Evidence storage interface
│   └── config/
│       └── config.go                    # Configuration management
├── pkg/
│   ├── templates/
│   │   ├── payout_contract.tmpl         # Payout contract template
│   │   ├── evidence_pack.tmpl           # Evidence pack template
│   │   └── compliance_report.tmpl       # Compliance report template
│   ├── generators/
│   │   ├── pdf_generator.go             # PDF document generator
│   │   ├── json_generator.go            # JSON document generator
│   │   └── xml_generator.go             # XML document generator
│   └── validators/
│       ├── contract_validator.go        # Contract validation
│       └── evidence_validator.go        # Evidence validation
├── templates/
│   ├── contracts/                       # Contract templates
│   └── evidence/                        # Evidence templates
├── migrations/                          # Database migrations
├── tests/                               # Test files
├── deployments/
│   ├── Dockerfile                       # Container definition
│   ├── docker-compose.yml               # Local deployment
│   └── k8s/                             # Kubernetes manifests
├── go.mod                               # Go module definition
└── README.md                            # This file
```

## API Endpoints
- `POST /contracts` - Generate new contract
- `GET /contracts/{id}` - Retrieve contract
- `POST /evidence` - Package evidence
- `GET /evidence/{id}` - Retrieve evidence pack
- `GET /download/{id}` - Download contract/evidence

## Dependencies
- PostgreSQL for metadata storage
- S3-compatible storage for documents
- Digital signing service
- Template engine

## Getting Started
1. Install dependencies: `go mod tidy`
2. Configure environment variables
3. Run database migrations
4. Start the service: `go run cmd/main.go`