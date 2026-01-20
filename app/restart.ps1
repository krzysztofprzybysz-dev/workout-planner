Write-Host "=== Restarting Workout Planner App ===" -ForegroundColor Cyan

Write-Host "Stopping existing processes..." -ForegroundColor Yellow

# Kill processes on ports 3000-3004
foreach ($port in 3000..3004) {
    $connections = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue
    if ($connections) {
        $pids = $connections.OwningProcess | Where-Object { $_ -ne 0 } | Select-Object -Unique
        foreach ($p in $pids) {
            Write-Host "Killing process on port $port (PID: $p)"
            Stop-Process -Id $p -Force -ErrorAction SilentlyContinue
        }
    }
}

Write-Host "Waiting for ports to be released..." -ForegroundColor Yellow
Start-Sleep -Seconds 2

Write-Host "Starting application..." -ForegroundColor Green
Set-Location $PSScriptRoot
npm run dev
