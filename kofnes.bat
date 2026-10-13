@echo off
rem KOFnes - abre o emulador (opcionalmente ja com uma ROM).
rem   kofnes.bat            -> janela com a xicara, Ctrl+O pra abrir ROM
rem   kofnes.bat jogo.sfc   -> ja abre o jogo
rem Precisa do Kof (https://github.com/KofLang/Kof4j) no PATH.
set ROM=%~f1
cd /d "%~dp0"
if "%~1"=="" (kof run KOFnes.kf) else (kof run KOFnes.kf "%ROM%")
