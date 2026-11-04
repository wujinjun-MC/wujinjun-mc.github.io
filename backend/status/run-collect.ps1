# Collect live status from the local machine and publish it to the repository.
#
# Scheduled by Windows Task Scheduler every 15 minutes. Requires:
#   - node on PATH
#   - git credentials that can push to origin without prompting
#   - backend/status/.env with DEEPSEEK_API_KEY
#   - ~/.codex/auth.json created by "codex login"

$ErrorActionPreference = "Stop"
$repo = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
Set-Location $repo

$logPath = Join-Path $PSScriptRoot ".collect.log"

function Write-Log {
    param([string]$Message)
    $line = "[{0}] {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $Message
    try {
        Add-Content -Path $logPath -Value $line -Encoding UTF8
    } catch {
        # Logging must never break the collection run.
    }
    Write-Output $line
}

try {
    if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
        throw "node was not found on PATH"
    }

    $envFile = Join-Path $PSScriptRoot ".env"
    if (Test-Path $envFile) {
        Get-Content $envFile | ForEach-Object {
            $line = $_.Trim()
            if (-not $line -or $line.StartsWith("#")) { return }
            $index = $line.IndexOf("=")
            if ($index -lt 1) { return }
            $key = $line.Substring(0, $index).Trim()
            $value = $line.Substring($index + 1).Trim().Trim('"').Trim("'")
            [Environment]::SetEnvironmentVariable($key, $value, "Process")
        }
    }

    # Never autostash unrelated work: skip instead of touching the user's edits.
    $dirty = @(git status --porcelain --untracked-files=all 2>$null)
    $unrelated = @($dirty | Where-Object { $_ -notmatch "data/status\.json" })
    if ($unrelated.Count -gt 0) {
        Write-Log "Skipping: working tree has unrelated changes. Commit or stash them first."
        exit 0
    }

    git pull --rebase --autostash | Out-Null
    if ($LASTEXITCODE -ne 0) {
        throw "git pull failed"
    }

    node (Join-Path $PSScriptRoot "collect.mjs")
    if ($LASTEXITCODE -ne 0) {
        throw "collector exited with code $LASTEXITCODE"
    }

    $changes = @(git status --porcelain -- data/status.json)
    if ($changes.Count -eq 0) {
        Write-Log "No status change."
        exit 0
    }

    git add -- data/status.json
    git commit -m "chore(status): update live status" | Out-Null
    if ($LASTEXITCODE -ne 0) {
        throw "git commit failed"
    }

    for ($attempt = 1; $attempt -le 3; $attempt++) {
        git push | Out-Null
        if ($LASTEXITCODE -eq 0) {
            Write-Log "Pushed status snapshot."
            exit 0
        }
        Write-Log "Push failed; pulling and retrying ($attempt/3)."
        Start-Sleep -Seconds 5
        git pull --rebase --autostash | Out-Null
    }

    throw "git push failed after 3 attempts"
} catch {
    Write-Log ("ERROR: " + $_.Exception.Message)
    exit 1
}
