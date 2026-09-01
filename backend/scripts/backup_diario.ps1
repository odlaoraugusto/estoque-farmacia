# Backup diario do banco Postgres. Agendado via Agendador de Tarefas do
# Windows para rodar as 19:00 todo dia - ver docs/03_DEPLOY.md secao 6 para
# a recomendacao de producao (destino num disco/pasta de rede SEPARADA do
# servidor principal; ajustar $backupDir antes de agendar de verdade num
# servidor real - aqui aponta pra propria pasta do projeto, usado assim so
# na rodada de teste local).
#
# Le usuario/senha/host/porta/banco direto do backend/.env (nunca
# versionado - ver backend/.gitignore) em vez de hardcode, pra este script
# poder ser commitado no repositorio sem expor credencial nenhuma.

$ErrorActionPreference = "Stop"

$backendDir = "C:\Users\suporte1\Documents\Nova pasta\ESTOQUE-FARMACIA\backend"
$backupDir = "C:\Backups\EstoqueFarmacia"
New-Item -ItemType Directory -Force -Path $backupDir | Out-Null

$pgDump = "C:\Program Files\PostgreSQL\17\bin\pg_dump.exe"

$envPath = "$backendDir\.env"
if (-not (Test-Path $envPath)) {
    throw "Nao encontrei $envPath - configure o .env do backend antes de rodar o backup."
}
$databaseUrl = (Get-Content $envPath | Where-Object { $_ -match "^DATABASE_URL=" }) -replace "^DATABASE_URL=", ""
if ($databaseUrl -notmatch "postgresql\+psycopg2://([^:]+):([^@]+)@([^:/]+):(\d+)/(.+)$") {
    throw "Nao consegui interpretar DATABASE_URL do .env - formato esperado: postgresql+psycopg2://usuario:senha@host:porta/banco"
}
$dbUser = $Matches[1]
$dbPassword = $Matches[2]
$dbHost = $Matches[3]
$dbPort = $Matches[4]
$dbName = $Matches[5]

$env:PGPASSWORD = $dbPassword

$data = Get-Date -Format "yyyy-MM-dd_HHmm"
$outFile = "$backupDir\estoque_farmacia_$data.dump"

& $pgDump -Fc -h $dbHost -p $dbPort -U $dbUser -f $outFile $dbName

if ($LASTEXITCODE -ne 0) {
    throw "pg_dump falhou com codigo $LASTEXITCODE"
}

Write-Output "Backup criado: $outFile"

# Mantem so os ultimos 30 dumps (evita crescer sem limite na mesma pasta).
Get-ChildItem "$backupDir\*.dump" | Sort-Object LastWriteTime -Descending | Select-Object -Skip 30 | Remove-Item -Force
