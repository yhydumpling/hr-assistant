@echo off
setlocal
cd /d "%~dp0.."
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 22.x or 24.x is required.
  pause
  exit /b 1
)
where pnpm >nul 2>nul
if errorlevel 1 (
  echo pnpm is required. See README.md for setup.
  pause
  exit /b 1
)
if not exist "node_modules\next\dist\bin\next" (
  echo Installing local project dependencies...
  call pnpm install --frozen-lockfile
  if errorlevel 1 (
    pause
    exit /b 1
  )
)
if not exist ".env.local" (
  echo Copy .env.example to .env.local and configure DATABASE_URL.
  echo Start PostgreSQL, then run pnpm db:init before using the app.
  pause
  exit /b 1
)
echo PostgreSQL must already be running and initialized with pnpm db:init.
echo Open http://127.0.0.1:3001 and keep this window open.
call pnpm dev
if errorlevel 1 pause
