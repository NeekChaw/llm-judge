#!/bin/bash

# Supabase数据库恢复脚本
# 使用方法: ./restore-database.sh <备份目录路径> [选项]

if [ $# -eq 0 ]; then
    echo "📋 Supabase数据库恢复工具"
    echo ""
    echo "使用方法:"
    echo "  ./restore-database.sh <备份目录> [选项]"
    echo ""
    echo "选项:"
    echo "  --clear          恢复前清空现有数据"
    echo "  --skip-existing  跳过已存在的记录"
    echo "  --tables t1,t2   仅恢复指定的表"
    echo ""
    echo "示例:"
    echo "  ./restore-database.sh ./backups/supabase-backup-2025-09-09T13-36-09"
    echo "  ./restore-database.sh ./backups/supabase-backup-2025-09-09T13-36-09 --clear"
    echo ""
    echo "📁 可用的备份:"
    find backups/ -name "supabase-backup-*" -type d 2>/dev/null | head -5
    echo ""
    exit 1
fi

BACKUP_DIR="$1"
shift # 移除第一个参数，剩下的作为选项传递

echo "🔄 开始Supabase数据库恢复..."
echo "📁 备份目录: $BACKUP_DIR"

# 检查备份目录
if [ ! -d "$BACKUP_DIR" ]; then
    echo "❌ 错误: 备份目录不存在: $BACKUP_DIR"
    
    # 如果是压缩包，尝试解压
    if [ -f "$BACKUP_DIR.tar.gz" ]; then
        echo "🗜️  发现压缩包，正在解压..."
        tar -xzf "$BACKUP_DIR.tar.gz"
        if [ $? -eq 0 ]; then
            echo "✅ 解压完成"
        else
            echo "❌ 解压失败"
            exit 1
        fi
    else
        echo "💡 提示: 检查备份路径是否正确"
        echo "📁 可用的备份:"
        find backups/ -name "supabase-backup-*" -type d 2>/dev/null | head -5
        exit 1
    fi
fi

# 检查manifest文件
if [ ! -f "$BACKUP_DIR/manifest.json" ]; then
    echo "❌ 错误: 找不到备份清单文件 (manifest.json)"
    echo "这可能不是一个有效的备份目录"
    exit 1
fi

# 显示备份信息
echo ""
echo "📋 备份信息:"
if command -v jq &> /dev/null; then
    cat "$BACKUP_DIR/manifest.json" | jq -r '"备份时间: " + .backup_timestamp'
    cat "$BACKUP_DIR/manifest.json" | jq -r '"数据库: " + .database_name'
    cat "$BACKUP_DIR/manifest.json" | jq -r '"表数量: " + (.tables | keys | length | tostring)'
else
    echo "   备份清单: $BACKUP_DIR/manifest.json"
fi

echo ""
echo "⚠️  警告: 此操作将修改数据库数据"
echo "建议在恢复前先备份当前数据库"
echo ""
read -p "是否继续恢复? (y/N): " confirm

if [[ ! $confirm =~ ^[Yy]$ ]]; then
    echo "🛑 恢复已取消"
    exit 0
fi

# 检查环境变量
if [ ! -f .env.local ]; then
    echo "❌ 错误: 找不到 .env.local 文件"
    echo "请确保环境变量文件存在"
    exit 1
fi

# 执行恢复
echo ""
echo "🚀 执行恢复脚本..."
npx tsx restore-supabase.ts "$BACKUP_DIR" "$@"

# 检查恢复结果
if [ $? -eq 0 ]; then
    echo ""
    echo "🎉 恢复完成！"
    echo ""
    echo "📄 恢复报告: $BACKUP_DIR/restore-report.json"
    echo ""
    echo "💡 建议:"
    echo "1. 验证恢复的数据是否正确"
    echo "2. 重启应用程序以确保缓存更新"
    echo "3. 检查应用程序功能是否正常"
else
    echo "❌ 恢复失败，请检查错误信息"
    exit 1
fi