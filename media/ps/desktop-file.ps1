# A "file on the desktop" for the Documents scene: a small icon with a name that really starts a Windows drag-and-drop
# of the file when you drag it (so Owl-L receives a genuine file drop). Usage: powershell -STA -File desktop-file.ps1 -File <path> -X <px> -Y <px>
param([Parameter(Mandatory)][string]$File, [int]$X = 100, [int]$Y = 100, [string]$Label = "")
Add-Type -AssemblyName PresentationFramework, PresentationCore, WindowsBase
if ($Label -eq "") { $Label = [IO.Path]::GetFileName($File) }
$xaml = @"
<Window xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation" Title="owll-demo-file" WindowStyle="None"
        AllowsTransparency="True" Background="Transparent" ShowInTaskbar="False" ResizeMode="NoResize" Width="150" Height="170"
        Left="$X" Top="$Y" Topmost="False">
  <StackPanel HorizontalAlignment="Center" VerticalAlignment="Top" Margin="0,8,0,0">
    <Grid Width="84" Height="104">
      <Path Fill="White" Stroke="#B9BED0" StrokeThickness="2" Data="M 4,2 L 58,2 L 80,24 L 80,100 L 4,100 Z"/>
      <Path Fill="#DADDEA" Stroke="#B9BED0" StrokeThickness="2" Data="M 58,2 L 58,24 L 80,24 Z"/>
      <Border VerticalAlignment="Bottom" Margin="4,0,4,16" Height="34" Background="#2B579A" CornerRadius="3">
        <TextBlock Text="DOCX" Foreground="White" FontWeight="Bold" FontSize="17" FontFamily="Segoe UI" HorizontalAlignment="Center" VerticalAlignment="Center"/>
      </Border>
    </Grid>
    <TextBlock Text="$Label" Margin="0,8,0,0" TextAlignment="Center" TextWrapping="Wrap" FontFamily="Segoe UI" FontSize="14" Foreground="#23252E" MaxWidth="140"/>
  </StackPanel>
</Window>
"@
$win = [Windows.Markup.XamlReader]::Parse($xaml)
$win.Add_MouseLeftButtonDown({
  $data = New-Object Windows.DataObject
  $data.SetData([Windows.DataFormats]::FileDrop, [string[]]@($File))
  [void][Windows.DragDrop]::DoDragDrop($win, $data, [Windows.DragDropEffects]::Copy)
})
$win.Add_KeyDown({ if ($_.Key -eq "Escape") { $win.Close() } })
[void]$win.ShowDialog()
