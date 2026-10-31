# Types keys into the foreground window with keybd_event, for checking global shortcuts by hand-free tests.
# usage: powershell -File scripts/type-keys.ps1 ctrl alt L L
Add-Type -Namespace K -Name Native -MemberDefinition '[DllImport("user32.dll")] public static extern void keybd_event(byte vk, byte scan, int flags, int extra);'
$codes = @{ ctrl = 0x11; alt = 0x12; shift = 0x10; win = 0x5B; space = 0x20 }
function Code($name) {
  if ($codes.ContainsKey($name.ToLower())) { return $codes[$name.ToLower()] }
  return [int][char]$name.ToUpper()
}
$mods = @(); $keys = @()
foreach ($a in $args) { if (@('ctrl', 'alt', 'shift', 'win') -contains $a.ToLower()) { $mods += $a } else { $keys += $a } }
foreach ($m in $mods) { [K.Native]::keybd_event((Code $m), 0, 0, 0); Start-Sleep -Milliseconds 40 }
foreach ($k in $keys) {
  [K.Native]::keybd_event((Code $k), 0, 0, 0); Start-Sleep -Milliseconds 40
  [K.Native]::keybd_event((Code $k), 0, 2, 0); Start-Sleep -Milliseconds 90
}
[array]::Reverse($mods)
foreach ($m in $mods) { [K.Native]::keybd_event((Code $m), 0, 2, 0); Start-Sleep -Milliseconds 40 }
