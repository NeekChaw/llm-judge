#!/bin/bash

# Supabase数据库备份脚本
# 使用方法: ./backup-database.sh

echo "🗄️  开始Supabase数据库备份..."

# 检查环境变量
if [ ! -f .env.local ]; then
    echo "❌ 错误: 找不到 .env.local 文件"
    echo "请确保环境变量文件存在"
    exit 1
fi

# 检查Node.js和npm是否可用
if ! command -v node &> /dev/null; then
    echo "❌ 错误: Node.js 未安装"
    exit 1
fi

if ! command -v npx &> /dev/null; then
    echo "❌ 错误: npx 不可用"
    exit 1
fi

# 创建备份目录
mkdir -p backups

# 执行备份
echo "🚀 执行备份脚本..."
npx tsx backup-supabase.ts

# 检查备份结果
if [ $? -eq 0 ]; then
    echo ""
    echo "🎉 备份完成！"
    echo ""
    echo "📁 备份文件位置:"
    ls -la backups/supabase-backup-*
    ls -la supabase-backup-*.tar.gz 2>/dev/null || echo "   压缩包创建可能失败，请检查备份目录"
    echo ""
    echo "💡 使用说明:"
    echo "1. 备份文件包含完整的数据库结构和数据"
    echo "2. 使用 ./restore-database.sh 恢复备份"
    echo "3. 备份压缩包可以安全地移动到其他位置保存"
else
    echo "❌ 备份失败，请检查错误信息"
    exit 1
fi