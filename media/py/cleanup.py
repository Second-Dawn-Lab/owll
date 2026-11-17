"""Stops only what the demo itself started: the demo build of Owl-L, its Edge helper window (own profile folder) and the helper windows."""
import subprocess

PS = r"""
$me = $PID
Get-CimInstance Win32_Process | Where-Object {
  $_.ProcessId -ne $me -and (
    ($_.Name -eq 'owll.exe' -and $_.ExecutablePath -like '*target-demo*') -or
    ($_.Name -eq 'msedge.exe' -and $_.CommandLine -like '*media\work\edge-profile*') -or
    ($_.Name -eq 'powershell.exe' -and $_.CommandLine -like '*owll\media\ps\*') -or
    ($_.Name -eq 'python.exe' -and $_.CommandLine -like '*viewer.py*')
  ) } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
"""


def main() -> None:
    subprocess.run(["powershell", "-NoProfile", "-Command", PS], capture_output=True)


if __name__ == "__main__":
    main()
