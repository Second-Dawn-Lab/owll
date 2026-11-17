<#
 One command for the Owl-L demo media (README GIF, promo videos, thumbnail). See media/README.md.

   .\make-demo.ps1                       everything: assets, record all scenes, render all videos, GIF, thumbnail
   .\make-demo.ps1 -Steps record -Scenes 03-popup      re-record one scene
   .\make-demo.ps1 -Steps render -Formats 9x16         re-render one format
   .\make-demo.ps1 -Steps gif,thumb                    only the README GIF and the thumbnail
   .\make-demo.ps1 -Steps build                        build the demo version of Owl-L (once, ~15 min)
   .\make-demo.ps1 -Steps v2                           promo v2 (owl artwork, Remotion): timeline, render, mix, thumbnail (add: -Formats 9x16)
#>
param(
  [string[]]$Steps = @("all"),
  [string]$Scenes = "",
  [string]$Formats = "16x9,9x16,1x1"
)
$ErrorActionPreference = "Stop"
$media = $PSScriptRoot
$owll = Split-Path $media -Parent

# Dependencies stay inside media/: pinned Node packages (ffmpeg) and a Python virtual environment.
if (-not (Test-Path "$media\node_modules\ffmpeg-static\ffmpeg.exe")) { Push-Location $media; npm ci --no-audit --no-fund; Pop-Location }
if (-not (Test-Path "$media\.venv\Scripts\python.exe")) {
  python -m venv "$media\.venv"
  & "$media\.venv\Scripts\python.exe" -m pip install -q --disable-pip-version-check -r "$media\requirements.txt"
}

if ($Steps -contains "build") {
  # The demo build is an ordinary release build plus the cargo feature "demo-capture" (never part of an official release);
  # it goes to its own target folder so it does not disturb normal builds.
  Push-Location $owll
  $env:CARGO_TARGET_DIR = "target-demo"
  pnpm tauri build --no-bundle --features demo-capture
  Remove-Item Env:\CARGO_TARGET_DIR
  Pop-Location
  $Steps = $Steps | Where-Object { $_ -ne "build" }
  if ($Steps.Count -eq 0) { exit 0 }
}

if ($Steps -contains "v2") {
  # Promo v2 (Remotion + the owl artwork): needs media/remotion installed once and the artwork in work/v2/art (see media/README.md).
  if (-not (Test-Path "$media\remotion\node_modules\remotion")) { Push-Location "$media\remotion"; npm ci --no-audit --no-fund; Pop-Location }
  $v2 = $Steps | Where-Object { $_ -ne "v2" }
  if ($v2.Count -eq 0) { $v2 = @("all") }
  & "$media\.venv\Scripts\python.exe" "$media\py\artprep.py"
  & "$media\.venv\Scripts\python.exe" "$media\py\blinkgen.py"
  & "$media\.venv\Scripts\python.exe" "$media\py\promo2.py" @v2 "--formats" $Formats
  exit $LASTEXITCODE
}

$pyArgs = @("$media\py\make_demo.py") + $Steps + @("--formats", $Formats)
if ($Scenes -ne "") { $pyArgs += @("--scenes", $Scenes) }
try {
  & "$media\.venv\Scripts\python.exe" @pyArgs
} finally {
  & "$media\.venv\Scripts\python.exe" "$media\py\cleanup.py"   # stops only what the demo started
}
