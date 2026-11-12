param(
  [string]$AdminPassword,
  [string]$AnalystPassword,
  [ValidateRange(1, 65535)][int]$PostgresPort = 5432,
  [ValidateRange(1, 65535)][int]$Neo4jBoltPort = 7687,
  [ValidateRange(1, 65535)][int]$Neo4jHttpPort = 7474,
  [switch]$FreshInstance
)

$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot

foreach ($command in @('docker', 'node', 'npm')) {
  if (-not (Get-Command $command -ErrorAction SilentlyContinue)) {
    throw "$command is required. Install Node.js 20+ and start Docker Desktop."
  }
}

function New-RandomHex([int]$byteCount) {
  $bytes = New-Object byte[] $byteCount
  $generator = [Security.Cryptography.RandomNumberGenerator]::Create()
  try { $generator.GetBytes($bytes) } finally { $generator.Dispose() }
  return [BitConverter]::ToString($bytes).Replace('-', '')
}

function Get-FreePort([int]$preferred) {
  # Docker Desktop can own a published port even when a sandboxed socket probe succeeds.
  $published = @(docker ps --format '{{.Ports}}')
  if ($LASTEXITCODE -ne 0) { throw 'Cannot inspect Docker published ports.' }
  for ($port = $preferred; $port -le 65535; $port += 10000) {
    if (@($published | Where-Object { $_ -match ":${port}->" }).Count -gt 0) { continue }
    $listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, $port)
    try {
      $listener.Start()
      return $port
    } catch [Net.Sockets.SocketException] {
      # Try the next host port.
    } finally { $listener.Stop() }
  }
  throw "No available host port found starting at $preferred"
}

function Read-DotEnv {
  $settings = @{}
  foreach ($line in (Get-Content -LiteralPath '.env')) {
    if ($line -match '^([A-Z][A-Z0-9_]*)=(.*)$') { $settings[$matches[1]] = $matches[2] }
  }
  return $settings
}

if (-not (Test-Path -LiteralPath '.env')) {
  $PostgresPort = Get-FreePort $PostgresPort
  $Neo4jBoltPort = Get-FreePort $Neo4jBoltPort
  $Neo4jHttpPort = Get-FreePort $Neo4jHttpPort
  $projectName = 'recallgraph_' + (New-RandomHex 4).ToLowerInvariant()
  $postgresPassword = New-RandomHex 24
  $neo4jPassword = New-RandomHex 24
  $jwtSecret = New-RandomHex 32
  @(
    'POSTGRES_DB=recallgraph',
    'POSTGRES_USER=recallgraph',
    "POSTGRES_PASSWORD=$postgresPassword",
    "POSTGRES_PORT=$PostgresPort",
    "DATABASE_URL=postgresql://recallgraph:${postgresPassword}@127.0.0.1:$PostgresPort/recallgraph",
    'NEO4J_USER=neo4j',
    "NEO4J_PASSWORD=$neo4jPassword",
    "NEO4J_HTTP_PORT=$Neo4jHttpPort",
    "NEO4J_BOLT_PORT=$Neo4jBoltPort",
    "NEO4J_URI=bolt://127.0.0.1:$Neo4jBoltPort",
    "JWT_SECRET=$jwtSecret",
    "COMPOSE_PROJECT_NAME=$projectName"
  ) | Set-Content -LiteralPath '.env'
  Write-Host 'Created .env with random local database credentials.'
} elseif ($FreshInstance) {
  $settings = Read-DotEnv
  foreach ($name in @('POSTGRES_DB', 'POSTGRES_USER', 'POSTGRES_PASSWORD', 'NEO4J_USER', 'NEO4J_PASSWORD')) {
    if (-not $settings[$name]) { throw "Missing $name in .env" }
  }
  $PostgresPort = Get-FreePort $PostgresPort
  $Neo4jBoltPort = Get-FreePort $Neo4jBoltPort
  $Neo4jHttpPort = Get-FreePort $Neo4jHttpPort
  $projectName = 'recallgraph_' + (New-RandomHex 4).ToLowerInvariant()
  $preserved = @(Get-Content -LiteralPath '.env' | Where-Object {
    $_ -notmatch '^(POSTGRES_PORT|DATABASE_URL|NEO4J_HTTP_PORT|NEO4J_BOLT_PORT|NEO4J_URI|COMPOSE_PROJECT_NAME)='
  })
  $preserved += @(
    "POSTGRES_PORT=$PostgresPort",
    "DATABASE_URL=postgresql://$($settings.POSTGRES_USER):$($settings.POSTGRES_PASSWORD)@127.0.0.1:$PostgresPort/$($settings.POSTGRES_DB)",
    "NEO4J_HTTP_PORT=$Neo4jHttpPort",
    "NEO4J_BOLT_PORT=$Neo4jBoltPort",
    "NEO4J_URI=bolt://127.0.0.1:$Neo4jBoltPort",
    "COMPOSE_PROJECT_NAME=$projectName"
  )
  $preserved | Set-Content -LiteralPath '.env'
  Write-Host 'Selected a fresh isolated Docker project; existing volumes remain untouched.'
}

if (-not $AdminPassword) { $AdminPassword = New-RandomHex 16 }
if (-not $AnalystPassword) { $AnalystPassword = New-RandomHex 16 }

docker compose up -d --wait
if ($LASTEXITCODE -ne 0) { throw 'Docker services did not become healthy. Check docker compose logs. If an older volume has different credentials, rerun setup.ps1 -FreshInstance to preserve it and create new volumes.' }

npm ci
if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed.' }

node --env-file=.env scripts/migrate.mjs
if ($LASTEXITCODE -ne 0) { throw 'PostgreSQL migration failed.' }

node --env-file=.env scripts/init-graph.mjs
if ($LASTEXITCODE -ne 0) { throw 'Neo4j initialization failed.' }

node --env-file=.env scripts/create-user.mjs admin@recallgraph.local $AdminPassword admin
if ($LASTEXITCODE -ne 0) { throw 'Admin account creation failed.' }
node --env-file=.env scripts/create-user.mjs analyst@recallgraph.local $AnalystPassword analyst
if ($LASTEXITCODE -ne 0) { throw 'Analyst account creation failed.' }

node --env-file=.env scripts/seed-demo.mjs
if ($LASTEXITCODE -ne 0) { throw 'Demo data creation failed.' }
node --env-file=.env scripts/resync-graph.mjs
if ($LASTEXITCODE -ne 0) { throw 'Initial graph projection failed.' }

Write-Host ''
Write-Host 'Setup complete. Save these demo credentials now; they are not stored in the project:'
Write-Host 'Admin email: admin@recallgraph.local'
Write-Host "Admin password: $AdminPassword"
Write-Host 'Analyst email: analyst@recallgraph.local'
Write-Host "Analyst password: $AnalystPassword"
Write-Host 'Then run .\start.ps1 and open http://localhost:3000/'
