package utils

import (
	"go.uber.org/zap"
	"go.uber.org/zap/zapcore"
)

// Logger is the global structured logger for zord-relay.
// All log lines must include at minimum: trace_id, tenant_id, dispatch_id.
// PII must never appear in any log line at any level.
var Logger *zap.Logger

func InitLogger(serviceName string) {
	cfg := zap.NewProductionConfig()
	cfg.EncoderConfig.TimeKey = "ts"
	cfg.EncoderConfig.EncodeTime = zapcore.ISO8601TimeEncoder
	cfg.InitialFields = map[string]interface{}{
		"service": serviceName,
	}

	var err error
	Logger, err = cfg.Build(zap.AddCallerSkip(0))
	if err != nil {
		panic("failed to init logger: " + err.Error())
	}
}

func SyncLogger() {
	if Logger != nil {
		_ = Logger.Sync()
	}
}
