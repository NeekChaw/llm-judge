#!/bin/bash
# Redis任务队列模式切换脚本
# 使用方法: ./switch-processor-mode.sh [redis|script|status]

set -e

MODE=$1
API_URL="${API_URL:-http://localhost:3000}"

# 颜色输出
RED='\033[0:31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

if [ -z "$MODE" ]; then
    echo "用法: $0 [redis|script|status]"
    echo ""
    echo "  redis   - 切换到Redis队列模式（实时处理）"
    echo "  script  - 切换到Script轮询模式（稳定fallback）"
    echo "  status  - 查看当前状态"
    echo ""
    exit 1
fi

if [ "$MODE" == "status" ]; then
    echo "📊 查询处理器状态..."
    curl -s "$API_URL/api/processor?action=status" | jq '.'
    exit 0
fi

if [ "$MODE" == "redis" ]; then
    echo -e "${YELLOW}🔄 切换到Redis模式...${NC}"

    # 检查Redis可用性
    echo "1️⃣ 检查Redis可用性..."
    AVAILABILITY=$(curl -s "$API_URL/api/processor?action=availability")
    REDIS_AVAILABLE=$(echo "$AVAILABILITY" | jq -r '.redis')

    if [ "$REDIS_AVAILABLE" != "true" ]; then
        echo -e "${RED}❌ Redis不可用！${NC}"
        echo "请先启动Redis服务："
        echo "  Docker: docker-compose up -d redis"
        echo "  本地: redis-server --requirepass ai_benchmark_redis_2025"
        exit 1
    fi

    echo -e "${GREEN}✅ Redis可用${NC}"

    # 切换模式
    echo "2️⃣ 切换处理器模式..."
    RESPONSE=$(curl -s -X POST "$API_URL/api/processor" \
      -H "Content-Type: application/json" \
      -d '{"action": "switch", "mode": "redis"}')

    echo "$RESPONSE" | jq '.'

    echo -e "${GREEN}✅ 已切换到Redis模式${NC}"

elif [ "$MODE" == "script" ]; then
    echo -e "${YELLOW}🔄 回滚到Script模式...${NC}"

    RESPONSE=$(curl -s -X POST "$API_URL/api/processor" \
      -H "Content-Type: application/json" \
      -d '{"action": "switch", "mode": "script"}')

    echo "$RESPONSE" | jq '.'

    echo -e "${GREEN}✅ 已回滚到Script模式${NC}"

else
    echo -e "${RED}❌ 无效的模式: $MODE${NC}"
    echo "请使用: redis, script, 或 status"
    exit 1
fi

# 显示当前状态
echo ""
echo "📊 当前处理器状态:"
sleep 1
curl -s "$API_URL/api/processor?action=status" | jq '{
  mode: .mode,
  running: .running,
  workers: .workers
}'
