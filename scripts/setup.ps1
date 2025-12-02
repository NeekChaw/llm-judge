# AI Benchmark V2 - Windows 一键部署脚本
# PowerShell 版本

$ErrorActionPreference = "Stop"

# 颜色函数
function Write-ColorOutput($ForegroundColor, $Message) {
    Write-Host $Message -ForegroundColor $ForegroundColor
}

Write-ColorOutput Cyan @"
╔══════════════════════════════════════╗
║   AI Benchmark V2 - 一键部署脚本   ║
║          Windows 版本               ║
╚══════════════════════════════════════╝
"@

# 检查 Node.js
Write-ColorOutput Yellow "`n🔍 检查系统要求..."

if (!(Get-Command node -ErrorAction SilentlyContinue)) {
    Write-ColorOutput Red "❌ Node.js 未安装"
    Write-Host "请安装 Node.js 18+: https://nodejs.org/"
    exit 1
}

$nodeVersion = (node -v).Substring(1).Split('.')[0]
if ([int]$nodeVersion -lt 18) {
    Write-ColorOutput Red "❌ Node.js 版本过低 (需要 18+, 当前: $nodeVersion)"
    exit 1
}
Write-ColorOutput Green "✅ Node.js $(node -v)"

# 检查 npm
if (!(Get-Command npm -ErrorAction SilentlyContinue)) {
    Write-ColorOutput Red "❌ npm 未安装"
    exit 1
}
Write-ColorOutput Green "✅ npm $(npm -v)"

# 检查 Docker
$hasDocker = Get-Command docker -ErrorAction SilentlyContinue
if ($hasDocker) {
    Write-ColorOutput Green "✅ Docker 已安装"
} else {
    Write-ColorOutput Yellow "⚠️  Docker 未安装 (部署模式将受限)"
}

# 配置环境变量
Write-ColorOutput Yellow "`n⚙️  配置环境变量..."

if (Test-Path ".env.local") {
    $overwrite = Read-Host "⚠️  .env.local 已存在，是否覆盖？(y/N)"
    if ($overwrite -ne "y" -and $overwrite -ne "Y") {
        Write-ColorOutput Cyan "ℹ️  保留现有配置"
    } else {
        Copy-Item ".env.example" ".env.local" -Force
        Write-ColorOutput Green "✅ 已创建 .env.local"
    }
} else {
    Copy-Item ".env.example" ".env.local"
    Write-ColorOutput Green "✅ 已创建 .env.local"
}

# 交互式配置
Write-ColorOutput Cyan "`n📝 请输入配置信息 (按回车跳过)："

$supabaseUrl = Read-Host "Supabase URL"
$supabaseKey = Read-Host "Supabase Anon Key"

Write-Host "`n🤖 LLM API 密钥 (至少配置一个)："
$openaiKey = Read-Host "OpenAI API Key"
$anthropicKey = Read-Host "Anthropic API Key"
$siliconflowKey = Read-Host "SiliconFlow API Key"

Write-Host "`n🔧 代码沙盒 (可选)："
$e2bKey = Read-Host "E2B API Key"

# 更新配置文件
$envContent = Get-Content ".env.local"
if ($supabaseUrl) {
    $envContent = $envContent -replace "SUPABASE_URL=.*", "SUPABASE_URL=$supabaseUrl"
}
if ($supabaseKey) {
    $envContent = $envContent -replace "SUPABASE_ANON_KEY=.*", "SUPABASE_ANON_KEY=$supabaseKey"
}
if ($openaiKey) {
    $envContent = $envContent -replace "OPENAI_API_KEY=.*", "OPENAI_API_KEY=$openaiKey"
}
if ($anthropicKey) {
    $envContent = $envContent -replace "ANTHROPIC_API_KEY=.*", "ANTHROPIC_API_KEY=$anthropicKey"
}
if ($siliconflowKey) {
    $envContent = $envContent -replace "SILICONFLOW_API_KEY=.*", "SILICONFLOW_API_KEY=$siliconflowKey"
}
if ($e2bKey) {
    $envContent = $envContent -replace "E2B_API_KEY=.*", "E2B_API_KEY=$e2bKey"
}
$envContent | Set-Content ".env.local"

Write-ColorOutput Green "`n✅ 环境变量配置完成"

# 安装依赖
Write-ColorOutput Yellow "`n📦 安装依赖包..."
npm install
Write-ColorOutput Green "✅ 依赖安装完成"

# 数据库设置提示
Write-ColorOutput Yellow "`n🗄️  数据库设置..."
Write-ColorOutput Cyan "ℹ️  请在 Supabase SQL Editor 中执行 database/supabase_export.sql"
Read-Host "按回车继续"

# 选择部署模式
Write-Host "`n🚀 选择部署模式："
Write-Host "1) 开发模式 (npm run dev)"
Write-Host "2) Docker 部署"
Write-Host "3) 仅安装，手动启动"
$deployMode = Read-Host "请选择 (1-3)"

switch ($deployMode) {
    "1" {
        Write-ColorOutput Yellow "`n🔧 启动开发服务器..."
        npm run dev
    }
    "2" {
        if (!$hasDocker) {
            Write-ColorOutput Red "❌ Docker 未安装，无法使用此模式"
            exit 1
        }
        Write-ColorOutput Yellow "`n🐳 启动 Docker 容器..."
        docker-compose up -d
        Write-ColorOutput Green "✅ 应用已启动！"
        Write-ColorOutput Cyan "访问: http://localhost:3000"
    }
    "3" {
        Write-ColorOutput Green "`n✅ 安装完成！"
        Write-ColorOutput Cyan "手动启动命令："
        Write-Host "  开发模式：npm run dev"
        Write-Host "  生产模式：npm run build && npm start"
        Write-Host "  Docker：docker-compose up -d"
    }
    default {
        Write-ColorOutput Red "❌ 无效选择"
        exit 1
    }
}

Write-ColorOutput Green @"

╔══════════════════════════════════════╗
║          🎉 部署成功！               ║
╚══════════════════════════════════════╝
"@

Write-ColorOutput Cyan "📚 文档: https://github.com/your-repo/docs"
Write-ColorOutput Cyan "💬 问题反馈: https://github.com/your-repo/issues"
