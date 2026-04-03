#!/bin/bash

echo "========================================="
echo "🔍 Testing End-to-End Tracing"
echo "========================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to test URL
test_url() {
    local url=$1
    local name=$2
    echo -n "Testing $name... "
    
    if curl -s -f "$url" > /dev/null 2>&1; then
        echo -e "${GREEN}✅ OK${NC}"
        return 0
    else
        echo -e "${RED}❌ FAILED${NC}"
        return 1
    fi
}

# Function to check OTEL Collector
check_otel_collector() {
    echo ""
    echo "🔧 Checking OpenTelemetry Collector:"
    echo "------------------------------------"
    
    if docker ps --format "table {{.Names}}" | grep -q "otel-collector"; then
        echo -e "OTEL Collector: ${GREEN}✅ RUNNING${NC}"
        
        # Test OTEL endpoints
        test_url "http://localhost:4317" "OTLP gRPC Endpoint"
        test_url "http://localhost:4318" "OTLP HTTP Endpoint"
        test_url "http://localhost:8888/metrics" "OTEL Collector Metrics"
        test_url "http://localhost:13133" "OTEL Health Check"
    else
        echo -e "OTEL Collector: ${RED}❌ NOT RUNNING${NC}"
        echo "Run: docker compose up -d"
        return 1
    fi
}

# Function to check Jaeger
check_jaeger() {
    echo ""
    echo "🔍 Checking Jaeger Tracing:"
    echo "---------------------------"
    
    if test_url "http://localhost:16686/api/services" "Jaeger API"; then
        echo "✅ Jaeger is ready to receive traces"
        
        # Check if any services are already sending traces
        services=$(curl -s "http://localhost:16686/api/services" | jq -r '.data[]' 2>/dev/null || echo "")
        if [ -n "$services" ]; then
            echo -e "${GREEN}📊 Services sending traces:${NC}"
            echo "$services" | while read -r service; do
                echo "  - $service"
            done
        else
            echo -e "${YELLOW}⚠️  No services sending traces yet${NC}"
        fi
    else
        echo -e "${RED}❌ Jaeger not accessible${NC}"
        return 1
    fi
}

# Function to show next steps
show_next_steps() {
    echo ""
    echo "🎯 Next Steps for Complete Tracing:"
    echo "-----------------------------------"
    echo ""
    echo "1. ${BLUE}Implement OTEL in Go Services:${NC}"
    echo "   - Add OpenTelemetry dependencies to go.mod"
    echo "   - Initialize tracing in main.go"
    echo "   - Add middleware for HTTP tracing"
    echo "   - Add manual spans for business logic"
    echo ""
    echo "2. ${BLUE}Add Trace Propagation:${NC}"
    echo "   - HTTP headers between services"
    echo "   - Kafka message headers"
    echo "   - Database operation context"
    echo ""
    echo "3. ${BLUE}Test End-to-End Flow:${NC}"
    echo "   - Make API request to zord-edge"
    echo "   - Follow trace through all services"
    echo "   - Verify trace_id consistency"
    echo ""
    echo "4. ${BLUE}Add Business Metrics:${NC}"
    echo "   - Custom span attributes"
    echo "   - Error tracking"
    echo "   - Performance metrics"
    echo ""
    echo "📖 See TRACING-IMPLEMENTATION.md for detailed code examples"
    echo ""
}

# Main execution
main() {
    check_otel_collector
    check_jaeger
    check_trace_implementation
    show_next_steps
    
    echo "========================================="
    echo "🎯 Tracing Test Complete!"
    echo "========================================="
}

# Run the tests
main