$ErrorActionPreference='Stop'
Set-Location -LiteralPath $PSScriptRoot
if(-not (Test-Path -LiteralPath '.env')){throw 'Run .\setup.ps1 first.'}
if(-not (Test-Path -LiteralPath 'node_modules/next')){throw 'Setup did not finish installing dependencies. Run .\setup.ps1 first.'}
docker compose up -d --wait
if($LASTEXITCODE -ne 0){throw 'Docker containers did not start.'}
npm run dev
