@echo off
chcp 65001 >nul
echo 🚀 启动AI评测平台开发环境...

REM 检查必要文件
if not exist ".env.local" (
    echo ❌ .env.local文件不存在
    exit /b 1
)

if not exist "start-processor.ts" (
    echo ❌ start-processor.ts文件不存在
    exit /b 1
)

REM 加载环境变量
echo 📋 加载环境变量...
for /f "tokens=1,2 delims==" %%a in (.env.local) do (
    if not "%%a"=="" if not "%%a:~0,1%"=="#" (
        set "%%a=%%b"
        echo    %%a: ✅
    )
)
echo ✅ 环境变量加载完成

echo 🌐 启动Next.js开发服务器...
start "Next.js Dev Server" cmd /c "npx next dev"

echo ⏳ 等待Next.js启动...
timeout /t 5 /nobreak >nul

echo 🔧 启动任务处理器...
echo 执行命令: npx tsx start-processor.ts --auto
echo 🔍 Supabase配置检查:
echo    SUPABASE_URL: %NEXT_PUBLIC_SUPABASE_URL:~0,20%...
echo    SUPABASE_ANON_KEY: %NEXT_PUBLIC_SUPABASE_ANON_KEY:~0,20%...
npx tsx start-processor.ts --auto

echo 🎉 开发环境启动完成！
echo =======================================
echo 📱 Web界面: http://localhost:3000
echo 🛑 停止服务: Ctrl+C
echo =======================================