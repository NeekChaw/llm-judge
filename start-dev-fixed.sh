#!/bin/bash

# AI评测平台开发环境启动脚本 - 修复版本
# 确保Next.js和任务处理器都能正常启动

set -e  # 遇到错误立即退出

echo "🚀 启动AI评测平台开发环境（修复版）..."

# 清理函数
cleanup() {
    echo ""
    echo "🛑 正在关闭开发环境..."

    # 停止Next.js
    if [ -f .tmp/next.pid ]; then
        NEXT_PID=$(cat .tmp/next.pid)
        if kill -0 $NEXT_PID 2>/dev/null; then
            echo "   停止Next.js (PID: $NEXT_PID)..."
            kill $NEXT_PID
        fi
        rm -f .tmp/next.pid
    fi

    # 停止处理器
    if [ -f .tmp/processor.pid ]; then
        PROCESSOR_PID=$(cat .tmp/processor.pid)
        if kill -0 $PROCESSOR_PID 2>/dev/null; then
            echo "   停止任务处理器 (PID: $PROCESSOR_PID)..."
            kill $PROCESSOR_PID
        fi
        rm -f .tmp/processor.pid
    fi

    # 清理临时目录
    rm -rf .tmp

    echo "✅ 开发环境已关闭"
    exit 0
}

# 注册信号处理
trap cleanup SIGINT SIGTERM

# 检查必要文件
echo "📋 检查必要文件..."
if [ ! -f ".env.local" ]; then
    echo "❌ .env.local文件不存在"
    exit 1
fi

if [ ! -f "start-processor.ts" ]; then
    echo "❌ start-processor.ts文件不存在"
    exit 1
fi

# 加载环境变量
echo "📋 加载环境变量..."
set -a
source .env.local
set +a
echo "✅ 环境变量加载完成"

# 显示API密钥配置状态
echo "🔑 API密钥配置:"
echo "   SILICONFLOW_API_KEY: $([ -n "$SILICONFLOW_API_KEY" ] && echo "已配置" || echo "未配置")"
echo "   OPENAI_API_KEY: $([ -n "$OPENAI_API_KEY" ] && echo "已配置" || echo "未配置")"
echo "   ANTHROPIC_API_KEY: $([ -n "$ANTHROPIC_API_KEY" ] && echo "已配置" || echo "未配置")"
echo ""

# 创建临时目录
mkdir -p .tmp

# 第一步：启动Next.js
echo "🌐 启动Next.js开发服务器..."
npx next dev > .tmp/next.log 2>&1 &
NEXT_PID=$!
echo $NEXT_PID > .tmp/next.pid
echo "   Next.js PID: $NEXT_PID"
echo "   日志文件: .tmp/next.log"

# 等待Next.js启动
echo "⏳ 等待Next.js启动..."
NEXT_READY=false
for i in {1..30}; do
    echo "   检查启动状态... ($i/30)"

    # 检查进程是否还在运行
    if ! kill -0 $NEXT_PID 2>/dev/null; then
        echo "❌ Next.js进程已退出，查看日志:"
        tail -10 .tmp/next.log
        exit 1
    fi

    # 检查端口是否可访问
    if curl -s http://localhost:3000/ > /dev/null 2>&1; then
        echo "✅ Next.js已启动 (端口: 3000)"
        NEXT_READY=true
        break
    fi

    sleep 2
done

if [ "$NEXT_READY" = false ]; then
    echo "⚠️ Next.js启动检查超时，但继续启动处理器..."
fi

# 第二步：启动任务处理器
echo ""
echo "🔧 启动统一任务处理器..."
echo "   执行命令: npx tsx start-processor.ts --auto"

# 启动处理器（使用tee同时输出到文件和控制台）
npx tsx start-processor.ts --auto 2>&1 | tee .tmp/processor.log &
PROCESSOR_PID=$!
echo $PROCESSOR_PID > .tmp/processor.pid
echo "   处理器PID: $PROCESSOR_PID"
echo "   日志文件: .tmp/processor.log"
echo "   💡 处理器日志将同时显示在控制台和文件中"

# 等待处理器启动
echo "⏳ 等待处理器启动..."
PROCESSOR_READY=false
for i in {1..20}; do
    echo "   检查处理器状态... ($i/20)"

    # 检查进程是否还在运行
    if ! kill -0 $PROCESSOR_PID 2>/dev/null; then
        echo "❌ 处理器进程已退出，查看日志:"
        tail -10 .tmp/processor.log
        break
    fi

    # 检查处理器是否响应
    if curl -s http://localhost:3000/api/processor > /dev/null 2>&1; then
        echo "✅ 任务处理器已启动"
        PROCESSOR_READY=true
        break
    fi

    sleep 3
done

if [ "$PROCESSOR_READY" = false ]; then
    echo "⚠️ 处理器可能启动失败，请检查日志"
    echo "   查看处理器日志: tail -f .tmp/processor.log"
fi

# 显示启动完成信息
echo ""
echo "🎉 开发环境启动完成！"
echo "======================================="
echo "📱 Web界面: http://localhost:3000"
echo "📊 处理器状态: curl http://localhost:3000/api/processor"
echo "📜 Next.js日志: tail -f .tmp/next.log"
echo "📜 处理器日志: tail -f .tmp/processor.log"
echo "🛑 停止服务: Ctrl+C"
echo "======================================="

# 显示当前状态
echo ""
echo "📊 当前服务状态:"
echo "   Next.js: $(kill -0 $NEXT_PID 2>/dev/null && echo "✅ 运行中" || echo "❌ 已停止")"
echo "   处理器: $(kill -0 $PROCESSOR_PID 2>/dev/null && echo "✅ 运行中" || echo "❌ 已停止")"
echo ""

# 等待用户中断
echo "💡 按 Ctrl+C 停止所有服务"
wait
