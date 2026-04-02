# Build stage
FROM golang:1.25.0-alpine AS builder

# ca-certificates needed for HTTPS calls to Service 3 and PSP
RUN apk add --no-cache git ca-certificates

WORKDIR /src

# Download dependencies first (layer cached unless go.mod/go.sum change)
COPY go.mod go.sum ./
RUN go mod download

COPY . .

RUN go mod tidy

ARG TARGETOS=linux
ARG TARGETARCH=amd64
RUN CGO_ENABLED=0 GOOS=$TARGETOS GOARCH=$TARGETARCH \
    go build -trimpath -ldflags "-s -w" -o /out/zord-relay ./cmd/main.go

# Final stage — minimal scratch image
# No shell, no package manager, no attack surface.
FROM scratch

WORKDIR /app

COPY --from=builder /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/
COPY --from=builder /out/zord-relay /app/zord-relay

ENV SSL_CERT_FILE=/etc/ssl/certs/ca-certificates.crt

# Run as non-root (65532 = nobody in distroless convention)
USER 65532:65532

# Health check port
EXPOSE 8082

ENTRYPOINT ["/app/zord-relay"]
