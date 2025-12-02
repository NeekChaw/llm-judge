#!/bin/bash

# 验证单例迁移的正确性
# 用法: ./scripts/verify-singleton-migration.sh

echo "🔍 验证单例迁移状态"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# 统计总体情况
echo "📊 整体迁移进度:"
echo ""

TOTAL_FILES=$(find src -name "*.ts" -o -name "*.tsx" | wc -l)
FILES_WITH_CREATE=$(find src -name "*.ts" -o -name "*.tsx" -exec grep -l "createClient()" {} \; 2>/dev/null | wc -l)
FILES_WITH_SINGLETON=$(find src -name "*.ts" -o -name "*.tsx" -exec grep -l "import { supabase } from" {} \; 2>/dev/null | wc -l)

echo "  总文件数: $TOTAL_FILES"
echo "  仍在使用 createClient(): $FILES_WITH_CREATE"
echo "  已使用 supabase 单例: $FILES_WITH_SINGLETON"
echo ""

# 计算迁移进度
TOTAL_DB_FILES=$((FILES_WITH_CREATE + FILES_WITH_SINGLETON))
if [ $TOTAL_DB_FILES -gt 0 ]; then
  MIGRATION_PERCENTAGE=$((FILES_WITH_SINGLETON * 100 / TOTAL_DB_FILES))
  echo "  迁移进度: ${MIGRATION_PERCENTAGE}%"
else
  echo "  迁移进度: N/A (无数据库文件)"
fi
echo ""

# 显示高频文件状态
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🎯 核心库文件状态:"
echo ""

check_file() {
  local file=$1
  local name=$(basename "$file")

  if [ ! -f "$file" ]; then
    echo "  ❓ $name - 文件不存在"
    return
  fi

  if grep -q "import { supabase } from" "$file"; then
    echo "  ✅ $name - 已迁移到单例"
  elif grep -q "createClient()" "$file"; then
    local count=$(grep -c "createClient()" "$file")
    echo "  ⚠️  $name - 仍在使用 createClient() ($count 次)"
  else
    echo "  ➖ $name - 未使用数据库"
  fi
}

# 检查核心文件
check_file "src/lib/subtask-generator.ts"
check_file "src/lib/evaluator-engine.ts"
check_file "src/lib/worker.ts"
check_file "src/lib/aggregation.ts"
check_file "src/lib/scoring-engine.ts"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📁 仍需迁移的文件列表:"
echo ""

UNMIGRATED=$(find src/lib -name "*.ts" -exec grep -l "const supabase = createClient()" {} \; 2>/dev/null)

if [ -z "$UNMIGRATED" ]; then
  echo "  🎉 所有核心库文件已迁移！"
else
  echo "$UNMIGRATED" | while read file; do
    count=$(grep -c "const supabase = createClient()" "$file")
    echo "  📄 $file ($count 处)"
  done
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "💡 建议:"
echo ""

if [ $FILES_WITH_CREATE -gt 10 ]; then
  echo "  阶段二迁移建议："
  echo "  1. 先迁移核心库文件（3个）"
  echo "  2. 再迁移 API 路由（58个）"
  echo "  3. 使用: ./scripts/migrate-to-singleton.sh <文件路径>"
elif [ $FILES_WITH_CREATE -gt 0 ]; then
  echo "  仅剩少量文件，可以逐个手动迁移"
else
  echo "  🎉 所有文件已迁移完成！"
fi

echo ""
