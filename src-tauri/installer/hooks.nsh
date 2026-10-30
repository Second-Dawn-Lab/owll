; Extra steps for the Owl-L (NSIS) installer, hooked in through tauri.conf.json (bundle.windows.nsis.installerHooks).

; The shared language packs (%AppData%\SecondDawn\models) are never removed here: other Second Dawn
; apps may use them. Owl-L's own settings and history are removed only when the user agrees.
!macro NSIS_HOOK_POSTUNINSTALL
  ; Not when the uninstaller runs as part of an update, and not in silent mode.
  ${If} $UpdateMode <> 1
    IfSilent owl_keep_data
    MessageBox MB_YESNO|MB_ICONQUESTION "Also delete Owl-L's settings and translation history?$\r$\n$\r$\nThe downloaded language packs are kept, because other Second Dawn apps may use them." /SD IDNO IDNO owl_keep_data
    RMDir /r "$APPDATA\SecondDawn\owll"
    owl_keep_data:
  ${EndIf}
!macroend
