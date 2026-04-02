package model

import "time"

type AckMessage struct {
	EnvelopeId string
	ReceivedAt time.Time
	ObjectRef  string
}
