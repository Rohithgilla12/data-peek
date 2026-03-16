[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$repoSlug = 'Rohithgilla12/data-peek'
$apiUrl = "https://api.github.com/repos/$repoSlug/releases/latest"
$headers = @{
  Accept = 'application/vnd.github+json'
  'User-Agent' = 'data-peek-install-script'
}

Write-Host 'Fetching latest data-peek release metadata...'
$release = Invoke-RestMethod -Uri $apiUrl -Headers $headers
$asset = $release.assets | Where-Object { $_.name -like '*-setup.exe' } | Select-Object -First 1

if (-not $asset) {
  throw 'Could not find a Windows setup.exe asset in the latest release.'
}

$tempDir = if ($env:TEMP) { $env:TEMP } else { [IO.Path]::GetTempPath() }
$tempInstaller = Join-Path $tempDir $asset.name

try {
  Write-Host 'Downloading Windows installer...'
  Invoke-WebRequest -Uri $asset.browser_download_url -OutFile $tempInstaller

  Write-Host 'Running installer silently...'
  $process = Start-Process -FilePath $tempInstaller -ArgumentList '/S' -PassThru -Wait

  if ($process.ExitCode -ne 0) {
    Write-Warning "Silent install exited with code $($process.ExitCode). Falling back to interactive installer."
    $interactive = Start-Process -FilePath $tempInstaller -PassThru -Wait
    if ($interactive.ExitCode -ne 0) {
      throw "Interactive install failed with exit code $($interactive.ExitCode)."
    }
  }

  Write-Host 'data-peek installation completed.'
}
finally {
  if (Test-Path $tempInstaller) {
    Remove-Item $tempInstaller -Force -ErrorAction SilentlyContinue
  }
}
