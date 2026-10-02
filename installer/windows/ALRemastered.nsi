Unicode true
LoadLanguageFile "${NSISDIR}\Contrib\Language files\English.nlf"
!include "FileFunc.nsh"

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

Var AutoUpdate
Var WaitPid

Function .onInit
  StrCpy $AutoUpdate "0"
  StrCpy $WaitPid ""
  ${GetParameters} $R0

  ClearErrors
  ${GetOptions} $R0 "/ALRUPDATE=" $R1
  IfErrors +2
    StrCpy $AutoUpdate $R1

  ClearErrors
  ${GetOptions} $R0 "/ALRWAITPID=" $R2
  IfErrors +2
    StrCpy $WaitPid $R2

  StrCmp $AutoUpdate "1" 0 update_wait_done
  StrCmp $WaitPid "" update_wait_done
  System::Call 'kernel32::OpenProcess(i 0x00100000, i 0, i $WaitPid) p .r3'
  StrCmp $3 0 update_wait_sleep
  System::Call 'kernel32::WaitForSingleObject(p r3, i 30000) i .r4'
  System::Call 'kernel32::CloseHandle(p r3)'

update_wait_sleep:
  Sleep 1200

update_wait_done:
FunctionEnd

Page directory
Page instfiles
UninstPage uninstConfirm
UninstPage instfiles

Section "ALRemastered" SEC_CORE
  SectionIn RO

  CreateDirectory "$LOCALAPPDATA\ALRemastered\config"
  CreateDirectory "$LOCALAPPDATA\ALRemastered\data"
  CreateDirectory "$LOCALAPPDATA\ALRemastered\logs"

  FileOpen $0 "$LOCALAPPDATA\ALRemastered\logs\installer.log" a
  FileWrite $0 "event=install_start version=${APP_VERSION} path=$INSTDIR$\r$\n"
  FileClose $0

  RMDir /r "$INSTDIR\.update"
  RMDir /r "$INSTDIR\.previous"
  CreateDirectory "$INSTDIR\.update"
  CreateDirectory "$INSTDIR\.previous"

  SetOutPath "$INSTDIR\.update"
  File /r "${STAGE_DIR}\*"

  IfFileExists "$INSTDIR\app\*.*" 0 +2
    Rename "$INSTDIR\app" "$INSTDIR\.previous\app"
  IfFileExists "$INSTDIR\runtime\*.*" 0 +2
    Rename "$INSTDIR\runtime" "$INSTDIR\.previous\runtime"
  IfFileExists "$INSTDIR\ALRemastered.exe" 0 +2
    Rename "$INSTDIR\ALRemastered.exe" "$INSTDIR\.previous\ALRemastered.exe"

  ClearErrors
  Rename "$INSTDIR\.update\app" "$INSTDIR\app"
  IfErrors upgrade_failed
  ClearErrors
  Rename "$INSTDIR\.update\runtime" "$INSTDIR\runtime"
  IfErrors upgrade_failed
  ClearErrors
  Rename "$INSTDIR\.update\ALRemastered.exe" "$INSTDIR\ALRemastered.exe"
  IfErrors upgrade_failed
  RMDir /r "$INSTDIR\.update"

  WriteRegStr HKCU "Software\ALRemastered" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\ALRemastered" "DisplayName" "ALRemastered"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\ALRemastered" "DisplayVersion" "${APP_VERSION}"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\ALRemastered" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\ALRemastered" "UninstallString" '"$INSTDIR\Uninstall.exe"'

  CreateDirectory "$SMPROGRAMS\ALRemastered"
  CreateShortcut "$SMPROGRAMS\ALRemastered\ALRemastered.lnk" "$INSTDIR\ALRemastered.exe"
  CreateShortcut "$SMPROGRAMS\ALRemastered\Uninstall ALRemastered.lnk" "$INSTDIR\Uninstall.exe"
  WriteUninstaller "$INSTDIR\Uninstall.exe"

  FileOpen $0 "$LOCALAPPDATA\ALRemastered\logs\installer.log" a
  FileWrite $0 "event=install_success version=${APP_VERSION} path=$INSTDIR$\r$\n"
  FileClose $0

  StrCmp $AutoUpdate "1" 0 install_done
  FileOpen $0 "$LOCALAPPDATA\ALRemastered\logs\installer.log" a
  FileWrite $0 "event=auto_restart version=${APP_VERSION} path=$INSTDIR$\r$\n"
  FileClose $0
  Exec '"$INSTDIR\ALRemastered.exe" --no-open-dashboard --post-update'
  Goto install_done

upgrade_failed:
  RMDir /r "$INSTDIR\app"
  RMDir /r "$INSTDIR\runtime"
  Delete "$INSTDIR\ALRemastered.exe"
  IfFileExists "$INSTDIR\.previous\app\*.*" 0 +2
    Rename "$INSTDIR\.previous\app" "$INSTDIR\app"
  IfFileExists "$INSTDIR\.previous\runtime\*.*" 0 +2
    Rename "$INSTDIR\.previous\runtime" "$INSTDIR\runtime"
  IfFileExists "$INSTDIR\.previous\ALRemastered.exe" 0 +2
    Rename "$INSTDIR\.previous\ALRemastered.exe" "$INSTDIR\ALRemastered.exe"
  RMDir /r "$INSTDIR\.update"
  FileOpen $0 "$LOCALAPPDATA\ALRemastered\logs\installer.log" a
  FileWrite $0 "event=install_rollback version=${APP_VERSION} path=$INSTDIR$\r$\n"
  FileClose $0

  StrCmp $AutoUpdate "1" 0 upgrade_failed_message
  Exec '"$INSTDIR\ALRemastered.exe" --no-open-dashboard --post-update-rollback'

upgrade_failed_message:
  IfSilent upgrade_failed_abort
  MessageBox MB_ICONSTOP|MB_OK "ALRemastered could not be updated. The previous version was restored."

upgrade_failed_abort:
  SetErrorLevel 1
  Abort

install_done:
SectionEnd

Section /o "Desktop shortcut" SEC_DESKTOP
  CreateShortcut "$DESKTOP\ALRemastered.lnk" "$INSTDIR\ALRemastered.exe"
SectionEnd

Section "Uninstall"
  CreateDirectory "$LOCALAPPDATA\ALRemastered\logs"
  FileOpen $0 "$LOCALAPPDATA\ALRemastered\logs\installer.log" a
  FileWrite $0 "event=uninstall path=$INSTDIR$\r$\n"
  FileClose $0

  Delete "$DESKTOP\ALRemastered.lnk"
  Delete "$SMPROGRAMS\ALRemastered\ALRemastered.lnk"
  Delete "$SMPROGRAMS\ALRemastered\Uninstall ALRemastered.lnk"
  RMDir "$SMPROGRAMS\ALRemastered"
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\ALRemastered"
  DeleteRegKey HKCU "Software\ALRemastered"
  RMDir /r "$INSTDIR"
SectionEnd
