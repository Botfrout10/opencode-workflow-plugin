$ErrorActionPreference = "SilentlyContinue"

$toplevel = (git rev-parse --show-toplevel 2>$null).Trim()
if (-not $toplevel) { exit 0 }

# Guard: never touch the outer dotfiles repo (C:\Users\mehdi)
if ($toplevel -eq "C:\Users\mehdi") { exit 0 }

# Only act when the current directory is inside this project's repo
$cwd = (Get-Location).Path
if (-not $cwd.StartsWith($toplevel)) { exit 0 }

# Only commit when there is a diff (working tree or staged)
git diff --quiet 2>$null; $d = $LASTEXITCODE
git diff --cached --quiet 2>$null; $s = $LASTEXITCODE
if ($d -eq 0 -and $s -eq 0) { exit 0 }

$timestamp = Get-Date -Format "yyyy-MM-dd HH:mm"
git add -A
git commit -m "chore: opencode session changes ($timestamp)" 2>$null
