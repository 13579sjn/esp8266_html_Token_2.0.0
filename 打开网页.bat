@echo off
setlocal EnableExtensions
chcp 65001 >nul
title OneNET Token Generator
cd /d "%~dp0"

set "URL=http://127.0.0.1:4173/"
set "SERVER=scripts\serve-dist.mjs"

echo ============================================
echo   OneNET Token Generator
echo   OneNET MQTT 设备鉴权 Token 生成器
echo ============================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo [错误] 未找到 Node.js。
  echo 请先安装 Node.js 20.19 或更高版本，然后重新双击本文件。
  pause
  exit /b 1
)

if not exist "%SERVER%" (
  echo [错误] 缺少服务文件 %SERVER%
  echo 请确认项目文件完整。
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo 正在安装依赖，请稍候...
  call npm install
  if errorlevel 1 goto :failed
)

if not exist "dist\index.html" (
  echo 正在构建页面，请稍候...
  call npm run build
  if errorlevel 1 goto :failed
)

rem 如果 4173 端口已经在提供本页面，直接打开浏览器，避免重复启动。
set "HTTP_CODE="
for /f "usebackq delims=" %%c in (`curl -s -o NUL -w "%%{http_code}" "%URL%" 2^>NUL`) do set "HTTP_CODE=%%c"
if "%HTTP_CODE%"=="200" (
  echo 页面服务已经在运行，正在打开浏览器...
  start "" "%URL%"
  exit /b 0
)

echo 正在启动本地服务...
echo.
echo 提示：请保持这个窗口打开；关闭窗口后网页将无法访问。
echo.
node "%SERVER%" --open
echo.
echo 服务已停止。
pause
exit /b 0

:failed
echo.
echo [错误] 启动失败，请查看上方错误信息。
pause
exit /b 1
