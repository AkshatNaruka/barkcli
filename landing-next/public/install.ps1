# barkcli — Windows Install script (PowerShell)
# Usage:
#   irm https://barkcli.vercel.app/install.ps1 | iex
#   irm https://github.com/AkshatNaruka/barkcli/releases/latest/download/install.ps1 | iex
# Options:
#   $env:BARKCLI_VERSION = "v0.2.0"
#   $env:BARKCLI_INSTALL_DIR = "C:\tools\barkcli"
#   & install.ps1 -Version v0.2.0 -InstallDir "C:\tools\barkcli"

param(
    [string]$Version = $env:BARKCLI_VERSION,
    [string]$InstallDir = $env:BARKCLI_INSTALL_DIR
)

$ErrorActionPreference = "Stop"
$Repo = if ($env:GITHUB_REPO) { $env:GITHUB_REPO } else { "AkshatNaruka/barkcli" }

# Normalize version (ensure leading v)
if ($Version -and -not $Version.StartsWith("v")) {
    $Version = "v$Version"
}

# Detect arch
$Arch = $env:PROCESSOR_ARCHITECTURE
if ($Arch -eq "AMD64" -or $Arch -eq "x86_64" -or $Arch -eq "EM64T") {
    $ArchTarget = "x86_64"
} elseif ($Arch -eq "ARM64") {
    $ArchTarget = "aarch64"
} else {
    Write-Host "Unsupported architecture: $Arch" -ForegroundColor Red
    Write-Host "Supported: AMD64 (x86_64), ARM64"
    exit 1
}

$Target = "$ArchTarget-pc-windows-msvc"
$Archive = "barkcli-$Target.zip"

if ($Version) {
    $GithubUrl = "https://github.com/$Repo/releases/download/$Version/$Archive"
    $VercelUrl = "https://barkcli.vercel.app/downloads/$Archive"
    Write-Host "Version: $Version"
} else {
    $GithubUrl = "https://github.com/$Repo/releases/latest/download/$Archive"
    $VercelUrl = "https://barkcli.vercel.app/downloads/$Archive"
    Write-Host "Version: latest"
}

Write-Host "Detected: $Target (Arch=$Arch)"
Write-Host "Downloading barkcli for $Target..."

# Default install dir
if (-not $InstallDir -or $InstallDir -eq "") {
    # Prefer Cargo bin if exists, else LocalAppData
    $CargoBin = "$env:USERPROFILE\.cargo\bin"
    if (Test-Path $CargoBin) {
        $InstallDir = $CargoBin
    } else {
        $InstallDir = "$env:LOCALAPPDATA\barkcli\bin"
    }
}

$TempDir = Join-Path $env:TEMP "barkcli-install-$([Guid]::NewGuid().ToString().Substring(0,8))"
New-Item -ItemType Directory -Path $TempDir -Force | Out-Null
$ZipPath = Join-Path $TempDir $Archive

function Download-File($Url, $OutPath) {
    Write-Host "  -> $Url"
    try {
        # Use Invoke-WebRequest with retry
        $ProgressPreference = 'SilentlyContinue'
        Invoke-WebRequest -Uri $Url -OutFile $OutPath -UseBasicParsing -TimeoutSec 30
        return $true
    } catch {
        Write-Host "     failed: $_" -ForegroundColor Yellow
        return $false
    }
}

$downloaded = Download-File $GithubUrl $ZipPath
if (-not $downloaded) {
    Write-Host "GitHub download failed, trying Vercel mirror..." -ForegroundColor Yellow
    $downloaded = Download-File $VercelUrl $ZipPath
}

if (-not $downloaded) {
    Write-Host "" 
    Write-Host "No pre-built binary available for $Target." -ForegroundColor Red
    Write-Host "Tried:"
    Write-Host "  $GithubUrl"
    Write-Host "  $VercelUrl"
    Write-Host ""
    Write-Host "Alternatives:"
    Write-Host "  cargo install barkcli"
    Write-Host "  Download manually: https://github.com/$Repo/releases"
    Remove-Item -Recurse -Force $TempDir -ErrorAction SilentlyContinue
    exit 1
}

