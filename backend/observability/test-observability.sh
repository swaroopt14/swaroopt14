#!/bin/bash

echo "========================================="
echo "🧪 Testing Zord Observability Platform"
echo "========================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
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

# Function to test service health
test_service_health() {
    echo ""
    echo "🏥 Testing Service Health:"
    echo "-------------------------"
    
    test_url "http://localhost:9090/-/healthy" "Prometheus Health"
    test_url "http://localhost:3001/api/health" "Grafana Health"
    test_url "http://localhost:16686/api/services" "Jaeger Health"
}

# Function to test metrics endpoints
test_metrics() {
    echo ""
    echo "📊 Testing Metrics Collection:"
    echo "------------------------------"
    
    test_url "http://localhost:9090/api/v1/targets" "Prometheus Targets"
    test_url "http://localhost:9090/api/v1/query?query=up" "Prometheus Query"
}

# Function to test Zord services (if running)
test_zord_services() {
    echo ""
    echo "🎯 Testing Zord Service Integration:"
    echo "-----------------------------------"
    
    # Test zord-edge if running
    if curl -s -f "http://localhost:8080/v1/health" > /dev/null 2>&1; then
        echo -e "Zord Edge: ${GREEN}✅ RUNNING${NC}"
        test_url "http://localhost:8080/metrics" "Zord Edge Metrics"
    else
        echo -e "Zord Edge: ${YELLOW}⚠️  NOT RUNNING${NC} (expected if not started)"
    fi
    
    # Test zord-vault-journal if running
    if curl -s -f "http://localhost:8081/health" > /dev/null 2>&1; then
        echo -e "Zord Vault Journal: ${GREEN}✅ RUNNING${NC}"
        test_url "http://localhost:8081/metrics" "Zord Vault Journal Metrics"
    else
        echo -e "Zord Vault Journal: ${YELLOW}⚠️  NOT RUNNING${NC} (expected if not started)"
    fi
    
    # Test zord-relay if running
    if curl -s -f "http://localhost:8082/health" > /dev/null 2>&1; then
        echo -e "Zord Relay: ${GREEN}✅ RUNNING${NC}"
        test_url "http://localhost:8082/metrics" "Zord Relay Metrics"
    else
        echo -e "Zord Relay: ${YELLOW}⚠️  NOT RUNNING${NC} (expected if not started)"
    fi
}

# Function to check Docker containers
check_containers() {
    echo ""
    echo "🐳 Checking Docker Containers:"
    echo "------------------------------"
    
    if ! docker ps > /dev/null 2>&1; then
        echo -e "${RED}❌ Docker is not running!${NC}"
        echo "Please start Docker Desktop and try again."
        exit 1
    fi
    
    # Check observability containers
    containers=("prometheus" "grafana" "jaeger")
    
    for container in "${containers[@]}"; do
        if docker ps --format "table {{.Names}}" | grep -q "$container"; then
            echo -e "$container: ${GREEN}✅ RUNNING${NC}"
        else
            echo -e "$container: ${RED}❌ NOT RUNNING${NC}"
        fi
    done
}

# Function to show access URLs
show_urls() {
    echo ""
    echo "🌐 Access URLs:"
    echo "---------------"
    echo "📊 Prometheus: http://localhost:9090"
    echo "📈 Grafana:    http://localhost:3001 (admin/admin)"
    echo "🔍 Jaeger:     http://localhost:16686"
    echo ""
}

# Main execution
main() {
    check_containers
    test_service_health
    test_metrics
    test_zord_services
    show_urls
    
    echo "========================================="
    echo "🎯 Test Complete!"
    echo "========================================="
    echo ""
    echo "Next steps:"
    echo "1. Open the URLs above in your browser"
    echo "2. Check Prometheus targets: http://localhost:9090/targets"
    echo "3. View Grafana dashboards: http://localhost:3001"
    echo "4. Start Zord services to see full integration"
    echo ""
}

# Run the tests
main