package kafka

import (
	"log"
	"time"

	"github.com/IBM/sarama"
)

type Producer struct {
	producer sarama.AsyncProducer
}

func NewProducer(brokers []string) (*Producer, error) {
	config := sarama.NewConfig()

	config.Version = sarama.V2_8_0_0

	config.Producer.RequiredAcks = sarama.WaitForAll

	config.Producer.Idempotent = true
	config.Net.MaxOpenRequests = 1

	//Retry Settings
	config.Producer.Retry.Max = 10
	config.Producer.Retry.Backoff = 2 * time.Second

	//Batch Settings
	config.Producer.Flush.Bytes = 1_000_000 // 1MB batch
	config.Producer.Flush.Messages = 100
	config.Producer.Flush.Frequency = 5 * time.Millisecond

	// Compression reduces network overhead
	config.Producer.Compression = sarama.CompressionSnappy

	// Required for async producer
	config.Producer.Return.Successes = false
	config.Producer.Return.Errors = true

	var producer sarama.AsyncProducer
	var err error

	for i := 0; i < 30; i++ {
		producer, err = sarama.NewAsyncProducer(brokers, config)
		if err == nil {
			break
		}
		log.Printf("Failed to create Kafka async producer (attempt %d/30): %v. Retrying in 2s...", i+1, err)
		time.Sleep(2 * time.Second)
	}
	if err != nil {
		return nil, err
	}

	p := &Producer{producer: producer}

	//Handle asyn errors

	go func() {
		for err := range producer.Errors() {
			log.Printf("Kafka Asyn Errors:%v", err)
		}
	}()
	return p, nil
}

// Publish Logic
func (p *Producer) Close() error {

	if p == nil || p.producer == nil {
		return nil
	}

	// AsyncClose flushes pending messages before shutdown
	p.producer.AsyncClose()

	log.Println("Kafka producer shutdown initiated")

	return nil
}
