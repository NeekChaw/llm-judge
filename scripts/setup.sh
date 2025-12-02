#!/bin/bash

# AI Benchmark V2 - 一键部署脚本
# 适用于 Linux/macOS

set -e  # 遇到错误立即退出

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}"
echo "╔══════════════════════════════════════╗"
echo "║   AI Benchmark V2 - 一键部署脚本   ║"
echo "╚══════════════════════════════════════╝"
echo -e "${NC}"

# 检查必要工具
check_requirements() {
    echo -e "${YELLOW}🔍 检查系统要求...${NC}"

    # 检查 Node.js
    if ! command -v node &> /dev/null; then
        echo -e "${RED}❌ Node.js 未安装${NC}"
        echo "请安装 Node.js 18+ : https://nodejs.org/"
        exit 1
    fi
    NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
    if [ "$NODE_VERSION" -lt 18 ]; then
        echo -e "${RED}❌ Node.js 版本过低 (需要 18+, 当前: v${NODE_VERSION})${NC}"
        exit 1
    fi
    echo -e "${GREEN}✅ Node.js $(node -v)${NC}"

    # 检查 npm
    if ! command -v npm &> /dev/null; then
        echo -e "${RED}❌ npm 未安装${NC}"
        exit 1
    fi
    echo -e "${GREEN}✅ npm $(npm -v)${NC}"

    # 检查 Docker (可选)
    if command -v docker &> /dev/null; then
        echo -e "${GREEN}✅ Docker $(docker -v | cut -d' ' -f3 | cut -d',' -f1)${NC}"
        HAS_DOCKER=true
    else
        echo -e "${YELLOW}⚠️  Docker 未安装 (部署模式将受限)${NC}"
        HAS_DOCKER=false
    fi

    echo ""
}

# 配置环境变量
setup_env() {
    echo -e "${YELLOW}⚙️  配置环境变量...${NC}"

    if [ -f ".env.local" ]; then
        echo -e "${YELLOW}⚠️  .env.local 已存在，是否覆盖？(y/N)${NC}"
        read -r OVERWRITE
        if [ "$OVERWRITE" != "y" ] && [ "$OVERWRITE" != "Y" ]; then
            echo -e "${BLUE}ℹ️  保留现有配置${NC}"
            return
        fi
    fi

    # 复制模板
    cp .env.example .env.local
    echo -e "${GREEN}✅ 已创建 .env.local${NC}"

    # 交互式配置
    echo -e "${BLUE}📝 请输入配置信息 (按回车跳过)：${NC}"

    # Supabase
    read -p "Supabase URL: " SUPABASE_URL
    read -p "Supabase Anon Key: " SUPABASE_KEY

    # LLM API Keys
    echo -e "\n${BLUE}🤖 LLM API 密钥 (至少配置一个)：${NC}"
    read -p "OpenAI API Key: " OPENAI_KEY
    read -p "Anthropic API Key: " ANTHROPIC_KEY
    read -p "SiliconFlow API Key: " SILICONFLOW_KEY

    # E2B
    echo -e "\n${BLUE}🔧 代码沙盒 (可选)：${NC}"
    read -p "E2B API Key: " E2B_KEY

    # 更新 .env.local
    if [ -n "$SUPABASE_URL" ]; then
        sed -i "s|SUPABASE_URL=.*|SUPABASE_URL=$SUPABASE_URL|" .env.local 2>/dev/null || \
        sed -i '' "s|SUPABASE_URL=.*|SUPABASE_URL=$SUPABASE_URL|" .env.local
    fi
    if [ -n "$SUPABASE_KEY" ]; then
        sed -i "s|SUPABASE_ANON_KEY=.*|SUPABASE_ANON_KEY=$SUPABASE_KEY|" .env.local 2>/dev/null || \
        sed -i '' "s|SUPABASE_ANON_KEY=.*|SUPABASE_ANON_KEY=$SUPABASE_KEY|" .env.local
    fi
    if [ -n "$OPENAI_KEY" ]; then
        sed -i "s|OPENAI_API_KEY=.*|OPENAI_API_KEY=$OPENAI_KEY|" .env.local 2>/dev/null || \
        sed -i '' "s|OPENAI_API_KEY=.*|OPENAI_API_KEY=$OPENAI_KEY|" .env.local
    fi
    if [ -n "$ANTHROPIC_KEY" ]; then
        sed -i "s|ANTHROPIC_API_KEY=.*|ANTHROPIC_API_KEY=$ANTHROPIC_KEY|" .env.local 2>/dev/null || \
        sed -i '' "s|ANTHROPIC_API_KEY=.*|ANTHROPIC_API_KEY=$ANTHROPIC_KEY|" .env.local
    fi
    if [ -n "$SILICONFLOW_KEY" ]; then
        sed -i "s|SILICONFLOW_API_KEY=.*|SILICONFLOW_API_KEY=$SILICONFLOW_KEY|" .env.local 2>/dev/null || \
        sed -i '' "s|SILICONFLOW_API_KEY=.*|SILICONFLOW_API_KEY=$SILICONFLOW_KEY|" .env.local
    fi
    if [ -n "$E2B_KEY" ]; then
        sed -i "s|E2B_API_KEY=.*|E2B_API_KEY=$E2B_KEY|" .env.local 2>/dev/null || \
        sed -i '' "s|E2B_API_KEY=.*|E2B_API_KEY=$E2B_KEY|" .env.local
    fi

    echo -e "${GREEN}✅ 环境变量配置完成${NC}\n"
}

