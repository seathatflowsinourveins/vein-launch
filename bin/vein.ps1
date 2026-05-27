#Requires -Version 7.0
<#
.SYNOPSIS
  vein-launch — SOTA Claude Code launcher
.DESCRIPTION
  Prechecks environment health, manages CLIProxy/RTK/tools, launches Claude.
.EXAMPLE
  vein trading        # Launch trading project (fast mode)
  vein trading --deep # Full precheck with network validation
  vein --setup        # First-time setup wizard
#>
[CmdletBinding()]
param(
  [Parameter(Position = 0)]
  [string]$Project,

  [Alias('d')]
  [switch]$Deep,

  [Alias('r')]
  [switch]$Repair,

  [switch]$Setup,

  [switch]$Status,

  [switch]$Projects,

  [Alias('a')]
  [switch]$Accounts,

  [switch]$Manifest,

  [switch]$Ci,

  [switch]$Version,

  [switch]$Help,

  [Parameter(ValueFromRemainingArguments)]
  [string[]]$PassThrough
)

$ErrorActionPreference = 'Stop'
$ScriptRoot = $PSScriptRoot
$RepoRoot = Split-Path $ScriptRoot -Parent

if ($Version) {
  $pkg = Get-Content (Join-Path $RepoRoot 'package.json') | ConvertFrom-Json
  Write-Host "vein-launch v$($pkg.version)"
  exit 0
}

if ($Help) {
  Get-Help $PSCommandPath -Detailed
  exit 0
}

# Determine mode
$mode = 'fast'
if ($Repair) { $mode = 'repair' }
elseif ($Deep) { $mode = 'deep' }

# Delegate to Node orchestrator
$orchestrator = Join-Path $RepoRoot 'src' 'cli.mjs'
$nodeArgs = @($orchestrator)

if ($Setup) { $nodeArgs += '--setup' }
elseif ($Status) { $nodeArgs += '--status' }
elseif ($Projects) { $nodeArgs += '--projects' }
elseif ($Accounts) { $nodeArgs += '--accounts' }
elseif ($Manifest) { $nodeArgs += '--manifest' }
else {
  if ($Project) { $nodeArgs += $Project }
  $nodeArgs += "--mode=$mode"
  if ($PassThrough) { $nodeArgs += $PassThrough }
}

if ($Ci) { $nodeArgs += '--ci' }

& node @nodeArgs
exit $LASTEXITCODE
