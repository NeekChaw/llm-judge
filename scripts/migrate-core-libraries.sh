#!/bin/bash

# 批量迁移核心库文件到 supabase 单例
# 阶段 2.1 快速执行脚本

set -e

echo "🚀 阶段 2.1: 迁移核心库文件到 supabase 单例"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# 定义目标文件（按优先级排序）
TARGETS=(
  "src/lib/subtask-generator.ts"
  "src/lib/evaluator-engine.ts"
)

echo "📋 计划迁移的文件（2个）:"
for file in "${TARGETS[@]}"; do
  if [ -f "$file" ]; then
    count=$(grep -c "createClient()" "$file" || echo 0)
    echo "  ✅ $file ($count 处)"
  else
    echo "  ❌ $file (文件不存在)"
  fi
done

echo ""
read -p "🤔 确认要批量迁移这些文件吗？(y/N): " -n 1 -r
echo

if [[ ! $REPLY =~ ^[Yy]$ ]]; then
  echo "❌ 取消批量迁移"
  exit 0
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# 执行迁移
MIGRATED=0
FAILED=0

for file in "${TARGETS[@]}"; do
  echo ""
  echo "🔄 正在迁移: $file"
  echo "────────────────────────────────────────"

  if [ ! -f "$file" ]; then
    echo "  ⚠️  跳过 (文件不存在)"
    FAILED=$((FAILED + 1))
    continue
  fi

  # 执行迁移
  if ./scripts/migrate-to-singleton.sh "$file" <<< "y"; then
    echo "  ✅ 迁移成功"
    MIGRATED=$((MIGRATED + 1))
  else
    echo "  ❌ 迁移失败"
    FAILED=$((FAILED + 1))
  fi
done

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📊 迁移结果:"
echo "  ✅ 成功: $MIGRATED"
echo "  ❌ 失败: $FAILED"
echo ""

if [ $MIGRATED -eq 0 ]; then
  echo "❌ 没有文件被成功迁移"
  exit 1
fi

# 显示下一步
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ 批量迁移完成！"
echo ""
echo "📋 下一步操作:"
echo ""
echo "1. 查看所有变更:"
echo "   git diff"
echo ""
echo "2. 测试编译:"
echo "   npm run build"
echo ""
echo "3. 运行测试:"
echo "   npm run test:api"
echo ""
echo "4. 手动功能测试:"
echo "   - 创建新任务"
echo "   - 验证子任务生成"
echo "   - 运行评分器"
echo ""
echo "5. 如果测试通过，提交更改:"
echo "   git add ${TARGETS[*]}"
echo "   git commit -m 'refactor: Migrate core libraries to supabase singleton (phase 2.1)'"
echo ""
echo "6. 如果测试失败，回滚:"
echo "   git checkout -- ${TARGETS[*]}"
echo ""
