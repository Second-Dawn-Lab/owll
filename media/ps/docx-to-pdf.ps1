# Exports a .docx to PDF with Word running invisibly (no window, so no account name on screen; the file is not added to the recent list).
# Usage: powershell -File docx-to-pdf.ps1 -Docx <path> -Pdf <path>
param([Parameter(Mandatory)][string]$Docx, [Parameter(Mandatory)][string]$Pdf)
$word = New-Object -ComObject Word.Application
$word.Visible = $false
$word.DisplayAlerts = 0
try {
  $doc = $word.Documents.Open($Docx, $false, $true, $false)
  $doc.ExportAsFixedFormat($Pdf, 17)
  $doc.Close(0)
} finally {
  $word.Quit()
}
