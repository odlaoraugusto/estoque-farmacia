# Sobe o ambiente de teste local inteiro (Postgres portatil + backend) numa
# tacada so - util porque, nesta maquina, nem Postgres nem o backend sao
# servico do Windows ainda (ver docs/HANDOFF_BANCO_DADOS.md), entao os dois
# caem sempre que o computador reinicia e precisam ser religados na mao.
#
# Uso: clique duas vezes, ou rode "powershell -ExecutionPolicy Bypass -File iniciar_ambiente_local.ps1"
#
# Isto e so para ESTA maquina de teste. No servidor oficial (ver
# docs/GUIA_IMPLANTACAO_SERVIDOR.md), Postgres e o backend sobem sozinhos
# como servico do Windows (instalador oficial + NSSM) - esse script nao e
# necessario la.

$ErrorActionPreference = "Stop"

$pgBin = "C:\Users\odlaoralmeida\Desktop\pgportable\pgsql\bin"
$pgData = "C:\Users\odlaoralmeida\Desktop\pgportable\data"
$backendDir = "C:\Users\odlaoralmeida\Desktop\ESTOQUE FARMACIA\backend"

Write-Host "== Estoque Farmacia - subindo ambiente local ==" -ForegroundColor Cyan

# --- PostgreSQL ---
& "$pgBin\pg_isready.exe" -p 5432 2>&1 | Out-Null
if ($LASTEXITCODE -eq 0) {
    Write-Host "[Postgres] ja esta rodando." -ForegroundColor Green
} else {
    Write-Host "[Postgres] iniciando..." -ForegroundColor Yellow
    & "$pgBin\pg_ctl.exe" -D $pgData -l "C:\Users\odlaoralmeida\Desktop\pgportable\pg.log" start
    Start-Sleep -Seconds 3
    & "$pgBin\pg_isready.exe" -p 5432
    if ($LASTEXITCODE -ne 0) {
        throw "Postgres nao subiu - ver C:\Users\odlaoralmeida\Desktop\pgportable\pg.log"
    }
    Write-Host "[Postgres] no ar." -ForegroundColor Green
}

# --- Backend ---
$backendNoAr = $false
try {
    Invoke-WebRequest -Uri "http://127.0.0.1:8000/docs" -UseBasicParsing -TimeoutSec 3 | Out-Null
    $backendNoAr = $true
} catch {
    $backendNoAr = $false
}

if ($backendNoAr) {
    Write-Host "[Backend] ja esta rodando (porta 8000)." -ForegroundColor Green
} else {
    Write-Host "[Backend] iniciando..." -ForegroundColor Yellow
    Start-Process -FilePath "$backendDir\.venv\Scripts\python.exe" `
        -ArgumentList "-m uvicorn app.main:app --host 0.0.0.0 --port 8000" `
        -WorkingDirectory $backendDir `
        -RedirectStandardOutput "C:\Users\odlaoralmeida\Desktop\uvicorn_out.log" `
        -RedirectStandardError "C:\Users\odlaoralmeida\Desktop\uvicorn_err.log" `
        -WindowStyle Hidden
    Start-Sleep -Seconds 4
    try {
        Invoke-WebRequest -Uri "http://127.0.0.1:8000/docs" -UseBasicParsing -TimeoutSec 5 | Out-Null
        Write-Host "[Backend] no ar." -ForegroundColor Green
    } catch {
        throw "Backend nao respondeu - ver C:\Users\odlaoralmeida\Desktop\uvicorn_err.log"
    }
}

Write-Host ""
Write-Host "Tudo pronto:" -ForegroundColor Cyan
Write-Host "  Backend:  http://localhost:8000/docs"
Write-Host "  Frontend: rodar 'npm run dev' na pasta frontend/ separadamente (ambiente de teste, nao e servico)"
