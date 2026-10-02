Unicode true
LoadLanguageFile "${NSISDIR}\\Contrib\\Language files\\English.nlf"

!ifndef APP_VERSION
  !define APP_VERSION "0.0.0-dev"
!endif
!ifndef STAGE_DIR
  !error "STAGE_DIR is required"
!endif
!ifndef OUT_FILE
  !define OUT_FILE "ALRemastered-Windows-x64-Setup.exe"
!endif

Name "ALRemastered"
OutFile "${OUT_FILE}"
InstallDir "$LOCALAPPDATA\Programs\ALRemastered"
InstallDirRegKey HKCU "Software\ALRemastered" "InstallLocation"
RequestExecutionLevel user
SetCompressor /SOLID lzma

Page directory
Page instfiles
UninstPage uninstConfirm
UninstPage instfiles

Section "ALRemastered" SEC_CORE
  SectionIn RO
  SetOutPath "$INSTDIR"
  File /r "${STAGE_DIR}\*"

  WriteRegStr HKCU "Software\ALRemastered" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\ALRemastered" "DisplayName" "ALRemastered"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\ALRemastered" "DisplayVersion" "${APP_VERSION}"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\ALRemastered" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\ALRemastered" "UninstallString" '"$INSTDIR\Uninstall.exe"'

  CreateDirectory "$SMPROGRAMS\ALRemastered"
  CreateShortcut "$SMPROGRAMS\ALRemastered\ALRemastered.lnk" "$INSTDIR\ALRemastered.exe"
  CreateShortcut "$SMPROGRAMS\ALRemastered\Uninstall ALRemastered.lnk" "$INSTDIR\Uninstall.exe"
  WriteUninstaller "$INSTDIR\Uninstall.exe"
SectionEnd

Section /o "Desktop shortcut" SEC_DESKTOP
  CreateShortcut "$DESKTOP\ALRemastered.lnk" "$INSTDIR\ALRemastered.exe"
SectionEnd

Section "Uninstall"
  Delete "$DESKTOP\ALRemastered.lnk"
  Delete "$SMPROGRAMS\ALRemastered\ALRemastered.lnk"
  Delete "$SMPROGRAMS\ALRemastered\Uninstall ALRemastered.lnk"
  RMDir "$SMPROGRAMS\ALRemastered"
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\ALRemastered"
  DeleteRegKey HKCU "Software\ALRemastered"
  RMDir /r "$INSTDIR"
SectionEnd
