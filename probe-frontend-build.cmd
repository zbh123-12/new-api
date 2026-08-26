@echo off
setlocal
cd /d C:\Users\93630\Documents\ChatGPT\new-api
set DOCKER_HOST=tcp://localhost:2375
echo === probe started at %date% %time% > probe-frontend.log
docker run --rm -v "%CD%\web:/work" -w /work -e DISABLE_ESLINT_PLUGIN=true -e VITE_REACT_APP_VERSION=0.0.0-probe oven/bun:1 sh -c "bun install --frozen-lockfile && bun run build" >> probe-frontend.log 2>&1
echo === probe ended exit=%ERRORLEVEL% >> probe-frontend.log
