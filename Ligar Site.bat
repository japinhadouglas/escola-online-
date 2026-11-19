@echo off
title Escola Online - Servidor
cd /d "%~dp0"
color 0B

echo ============================================================
echo   ESCOLA ONLINE - LIGANDO O SITE
echo ============================================================
echo.

echo [1/2] Ligando o tunel publico do Cloudflare...
start "Tunel Escola Online" /min cmd /c "cloudflared.exe tunnel --url http://localhost:3000 > tunnel-url.txt 2>&1"

echo [2/2] Ligando o servidor do site...
set NODE_ENV=production
start "Servidor Escola Online" /min node dist\server\server\index.js

echo Aguardando o tunel criar a URL (20 segundos)...
timeout /t 20 /nobreak >nul

echo.
echo ============================================================
echo   SITE NO AR! A URL publica e (copie e abra no navegador):
powershell -NoProfile -Command "$m = Select-String -Path 'tunnel-url.txt' -Pattern 'https://[a-z0-9-]+\.trycloudflare\.com' -ErrorAction SilentlyContinue | Select-Object -First 1; if ($m) { $m.Matches[0].Value } else { 'Aguarde alguns segundos e abra o arquivo tunnel-url.txt' }"
echo ============================================================
echo.
echo  - O site fica no ar enquanto o PC estiver ligado.
echo  - Para encerrar, feche as janelas "Tunel" e "Servidor".
echo.
pause