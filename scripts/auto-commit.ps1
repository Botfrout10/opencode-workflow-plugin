$ErrorActionPreference = "SilentlyContinue"

function New-DiffMessage {
  param([string]$Root)

  $status = (git -C $Root status --porcelain -uall 2>$null)
  if (-not $status) { return "chore: update working tree" }

  $files = @()
  $adds = 0; $mods = 0; $dels = 0; $renames = 0
  foreach ($line in ($status -split "\r?\n")) {
    if (-not $line.Trim()) { continue }
    $code = $line.Substring(0, 2)
    $p = $line.Substring(3).Trim()
    if ($p -match ' -> ') { $p = ($p -split ' -> ')[-1].Trim(); $renames++ }
    $files += $p
    if ($code -match 'A') { $adds++ }
    elseif ($code -match 'D') { $dels++ }
    elseif ($code -match '\?') { $adds++ }
    else { $mods++ }
  }

  $low = @($files | ForEach-Object { $_.ToLower() })
  $all = { param($f) (($low | Where-Object { & $f $_ }).Count) -eq $low.Count }

  $isDocs  = & $all { param($x) $x -match '\.(md|mdx|txt)$' -or $x -match '(^|/)docs/' }
  $isTest  = & $all { param($x) $x -match '(^|/)(test|tests|spec|__tests__)/' -or $x -match '\.(test|spec)\.[^.]+$' }
  $isCfg   = & $all { param($x) $x -match '\.(json|jsonc|toml|yaml|yml|ini|env|lock|config\.[^/]+)$' -or $x -match '(^|/)(\.github|\.vscode|configs?)/' -or $x -match 'package\.json$' }
  $isStyle = & $all { param($x) $x -match '\.(css|scss|sass|less|styled)$' }

  $type = "chore"
  if ($isDocs) { $type = "docs" }
  elseif ($isTest) { $type = "test" }
  elseif ($isCfg) { $type = "chore" }
  elseif ($isStyle) { $type = "style" }
    else {
      if ($adds -gt 0 -and $dels -eq 0 -and $mods -eq 0) { $type = "feat" }
      else {
        $num = (git -C $Root diff HEAD --numstat 2>$null)
        $a = 0; $d = 0
        foreach ($l in ($num -split "`n")) {
          $parts = $l -split "`t"
          if ($parts.Count -ge 2) { $a += [int]($parts[0] -replace '\D', '0'); $d += [int]($parts[1] -replace '\D', '0') }
        }
        if ($renames -gt 0 -and $adds -eq 0 -and $mods -eq 0 -and $dels -eq 0) { $type = "refactor" }
        elseif ($a -gt 0 -and $d -eq 0) { $type = "feat" }
        elseif ($d -gt $a * 1.5) { $type = "fix" }
        else { $type = "fix" }
      }
    }

  if ($adds -gt 0 -and $mods -eq 0 -and $dels -eq 0 -and $renames -eq 0) { $verb = "add" }
  elseif ($dels -gt 0 -and $adds -eq 0 -and $mods -eq 0 -and $renames -eq 0) { $verb = "remove" }
  elseif ($renames -gt 0 -and $adds -eq 0 -and $mods -eq 0 -and $dels -eq 0) { $verb = "rename" }
  else { $verb = "update" }

  function Humanize($p) {
    $n = ($p -split '/')[-1]
    $n = $n -replace '\.[^.]+$', ''
    $n = $n -replace '[-_]', ' '
    return $n
  }

  $names = @($files | ForEach-Object { Humanize $_ })
  $scope = if ($files[0] -match '/') { ($files[0] -split '/')[0] } else { "" }

  if ($names.Count -eq 1) { $desc = "$verb $($names[0])" }
  elseif ($names.Count -le 3) { $desc = "$verb " + (($names -join ', ') -replace ', ([^,]*)$', ' and $1') }
  else { $desc = "$verb $($names.Count) files ($($names[0]), $($names[1]), …)" }

  $head = if ($scope) { "${scope}:" } else { "" }
  $msg = "${type}: $head$desc"
  if ($msg.Length -gt 72) { $msg = $msg.Substring(0, 71).TrimEnd() + "…" }
  return $msg
}

$toplevel = (git rev-parse --show-toplevel 2>$null).Trim() -replace '/', '\'
if (-not $toplevel) { exit 0 }

# Guard: never touch the outer dotfiles repo (C:\Users\mehdi)
if ($toplevel -eq "C:\Users\mehdi") { exit 0 }

# Only act when the current directory is inside this project's repo
$cwd = (Get-Location).Path
if (-not $cwd.StartsWith($toplevel)) { exit 0 }

# Only commit when there is any change (tracked, staged, or untracked)
$anyChange = (git -C $toplevel status --porcelain 2>$null)
if (-not $anyChange) { exit 0 }

# 1) Prefer an agent-authored message written during the turn
$msgFile = Join-Path $toplevel ".git\OC_COMMIT_MSG"
$message = $null
if (Test-Path $msgFile) {
  $candidate = (Get-Content -Raw $msgFile -ErrorAction SilentlyContinue).Trim()
  if ($candidate) { $message = $candidate }
  Remove-Item $msgFile -Force -ErrorAction SilentlyContinue
}

# 2) Fallback: build a short conventional message from the diff
if (-not $message) {
  $message = New-DiffMessage $toplevel
}

git add -A
git commit -m $message 2>$null
