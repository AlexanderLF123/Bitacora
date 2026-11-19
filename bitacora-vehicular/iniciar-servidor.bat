@echo off
title Bitacora Vehicular - Servidor Local
echo ===================================================
echo     INICIANDO BITACORA VEHICULAR PROFESIONAL
echo ===================================================
echo.
echo Puerto:     3050 (libre de conflictos con puerto 3000)
echo Admin User: jushr (Administrador JUSHMRCB)
echo Password:   jushr2026
echo.
echo Abriendo en tu navegador...
start http://localhost:3050
node server.js
pause
