#!/bin/bash

# 阶段二迁移脚本：从 createClient() 迁移到 supabase 单例
# 用法: ./scripts/migrate-to-singleton.sh <file_path>

set -e

FILE=$1

if [ -z "$FILE" ]; then
  echo "❌ 用法: $0 <file_path>"
  echo "示例: $0 src/lib/subtask-generator.ts"
  exit 1
fi

if [ ! -f "$FILE" ]; then
  echo "❌ 文件不存在: $FILE"
  exit 1
fi

echo "🔧 开始迁移: $FILE"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# 步骤0: 备份
BACKUP="${FILE}.backup.$(date +%Y%m%d_%H%M%S)"
cp "$FILE" "$BACKUP"
echo "✅ 备份已创建: $BACKUP"
echo ""

# 步骤1: 检查当前状态
echo "📊 当前状态:"
echo "  导入语句:"
grep "import.*createClient\|import.*supabase" "$FILE" | sed 's/^/    /'
echo ""
echo "  createClient() 调用次数: $(grep -c 'createClient()' "$FILE" || echo 0)"
echo ""

# 步骤2: 询问确认
read -p "🤔 确认要迁移这个文件吗？(y/N): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
  echo "❌ 取消迁移"
  rm "$BACKUP"
  exit 0
fi

# 步骤3: 执行迁移
echo ""
echo "🔄 执行迁移..."

# 3.1 修改导入语句
sed -i "s/import { createClient } from '\(@\/lib\/supabase\)'/import { supabase } from '\1'/g" "$FILE"
sed -i 's/import { createClient } from "\(@\/lib\/supabase\)"/import { supabase } from "\1"/g' "$FILE"
echo "  ✅ 导入语句已更新"

# 3.2 删除本地变量声明
sed -i 's/const supabase = createClient();/\/\/ Using global supabase singleton/g' "$FILE"
sed -i 's/  const supabase = createClient();/  \/\/ Using global supabase singleton/g' "$FILE"
echo "  ✅ 本地变量声明已替换为注释"

# 步骤4: 验证结果
echo ""
echo "📋 迁移结果验证:"

# 检查是否还有 createClient()
if grep -q 'createClient()' "$FILE"; then
  echo "  ⚠️  仍有 createClient() 调用（可能在注释中）:"
  grep -n 'createClient()' "$FILE" | sed 's/^/    /'
else
  echo "  ✅ 没有剩余的 createClient() 调用"
fi

# 检查导入是否正确
if grep -q "import { supabase } from" "$FILE"; then
  echo "  ✅ 导入语句已更新为单例"
else
  echo "  ❌ 导入语句更新失败"
fi

# 步骤5: 显示变更
echo ""
echo "📝 代码变更预览:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
git diff --no-index "$BACKUP" "$FILE" | head -50 || diff -u "$BACKUP" "$FILE" | head -50

# 步骤6: 下一步提示
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ 迁移完成！"
echo ""
echo "📋 下一步操作:"
echo "  1. 检查代码: git diff $FILE"
echo "  2. 测试编译: npm run build"
echo "  3. 运行测试: npm run test:api"
echo "  4. 如果满意: git add $FILE && git commit -m 'refactor: Migrate $FILE to supabase singleton'"
echo "  5. 如果有问题: cp $BACKUP $FILE"
echo ""
echo "💡 提示: 备份文件将在确认提交后自动删除"
