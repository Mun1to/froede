@echo off
rem froede launcher: opens two terminals for a project - its dev server
rem (when a package.json exists) and the froede companion.
rem Usage: froede.bat [project-path]   (no argument = the current folder)
setlocal
set "FROEDE_DIR=%~dp0"
set "PROJECT=%~1"
if "%PROJECT%"=="" set "PROJECT=%CD%"
echo froede: project = %PROJECT%
if exist "%PROJECT%\package.json" start "dev server" /d "%PROJECT%" cmd /k pnpm dev
start "froede companion" /d "%PROJECT%" cmd /k node "%FROEDE_DIR%packages\companion\dist\cli.js"
endlocal
