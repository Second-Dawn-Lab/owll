@echo off
rem The same as run-owll.bat (one dev build at a time, no incremental compilation), with timing traces on stderr.
rem DAWN_TRACE_KEYS=1 additionally prints every key event the keyboard hook sees (to find out why a shortcut does nothing).
set DAWN_TRACE=1
call "%~dp0run-owll.bat"
