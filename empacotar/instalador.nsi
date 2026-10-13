; Instalador do KOFnes (NSIS, LZMA sólido). Chamado pelo empacotar.sh:
;   makensis -DORIGEM=<pasta KOFnes> -DICONE=<icone.ico> -DSAIDA=<exe> instalador.nsi
; Instala só pro usuário (sem pedir administrador) em %LOCALAPPDATA%\KOFnes.
Unicode true
; o KOFnes é só x64; o instalador também (roda em Wine 64 sem WoW64)
Target amd64-unicode
SetCompressor /SOLID lzma
SetCompressorDictSize 32
RequestExecutionLevel user

Name "KOFnes"
OutFile "${SAIDA}"
Icon "${ICONE}"
UninstallIcon "${ICONE}"
InstallDir "$LOCALAPPDATA\KOFnes"
BrandingText "KOFnes ☕ — Super Nintendo em Kof"

!include "MUI2.nsh"
!define MUI_ICON "${ICONE}"
!define MUI_UNICON "${ICONE}"
!define MUI_FINISHPAGE_RUN "$INSTDIR\KOFnes.exe"
!define MUI_FINISHPAGE_RUN_TEXT "Abrir o KOFnes agora"
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "PortugueseBR"

Section "KOFnes"
    SetOutPath "$INSTDIR"
    File /r "${ORIGEM}\*.*"
    WriteUninstaller "$INSTDIR\Desinstalar.exe"
    CreateShortcut "$DESKTOP\KOFnes.lnk" "$INSTDIR\KOFnes.exe"
    CreateDirectory "$SMPROGRAMS\KOFnes"
    CreateShortcut "$SMPROGRAMS\KOFnes\KOFnes.lnk" "$INSTDIR\KOFnes.exe"
    CreateShortcut "$SMPROGRAMS\KOFnes\Desinstalar.lnk" "$INSTDIR\Desinstalar.exe"
    WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\KOFnes" "DisplayName" "KOFnes"
    WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\KOFnes" "UninstallString" '"$INSTDIR\Desinstalar.exe"'
    WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\KOFnes" "DisplayIcon" "$INSTDIR\KOFnes.exe"
SectionEnd

; apaga só o que o instalador pôs: ROMs e saves (.srm) que o usuário
; deixou na pasta ficam lá
Section "Uninstall"
    RMDir /r "$INSTDIR\runtime"
    Delete "$INSTDIR\KOFnes.exe"
    Delete "$INSTDIR\kofnes.jar"
    Delete "$INSTDIR\kofnes.log"
    Delete "$INSTDIR\LEIA-ME.txt"
    Delete "$INSTDIR\Desinstalar.exe"
    RMDir "$INSTDIR"
    Delete "$DESKTOP\KOFnes.lnk"
    RMDir /r "$SMPROGRAMS\KOFnes"
    DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\KOFnes"
SectionEnd
