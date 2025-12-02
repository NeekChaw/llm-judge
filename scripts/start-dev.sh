#!/bin/bash

# AI评测平台开发环境启动脚本
# 自动加载环境变量并启动服务器（包含统一任务处理器）

echo "🚀 启动AI评测平台开发环境..."

# 检查.env.local文件是否存在
if [ ! -f .env.local ]; then
    echo "❌ .env.local文件不存在，请先创建配置文件"
    echo "💡 可以复制.env.example为.env.local并填入实际配置"
    exit 1
fi

# 加载环境变量
echo "📋 加载环境变量..."
export $(grep -v '^#' .env.local | xargs)

# 检查必要的环境变量
if [ -z "$NEXT_PUBLIC_SUPABASE_URL" ]; then
    echo "❌ NEXT_PUBLIC_SUPABASE_URL环境变量未设置"
    exit 1
fi

if [ -z "$NEXT_PUBLIC_SUPABASE_ANON_KEY" ]; then
    echo "❌ NEXT_PUBLIC_SUPABASE_ANON_KEY环境变量未设置"
    exit 1
fi

echo "✅ 环境变量加载完成"
echo "🌐 Supabase URL: $NEXT_PUBLIC_SUPABASE_URL"
echo "🔑 API密钥配置:"
echo "   SILICONFLOW_API_KEY: ${SILICONFLOW_API_KEY:+已配置}"
echo "   OPENAI_API_KEY: ${OPENAI_API_KEY:+已配置}"
echo "   ANTHROPIC_API_KEY: ${ANTHROPIC_API_KEY:+已配置}"
echo ""

# 启动开发服务器
echo "🚀 启动开发服务器（包含统一任务处理器）..."
npx tsx server.ts
