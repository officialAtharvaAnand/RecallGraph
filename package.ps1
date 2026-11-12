param([Parameter(Mandatory = $true)][string]$OutputPath)
$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$destination = [IO.Path]::GetFullPath($OutputPath)
if (-not (Test-Path -LiteralPath ([IO.Path]::GetDirectoryName($destination)))) {
  New-Item -ItemType Directory -Force -Path ([IO.Path]::GetDirectoryName($destination)) | Out-Null
}
Add-Type -AssemblyName System.IO.Compression
$stream = [IO.File]::Open($destination, [IO.FileMode]::Create)
try {
  $archive = New-Object IO.Compression.ZipArchive($stream, [IO.Compression.ZipArchiveMode]::Create)
  try {
    Get-ChildItem -LiteralPath $root -File -Recurse | ForEach-Object {
      $relative = $_.FullName.Substring($root.Length + 1).Replace('\', '/')
      if ($relative -match '(^|/)(node_modules|\.next|\.git|coverage)(/|$)' -or
          $relative -match '(^|/)\.env($|\.)' -and $relative -ne '.env.example' -or
          $relative -match '^docs/test-results/.*\.tmp$') {
        return
      }
      $entry = $archive.CreateEntry("recallgraph/$relative", [IO.Compression.CompressionLevel]::Optimal)
      $source = [IO.File]::OpenRead($_.FullName)
      $target = $entry.Open()
      try { $source.CopyTo($target) } finally { $target.Dispose(); $source.Dispose() }
    }
  } finally { $archive.Dispose() }
} finally { $stream.Dispose() }
Write-Output "Created $destination"
