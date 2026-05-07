"""
Kafka connectivity health check.
Exits 0 if the broker is reachable, 1 otherwise.
Used by Docker HEALTHCHECK instead of the shallow import check.
"""
import os
import sys

from confluent_kafka.admin import AdminClient

brokers = os.getenv("KAFKA_BROKERS", "localhost:9092")
try:
    client = AdminClient({
        "bootstrap.servers": brokers,
        "socket.timeout.ms": 5000,
        "api.version.request.timeout.ms": 5000,
    })
    meta = client.list_topics(timeout=5)
    if meta is not None:
        print("ok")
        sys.exit(0)
    sys.exit(1)
except Exception as exc:
    print(f"unhealthy: {exc}", file=sys.stderr)
    sys.exit(1)