# 安装依赖
install_dependencies() {
    echo -e "${YELLOW}📦 安装依赖包...${NC}"
    npm install
    echo -e "${GREEN}✅ 依赖安装完成${NC}\n"
}

# 数据库设置
setup_database() {
    echo -e "${YELLOW}🗄️  数据库设置...${NC}"

    # 提示执行数据库初始化脚本
    if [ -f "database/supabase_export.sql" ]; then
        echo -e "${BLUE}ℹ️  检测到数据库初始化文件${NC}"
        echo -e "${YELLOW}请在 Supabase SQL Editor 中执行 database/supabase_export.sql${NC}"
        echo -e "${BLUE}按回车继续...${NC}"
        read -r
    fi

    echo -e "${GREEN}✅ 数据库设置完成${NC}\n"
}

# 选择部署模式
choose_deployment() {
    echo -e "${BLUE}🚀 选择部署模式：${NC}"
    echo "1) 开发模式 (npm run dev)"
    echo "2) Docker 部署 (推荐生产环境)"
    echo "3) 仅安装，手动启动"
    read -p "请选择 (1-3): " DEPLOY_MODE

    case $DEPLOY_MODE in
        1)
            echo -e "\n${YELLOW}🔧 启动开发服务器...${NC}"
            npm run dev
            ;;
        2)
            if [ "$HAS_DOCKER" = false ]; then
                echo -e "${RED}❌ Docker 未安装，无法使用此模式${NC}"
                exit 1
            fi
            echo -e "\n${YELLOW}🐳 启动 Docker 容器...${NC}"
            docker-compose up -d
            echo -e "${GREEN}✅ 应用已启动！${NC}"
            echo -e "${BLUE}访问: http://localhost:3000${NC}"
            ;;
        3)
            echo -e "\n${GREEN}✅ 安装完成！${NC}"
            echo -e "${BLUE}手动启动命令：${NC}"
            echo "  开发模式：npm run dev"
            echo "  生产模式：npm run build && npm start"
            echo "  Docker：docker-compose up -d"
            ;;
        *)
            echo -e "${RED}❌ 无效选择${NC}"
            exit 1
            ;;
    esac
}

# 主流程
main() {
    check_requirements
    setup_env
    install_dependencies
    setup_database
    choose_deployment

    echo -e "\n${GREEN}"
    echo "╔══════════════════════════════════════╗"
    echo "║          🎉 部署成功！               ║"
    echo "╚══════════════════════════════════════╝"
    echo -e "${NC}"
    echo -e "${BLUE}📚 文档: https://github.com/your-repo/docs${NC}"
    echo -e "${BLUE}💬 问题反馈: https://github.com/your-repo/issues${NC}"
}

# 运行主流程
main
