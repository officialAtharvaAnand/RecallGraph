$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath (Join-Path $PSScriptRoot '..')
Write-Output "Security/quality scan UTC: $([DateTime]::UtcNow.ToString('o'))"

$legacy = @(rg -n -i 'change-me|DemoAdmin|DemoAnalyst' --hidden -g '!node_modules/**' -g '!.next/**' -g '!.env' -g '!scripts/security-scan.ps1' -g '!docs/test-results/**' .)
Write-Output "Legacy literal credential pattern matches: $($legacy.Count)"
$legacy

$meta = @(rg -n -i 'to be filled|must run|starter repository' docs)
Write-Output "Template/meta phrase matches in docs: $($meta.Count)"
$meta

$placeholders = @(rg -n 'CHANGE_ME' .env.example)
Write-Output "Explicit .env.example placeholder lines: $($placeholders.Count)"

$routes = @(rg --files app/api -g 'route.ts')
Write-Output "Route Handler files: $($routes.Count)"
foreach ($route in $routes) {
  $source = Get-Content -LiteralPath $route -Raw
  $role = if ($route -match 'app[\\/]api[\\/]auth[\\/]') { 'public auth/session' }
    elseif ($source -match "requireUser\('admin'\)") { 'admin' }
    elseif ($source -match 'requireUser\(') { 'signed-in user' }
    else { 'MISSING AUTH CHECK' }
  Write-Output "$route -> $role"
}

$paths = @(rg --files --hidden -g '!node_modules/**' -g '!.next/**' -g '!.env' -g '!*.png' -g '!*.svg' -g '!docs/test-results/*.txt')
Write-Output "Text files over 300 lines:"
foreach ($path in $paths) {
  $count = (Get-Content -LiteralPath $path -ErrorAction SilentlyContinue | Measure-Object -Line).Lines
  if ($count -gt 300) { Write-Output "$path : $count" }
}
