# A bare video window for the live-captions scene (made-up video with made-up subtitles). It shows a poster picture (the first frame)
# and starts playing when the file <Flag> appears. Usage: powershell -STA -File video-window.ps1 -Video <mp4> -Poster <png> -Flag <path> -X <px> -Y <px> -W <px> -H <px>
param([Parameter(Mandatory)][string]$Video, [Parameter(Mandatory)][string]$Poster, [Parameter(Mandatory)][string]$Flag, [int]$X = 100, [int]$Y = 100, [int]$W = 1040, [int]$H = 585)
Add-Type -AssemblyName PresentationFramework, PresentationCore, WindowsBase
$vuri = ([Uri]$Video).AbsoluteUri
$puri = ([Uri]$Poster).AbsoluteUri
$xaml = @"
<Window xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation" xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml" Title="owll-demo-video"
        WindowStyle="None" ResizeMode="NoResize" ShowInTaskbar="False" Left="$X" Top="$Y" Width="$W" Height="$H" Background="#111111" BorderBrush="#444" BorderThickness="1">
  <Grid>
    <MediaElement x:Name="v" LoadedBehavior="Manual" UnloadedBehavior="Manual" Stretch="Uniform"/>
    <Image x:Name="p" Stretch="Uniform"/>
  </Grid>
</Window>
"@
$win = [Windows.Markup.XamlReader]::Parse($xaml)
$v = $win.FindName("v")
$p = $win.FindName("p")
$bmp = New-Object Windows.Media.Imaging.BitmapImage
$bmp.BeginInit(); $bmp.UriSource = [Uri]$puri; $bmp.CacheOption = [Windows.Media.Imaging.BitmapCacheOption]::OnLoad; $bmp.EndInit()
$p.Source = $bmp
$v.Source = [Uri]$vuri
$started = $false
$timer = New-Object Windows.Threading.DispatcherTimer
$timer.Interval = [TimeSpan]::FromMilliseconds(100)
$timer.Add_Tick({ if (-not $started -and (Test-Path $Flag)) { $started = $true; $v.Play(); $hide = New-Object Windows.Threading.DispatcherTimer; $hide.Interval = [TimeSpan]::FromMilliseconds(250); $hide.Add_Tick({ $hide.Stop(); $p.Visibility = "Collapsed" }); $hide.Start() } })
$timer.Start()
$v.Add_MediaEnded({ $v.Stop() })
$win.Add_KeyDown({ if ($_.Key -eq "Escape") { $win.Close() } })
[void]$win.ShowDialog()
