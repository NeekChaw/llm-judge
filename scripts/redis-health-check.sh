#!/bin/bash
# Redis健康检查脚本
# 建议添加到cron: */5 * * * * /path/to/redis-health-check.sh

set -e

API_URL="${API_URL:-http://localhost:3000}"
REDIS_PASSWORD="${REDIS_PASSWORD:-ai_benchmark_redis_2025}"
LOG_FILE="${LOG_FILE:-/tmp/redis-health.log}"

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

# 检查Redis连接
check_redis_connection() {
    log "检查Redis连接..."

    # Docker方式
    if command -v docker-compose &> /dev/null; then
        if docker-compose exec -T redis redis-cli -a "$REDIS_PASSWORD" ping > /dev/null 2>&1; then
            log "✅ Redis连接正常 (Docker)"
            return 0
        fi
    fi

    # 本地方式
    if command -v redis-cli &> /dev/null; then
        if redis-cli -a "$REDIS_PASSWORD" ping > /dev/null 2>&1; then
            log "✅ Redis连接正常 (Local)"
            return 0
        fi
    fi

    log "❌ Redis连接失败！"
    return 1
}

# 检查处理器状态
check_processor_status() {
    log "检查处理器状态..."

    STATUS=$(curl -s "$API_URL/api/processor?action=status" 2>/dev/null || echo "{}")
    MODE=$(echo "$STATUS" | jq -r '.mode // "unknown"')
    RUNNING=$(echo "$STATUS" | jq -r '.running // false')

    log "处理器模式: $MODE"
    log "运行状态: $RUNNING"

    if [ "$RUNNING" != "true" ]; then
        log "⚠️ 处理器未运行！"
        return 1
    fi

    log "✅ 处理器运行正常"
    return 0
}

# 检查队列积压
check_queue_backlog() {
    log "检查队列积压..."

    QUEUE_STATS=$(curl -s "$API_URL/api/processor?action=queue-stats" 2>/dev/null || echo "{}")
    WAITING=$(echo "$QUEUE_STATS" | jq -r '.["evaluation-subtasks"].waiting // 0')

    log "等待处理任务数: $WAITING"

    if [ "$WAITING" -gt 100 ]; then
        log "⚠️ 队列积压过多: $WAITING 个任务等待处理"
        # 这里可以发送告警
        # curl -X POST your-webhook-url -d "{\"alert\": \"Queue backlog: $WAITING\"}"
        return 1
    fi

    if [ "$WAITING" -gt 50 ]; then
        log "⚠️ 队列积压较多: $WAITING"
    else
        log "✅ 队列积压正常: $WAITING"
    fi

    return 0
}

# 检查Redis内存使用
check_redis_memory() {
    log "检查Redis内存使用..."

    # Docker方式
    if command -v docker-compose &> /dev/null; then
        MEMORY_INFO=$(docker-compose exec -T redis redis-cli -a "$REDIS_PASSWORD" info memory 2>/dev/null || echo "")
        if [ -n "$MEMORY_INFO" ]; then
            USED=$(echo "$MEMORY_INFO" | grep used_memory_human | cut -d: -f2 | tr -d '\r')
            MAX=$(echo "$MEMORY_INFO" | grep maxmemory_human | cut -d: -f2 | tr -d '\r')
            log "Redis内存使用: $USED / $MAX"
            return 0
        fi
    fi

    # 本地方式
    if command -v redis-cli &> /dev/null; then
        USED=$(redis-cli -a "$REDIS_PASSWORD" info memory 2>/dev/null | grep used_memory_human | cut -d: -f2)
        log "Redis内存使用: $USED"
        return 0
    fi

    log "⚠️ 无法获取Redis内存信息"
    return 1
}

# 主检查流程
main() {
    log "=========================================="
    log "🏥 Redis健康检查开始"
    log "=========================================="

    ERRORS=0

    if ! check_redis_connection; then
        ERRORS=$((ERRORS + 1))
    fi

    if ! check_processor_status; then
        ERRORS=$((ERRORS + 1))
    fi

    check_queue_backlog || true  # 队列积压警告但不计入错误

    check_redis_memory || true  # 内存检查失败不计入错误

    log "=========================================="
    if [ $ERRORS -eq 0 ]; then
        log "✅ 健康检查通过 (0 errors)"
    else
        log "❌ 健康检查发现 $ERRORS 个问题"
    fi
    log "=========================================="

    return $ERRORS
}

# 执行检查
main
exit $?
