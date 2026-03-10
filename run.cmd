@echo off
setlocal EnableExtensions

REM Always run from repository root (location of this script)
cd /d "%~dp0"

set "LOGFILE=%~dp0run.log"
call :log "===== Run started ====="
call :log "[device-activity-tracker] Launcher"
echo.
set /p USE_DOCKER=Use Docker? (Y/N): 
set "USE_DOCKER=%USE_DOCKER: =%"
if "%USE_DOCKER%"=="" set "USE_DOCKER=N"
if /I not "%USE_DOCKER%"=="Y" if /I not "%USE_DOCKER%"=="N" set "USE_DOCKER=N"
call :log "Use Docker? (Y/N): %USE_DOCKER%"

if /I "%USE_DOCKER%"=="Y" goto :docker_menu
if /I "%USE_DOCKER%"=="N" goto :local_menu
goto :invalid

:docker_menu
echo.
echo Docker run mode:
echo   1^) docker compose up --build
echo   2^) docker compose up -d --build
set /p DOCKER_MODE=Choose (1/2): 
set "DOCKER_MODE=%DOCKER_MODE: =%"
if "%DOCKER_MODE%"=="" set "DOCKER_MODE=1"
if not "%DOCKER_MODE%"=="1" if not "%DOCKER_MODE%"=="2" set "DOCKER_MODE=1"
call :log "Docker mode: %DOCKER_MODE%"

if "%DOCKER_MODE%"=="1" (
  call :run docker compose up --build
  if errorlevel 1 goto :fail
  goto :done
)
if "%DOCKER_MODE%"=="2" (
  call :run docker compose up -d --build
  if errorlevel 1 goto :fail
  echo.
  echo [ok] Containers started in background.
  echo [tip] Use: docker compose logs -f
  call :log "[ok] Containers started in background."
  goto :done
)
goto :invalid

:local_menu
echo.
echo Local run mode:
echo   1^) Backend + Frontend (npm run dev)
echo   2^) Backend only
echo   3^) Frontend only
set /p LOCAL_MODE=Choose (1/2/3): 
set "LOCAL_MODE=%LOCAL_MODE: =%"
if "%LOCAL_MODE%"=="" set "LOCAL_MODE=1"
if not "%LOCAL_MODE%"=="1" if not "%LOCAL_MODE%"=="2" if not "%LOCAL_MODE%"=="3" set "LOCAL_MODE=1"
call :log "Local mode: %LOCAL_MODE%"

if not exist "node_modules" (
  call :run npm install
  if errorlevel 1 goto :fail
)
if not exist "backend\node_modules" (
  call :run npm run setup
  if errorlevel 1 goto :fail
)
if not exist "frontend\node_modules" (
  call :run npm run setup
  if errorlevel 1 goto :fail
)

if "%LOCAL_MODE%"=="1" (
  call :ensure_port_free 3000
  if errorlevel 1 goto :fail
  call :ensure_port_free 3001
  if errorlevel 1 goto :fail
  call :docker_running
  if errorlevel 1 (
    echo [info] Docker is not running. Starting local mode without Signal bootstrap.
    call :log "[info] Docker not running; using local mode without Signal bootstrap."
    call :run npm run dev
  ) else (
    call :run npm run dev:with-signal
  )
  if errorlevel 1 goto :fail
  goto :done
)
if "%LOCAL_MODE%"=="2" (
  call :ensure_port_free 3001
  if errorlevel 1 goto :fail
  call :docker_running
  if errorlevel 1 (
    echo [info] Docker is not running. Starting backend without Signal bootstrap.
    call :log "[info] Docker not running; using backend without Signal bootstrap."
    call :run npm run start:server
  ) else (
    call :run npm run start:server:with-signal
  )
  if errorlevel 1 goto :fail
  goto :done
)
if "%LOCAL_MODE%"=="3" (
  call :ensure_port_free 3000
  if errorlevel 1 goto :fail
  call :run npm run start:client
  if errorlevel 1 goto :fail
  goto :done
)
goto :invalid

:run
set "CMD=%*"
echo [run] %CMD%
call :log "[run] %CMD%"
call %CMD% >> "%LOGFILE%" 2>&1
exit /b %errorlevel%

:log
echo %~1>> "%LOGFILE%"
exit /b 0

:docker_running
docker info >nul 2>&1
exit /b %errorlevel%

:ensure_port_free
set "CHECK_PORT=%~1"
set "PORT_PID="
for /f "tokens=5" %%P in ('netstat -ano ^| findstr /R /C:":%CHECK_PORT% .*LISTENING"') do (
  set "PORT_PID=%%P"
  goto :port_found
)
exit /b 0

:port_found
echo [warn] Port %CHECK_PORT% is in use by PID %PORT_PID%.
call :log "[warn] Port %CHECK_PORT% in use by PID %PORT_PID%."
set /p KILL_PID=Stop PID %PORT_PID% to continue? (Y/N): 
set "KILL_PID=%KILL_PID: =%"
if /I "%KILL_PID%"=="Y" (
  taskkill /PID %PORT_PID% /F >> "%LOGFILE%" 2>&1
  if errorlevel 1 (
    echo [error] Could not stop PID %PORT_PID%.
    call :log "[error] Could not stop PID %PORT_PID%."
    exit /b 1
  )
  timeout /t 1 /nobreak > nul
  exit /b 0
)
echo [error] Port %CHECK_PORT% is required.
call :log "[error] User declined freeing port %CHECK_PORT%."
exit /b 1

:invalid
echo.
echo [error] Invalid selection.
call :log "[error] Invalid selection."
goto :fail

:fail
echo.
echo [error] Startup failed. See run.log
call :log "[error] Startup failed."
call :log "===== Run finished (failed) ====="
exit /b 1

:done
call :log "===== Run finished (ok) ====="
exit /b 0