# Verify checksum if available
try {
    $ShaUrl = if ($Version) { "https://github.com/$Repo/releases/download/$Version/SHA256SUMS" } else { "https://github.com/$Repo/releases/latest/download/SHA256SUMS" }
    $ShaPath = Join-Path $TempDir "SHA256SUMS"
    Invoke-WebRequest -Uri $ShaUrl -OutFile $ShaPath -UseBasicParsing -TimeoutSec 10 -ErrorAction SilentlyContinue | Out-Null
    if (Test-Path $ShaPath) {
        $expected = (Select-String -Path $ShaPath -Pattern $Archive | ForEach-Object { $_.Line.Split()[0] } | Select-Object -First 1)
        if ($expected) {
            $actual = (Get-FileHash $ZipPath -Algorithm SHA256).Hash.ToLower()
            if ($actual -eq $expected.ToLower()) {
                Write-Host "Checksum verified ($Archive)." -ForegroundColor Green
            } else {
                Write-Host "Checksum MISMATCH for $Archive!" -ForegroundColor Red
                Write-Host "  expected: $expected" -ForegroundColor Red
                Write-Host "  actual:   $actual" -ForegroundColor Red
                Write-Host "The download may be corrupted or tampered with. Aborting." -ForegroundColor Red
                Remove-Item -Recurse -Force $TempDir -ErrorAction SilentlyContinue
                exit 1
            }
        }
    }
} catch {}

# Extract
Write-Host "Extracting..."
try {
    Expand-Archive -Path $ZipPath -DestinationPath $TempDir -Force
} catch {
    Write-Host "Extraction failed: $_" -ForegroundColor Red
    Remove-Item -Recurse -Force $TempDir -ErrorAction SilentlyContinue
    exit 1
}

$BinSource = Get-ChildItem -Path $TempDir -Recurse -Filter "barkcli.exe" | Select-Object -First 1
if (-not $BinSource) {
    Write-Host "barkcli.exe not found in archive." -ForegroundColor Red
    Remove-Item -Recurse -Force $TempDir -ErrorAction SilentlyContinue
    exit 1
}

New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
$BinDest = Join-Path $InstallDir "barkcli.exe"
Copy-Item -Path $BinSource.FullName -Destination $BinDest -Force

# Remove the Mark-of-the-Web (Zone.Identifier) so Windows Defender
# SmartScreen doesn't flag the binary on first run. A user-consented
# `irm | iex` install makes this the standard, safe practice.
try { Unblock-File -Path $BinDest -ErrorAction SilentlyContinue } catch {}

Write-Host "barkcli installed to $BinDest" -ForegroundColor Green
Write-Host "Note: on first run Windows SmartScreen may still ask for confirmation" -ForegroundColor Yellow
Write-Host "because the binary isn't EV code-signed. Click 'More info' -> 'Run anyway'." -ForegroundColor Yellow

# Add to PATH if not already
$CurrentPath = [Environment]::GetEnvironmentVariable("Path", "User")
if ($CurrentPath -notlike "*$InstallDir*") {
    Write-Host ""
    Write-Host "Note: $InstallDir is not on your PATH." -ForegroundColor Yellow
    try {
        [Environment]::SetEnvironmentVariable("Path", "$CurrentPath;$InstallDir", "User")
        Write-Host "Added $InstallDir to user PATH. Restart your terminal to use 'barkcli'." -ForegroundColor Green
        $env:Path += ";$InstallDir"
    } catch {
        Write-Host "Could not update PATH automatically. Add manually:" -ForegroundColor Yellow
        Write-Host "  setx PATH `"%PATH%;$InstallDir`""
    }
} else {
    Write-Host "$InstallDir is already on PATH."
}

# Verify
try {
    & $BinDest --version
    Write-Host ""
    Write-Host "Done. Run 'barkcli init' in any project to get started." -ForegroundColor Green
} catch {
    Write-Host "Install completed but binary check failed: $_" -ForegroundColor Yellow
}

Remove-Item -Recurse -Force $TempDir -ErrorAction SilentlyContinue
