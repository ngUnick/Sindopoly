[CmdletBinding()]
param(
    [Parameter(Position = 0)]
    [string]$Command
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$script:RepositoryRoot = $PSScriptRoot
$script:ComposeFile = Join-Path $script:RepositoryRoot 'docker-compose.yml'
$script:DockerExecutable = $null
$script:ReadinessTimeoutSeconds = 240
$script:BackendUrl = 'http://localhost:8080'
$script:FrontendUrl = 'http://localhost'
$script:OpenApiUrl = 'http://localhost:8080/swagger-ui/index.html'
$script:BackendReadinessUrl = 'http://localhost:8080/api/game-state/public-lobby'
$script:ExpectedServices = @('mariadb', 'redis', 'backend', 'frontend')
$script:ExpectedPorts = [ordered]@{
    frontend = 80
    backend = 8080
    mariadb = 3306
    redis = 6379
}

function Write-SindopolyInfo {
    param([string]$Message)
    Write-Host "[Sindopoly] $Message"
}

function Write-SindopolySuccess {
    param([string]$Message)
    Write-Host "[Sindopoly] $Message" -ForegroundColor Green
}

function Write-SindopolyWarning {
    param([string]$Message)
    Write-Warning "[Sindopoly] $Message"
}

function Show-Usage {
    Write-Host 'Usage: .\sindopoly.ps1 <command>'
    Write-Host ''
    Write-Host 'Commands:'
    Write-Host '  start   Build and start the complete Docker development stack.'
    Write-Host '  stop    Stop the development stack while preserving its containers.'
    Write-Host '  status  Show container health and application reachability.'
    Write-Host '  logs    Follow the latest Docker Compose logs.'
    Write-Host '  doctor  Validate the repository, Docker, Compose, configuration, and ports.'
}

function Assert-RepositoryLayout {
    $requiredPaths = @(
        $script:ComposeFile,
        (Join-Path $script:RepositoryRoot 'Sindopoly-Java\Dockerfile'),
        (Join-Path $script:RepositoryRoot 'sindopoly-front\Dockerfile'),
        (Join-Path $script:RepositoryRoot 'sindopoly-front\nginx.conf')
    )

    foreach ($path in $requiredPaths) {
        if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
            throw "Expected repository file is missing: $path"
        }
    }
}

function Get-DockerExecutable {
    $commandInfo = Get-Command 'docker' -ErrorAction SilentlyContinue
    if ($null -eq $commandInfo) {
        throw 'Docker CLI was not found. Install Docker Desktop and ensure docker.exe is on PATH.'
    }
    return $commandInfo.Source
}

function Invoke-DockerCaptured {
    param([string[]]$Arguments)

    $standardOutput = [System.IO.Path]::GetTempFileName()
    $standardError = [System.IO.Path]::GetTempFileName()
    try {
        $process = Start-Process -FilePath $script:DockerExecutable -ArgumentList $Arguments `
            -WorkingDirectory $script:RepositoryRoot -NoNewWindow -Wait -PassThru `
            -RedirectStandardOutput $standardOutput -RedirectStandardError $standardError
        return [pscustomobject]@{
            ExitCode = $process.ExitCode
            StdOut = @(Get-Content -LiteralPath $standardOutput -ErrorAction SilentlyContinue)
            StdErr = @(Get-Content -LiteralPath $standardError -ErrorAction SilentlyContinue)
        }
    }
    finally {
        Remove-Item -LiteralPath $standardOutput, $standardError -Force -ErrorAction SilentlyContinue
    }
}

function Invoke-DockerStreaming {
    param([string[]]$Arguments)

    & $script:DockerExecutable @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "Docker command failed with exit code $LASTEXITCODE."
    }
}

function Get-ComposeArguments {
    param([string[]]$Arguments)

    $composeArguments = @('compose')
    $composeFile = [Environment]::GetEnvironmentVariable('COMPOSE_FILE', 'Process')
    if ([string]::IsNullOrWhiteSpace($composeFile)) {
        # Pin the canonical repository file by default, while preserving
        # Compose's explicit, developer-controlled multi-file override.
        $composeArguments += @('--file', $script:ComposeFile)
    }
    return $composeArguments + $Arguments
}

function Write-DockerWarnings {
    param([object[]]$Warnings)

    foreach ($warningLine in $Warnings) {
        $text = $warningLine.ToString().Trim()
        if ($text.Length -gt 0) {
            Write-SindopolyWarning "Docker reported: $text"
        }
    }
}

function Assert-DockerPrerequisites {
    $script:DockerExecutable = Get-DockerExecutable
    $composeVersion = Invoke-DockerCaptured -Arguments @('compose', 'version')
    if ($composeVersion.ExitCode -ne 0) {
        throw 'Docker Compose is unavailable. Install or enable Docker Compose v2 in Docker Desktop.'
    }
    Write-DockerWarnings -Warnings $composeVersion.StdErr

    $engine = Invoke-DockerCaptured -Arguments @('info', '--format', '{{.ServerVersion}}')
    if ($engine.ExitCode -ne 0) {
        $detail = ($engine.StdErr -join ' ').Trim()
        throw "Docker engine is unavailable. Start Docker Desktop and verify access to the Docker engine. $detail"
    }
    Write-DockerWarnings -Warnings $engine.StdErr
}

function Assert-ComposeConfiguration {
    $result = Invoke-DockerCaptured -Arguments (Get-ComposeArguments -Arguments @('config', '--quiet'))
    if ($result.ExitCode -ne 0) {
        $detail = (($result.StdErr + $result.StdOut) -join [Environment]::NewLine).Trim()
        throw "Docker Compose configuration is invalid. $detail"
    }
    Write-DockerWarnings -Warnings $result.StdErr
}

function Get-PropertyValue {
    param([object]$InputObject, [string]$Name, [object]$DefaultValue = $null)
    $property = $InputObject.PSObject.Properties[$Name]
    if ($null -eq $property) {
        return $DefaultValue
    }
    return $property.Value
}

function Get-ComposeServiceStates {
    $result = Invoke-DockerCaptured -Arguments (Get-ComposeArguments -Arguments @('ps', '--all', '--format', 'json'))
    if ($result.ExitCode -ne 0) {
        $detail = (($result.StdErr + $result.StdOut) -join [Environment]::NewLine).Trim()
        throw "Unable to inspect the Sindopoly Compose project. $detail"
    }
    Write-DockerWarnings -Warnings $result.StdErr

    $states = @{}
    $json = ($result.StdOut -join [Environment]::NewLine).Trim()
    if ($json.Length -eq 0) {
        return $states
    }

    try {
        $parsed = @(ConvertFrom-Json -InputObject $json)
    }
    catch {
        # Compose versions emit either one JSON array or one JSON object per
        # line. Supporting both keeps state/ownership checks version-neutral.
        try {
            $parsed = @($result.StdOut | Where-Object { $_.Trim().Length -gt 0 } |
                ForEach-Object { ConvertFrom-Json -InputObject $_ })
        }
        catch {
            throw "Docker Compose returned an unreadable service-state response: $($_.Exception.Message)"
        }
    }

    foreach ($item in @($parsed)) {
        $service = [string](Get-PropertyValue -InputObject $item -Name 'Service' -DefaultValue '')
        if ($service.Length -gt 0) {
            $states[$service] = [pscustomobject]@{
                Service = $service
                State = [string](Get-PropertyValue -InputObject $item -Name 'State' -DefaultValue 'unknown')
                Health = [string](Get-PropertyValue -InputObject $item -Name 'Health' -DefaultValue '')
                Name = [string](Get-PropertyValue -InputObject $item -Name 'Name' -DefaultValue '')
            }
        }
    }
    return $states
}

function Test-HttpReady {
    param([string]$Uri)
    try {
        $response = Invoke-WebRequest -Uri $Uri -Method Get -UseBasicParsing -TimeoutSec 3
        return ($response.StatusCode -ge 200 -and $response.StatusCode -lt 300)
    }
    catch {
        return $false
    }
}

function Get-StackStatus {
    param([hashtable]$ServiceStates)

    $status = @{}
    foreach ($service in $script:ExpectedServices) {
        $containerState = 'absent'
        $health = ''
        if ($ServiceStates.ContainsKey($service)) {
            $containerState = $ServiceStates[$service].State
            $health = $ServiceStates[$service].Health
        }

        $running = ($containerState -eq 'running')
        $ready = $false
        if ($service -eq 'mariadb' -or $service -eq 'redis') {
            $ready = ($running -and $health -eq 'healthy')
        }
        elseif ($service -eq 'backend') {
            $ready = ($running -and (Test-HttpReady -Uri $script:BackendReadinessUrl))
        }
        elseif ($service -eq 'frontend') {
            $ready = ($running -and (Test-HttpReady -Uri "$($script:FrontendUrl)/"))
        }

        $status[$service] = [pscustomobject]@{
            Service = $service
            ContainerState = $containerState
            Health = $health
            Ready = $ready
        }
    }
    return $status
}

function Test-CompleteStackReady {
    param([hashtable]$Status)
    foreach ($service in $script:ExpectedServices) {
        if (-not $Status[$service].Ready) {
            return $false
        }
    }
    return $true
}

function Show-StackStatus {
    param([hashtable]$Status)
    foreach ($service in $script:ExpectedServices) {
        $item = $Status[$service]
        $healthText = if ([string]::IsNullOrWhiteSpace($item.Health)) { 'n/a' } else { $item.Health }
        $readyText = if ($item.Ready) { 'ready' } else { 'not ready' }
        Write-Host ("[Sindopoly] {0,-8} container={1,-10} health={2,-8} {3}" -f $service, $item.ContainerState, $healthText, $readyText)
    }
    Write-Host "[Sindopoly] Frontend: $($script:FrontendUrl)"
    Write-Host "[Sindopoly] Backend:  $($script:BackendUrl)"
}

function Test-PortOpen {
    param([int]$Port)
    $client = New-Object System.Net.Sockets.TcpClient
    try {
        $asyncResult = $client.BeginConnect('127.0.0.1', $Port, $null, $null)
        if (-not $asyncResult.AsyncWaitHandle.WaitOne(400)) {
            return $false
        }
        $client.EndConnect($asyncResult)
        return $true
    }
    catch {
        return $false
    }
    finally {
        $client.Close()
    }
}

function Assert-NoUnrelatedPortConflicts {
    param([hashtable]$ServiceStates)
    foreach ($entry in $script:ExpectedPorts.GetEnumerator()) {
        $service = [string]$entry.Key
        $port = [int]$entry.Value
        $owned = $ServiceStates.ContainsKey($service) -and $ServiceStates[$service].State -eq 'running'
        if (-not $owned -and (Test-PortOpen -Port $port)) {
            throw "Port $port is already in use by something other than the running Sindopoly $service service. Stop or reconfigure that owner before starting Sindopoly."
        }
    }
}

function Get-RunningServiceNames {
    param([hashtable]$ServiceStates)
    $running = @()
    foreach ($service in $script:ExpectedServices) {
        if ($ServiceStates.ContainsKey($service) -and $ServiceStates[$service].State -eq 'running') {
            $running += $service
        }
    }
    return $running
}

function Get-ExistingServiceNames {
    param([hashtable]$ServiceStates)
    return @($script:ExpectedServices | Where-Object { $ServiceStates.ContainsKey($_) })
}

function Get-StartedServiceNames {
    param([hashtable]$ServiceStates)
    $started = @()
    foreach ($service in $script:ExpectedServices) {
        if ($ServiceStates.ContainsKey($service) -and
            $ServiceStates[$service].State -notin @('created', 'dead', 'exited')) {
            $started += $service
        }
    }
    return $started
}

function Stop-NewlyStartedServices {
    param([string[]]$PreviouslyRunning)
    try {
        $currentlyStarted = Get-StartedServiceNames -ServiceStates (Get-ComposeServiceStates)
        $newlyStarted = @($currentlyStarted | Where-Object { $PreviouslyRunning -notcontains $_ })
        if ($newlyStarted.Count -eq 0) {
            return
        }

        # Include restarting containers in rollback, while keeping the action
        # service-scoped so pre-existing running services remain untouched.
        Write-SindopolyWarning "Startup failed; stopping only newly started services: $($newlyStarted -join ', ')."
        Invoke-DockerStreaming -Arguments (Get-ComposeArguments -Arguments (@('stop') + $newlyStarted))
    }
    catch {
        Write-SindopolyWarning "Safe automatic rollback was not possible. The partial stack was preserved. Run '.\sindopoly.ps1 status' and '.\sindopoly.ps1 logs' before deciding whether to stop it."
    }
}

function Wait-ForStackReady {
    $deadline = [DateTime]::UtcNow.AddSeconds($script:ReadinessTimeoutSeconds)
    do {
        $status = Get-StackStatus -ServiceStates (Get-ComposeServiceStates)
        if (Test-CompleteStackReady -Status $status) {
            return $status
        }
        Start-Sleep -Seconds 3
    } while ([DateTime]::UtcNow -lt $deadline)
    return (Get-StackStatus -ServiceStates (Get-ComposeServiceStates))
}

function Show-ReadyUrls {
    Write-SindopolySuccess 'Sindopoly is ready.'
    Write-Host "[Sindopoly] Frontend: $($script:FrontendUrl)"
    Write-Host "[Sindopoly] Backend:  $($script:BackendUrl)"
    Write-Host "[Sindopoly] OpenAPI:  $($script:OpenApiUrl)"
}

function Invoke-StartCommand {
    Assert-RepositoryLayout
    Assert-DockerPrerequisites
    Assert-ComposeConfiguration
    $initialStates = Get-ComposeServiceStates
    $initialStatus = Get-StackStatus -ServiceStates $initialStates
    if (Test-CompleteStackReady -Status $initialStatus) {
        Write-SindopolyInfo 'The complete Sindopoly stack is already running; no rebuild or restart was performed.'
        Show-ReadyUrls
        return 0
    }

    Assert-NoUnrelatedPortConflicts -ServiceStates $initialStates
    $previouslyExisting = @(Get-ExistingServiceNames -ServiceStates $initialStates)
    $previouslyRunning = @(Get-RunningServiceNames -ServiceStates $initialStates)
    try {
        Write-SindopolyInfo 'Building and starting the Docker development stack...'
        $upArguments = @('up', '-d', '--build')
        if ($previouslyExisting.Count -gt 0) {
            # A stopped or partial stack may contain valuable anonymous-volume
            # state. Start it without recreating containers that predate this run.
            $upArguments += '--no-recreate'
            Write-SindopolyInfo "Preserving pre-existing service containers: $($previouslyExisting -join ', ')."
        }
        Invoke-DockerStreaming -Arguments (Get-ComposeArguments -Arguments $upArguments)
        Write-SindopolyInfo "Waiting up to $($script:ReadinessTimeoutSeconds) seconds for container health and HTTP readiness..."
        $finalStatus = Wait-ForStackReady
        if (-not (Test-CompleteStackReady -Status $finalStatus)) {
            Show-StackStatus -Status $finalStatus
            throw "The stack did not become ready within $($script:ReadinessTimeoutSeconds) seconds. Run '.\sindopoly.ps1 logs' for diagnostics."
        }
        Show-ReadyUrls
        return 0
    }
    catch {
        Stop-NewlyStartedServices -PreviouslyRunning $previouslyRunning
        throw
    }
}

function Invoke-StopCommand {
    Assert-RepositoryLayout
    Assert-DockerPrerequisites
    $states = Get-ComposeServiceStates
    $running = @(Get-RunningServiceNames -ServiceStates $states)
    if ($running.Count -eq 0) {
        Write-SindopolySuccess 'The Sindopoly Compose project is already stopped.'
        return 0
    }

    Write-SindopolyInfo 'Stopping the Sindopoly Compose project while preserving its containers...'
    Invoke-DockerStreaming -Arguments (Get-ComposeArguments -Arguments @('stop'))
    Write-SindopolySuccess 'The Sindopoly Compose project is stopped and its containers are preserved.'
    Write-SindopolyWarning "No named MariaDB volume is declared. Manual 'docker compose down' removes containers and may orphan anonymous-volume data that a later start will not reliably reattach."
    return 0
}

function Invoke-StatusCommand {
    Assert-RepositoryLayout
    Assert-DockerPrerequisites
    Assert-ComposeConfiguration
    $status = Get-StackStatus -ServiceStates (Get-ComposeServiceStates)
    Show-StackStatus -Status $status
    if (Test-CompleteStackReady -Status $status) {
        Write-SindopolySuccess 'The complete stack is ready.'
        return 0
    }
    Write-SindopolyWarning 'The stack is stopped, partial, or not ready.'
    return 1
}

function Invoke-LogsCommand {
    Assert-RepositoryLayout
    Assert-DockerPrerequisites
    Write-SindopolyInfo 'Following the latest 100 Compose log lines. Press Ctrl+C to stop following logs; containers will continue running.'
    Invoke-DockerStreaming -Arguments (Get-ComposeArguments -Arguments @('logs', '--tail', '100', '--follow'))
    return 0
}

function Invoke-DoctorCommand {
    Assert-RepositoryLayout
    Write-SindopolySuccess 'Repository layout is valid.'
    Assert-DockerPrerequisites
    Write-SindopolySuccess 'Docker CLI, Compose, and engine are available.'
    Assert-ComposeConfiguration
    Write-SindopolySuccess 'Docker Compose configuration is valid.'

    if (Test-Path -LiteralPath (Join-Path $script:RepositoryRoot '.env') -PathType Leaf) {
        Write-SindopolyInfo '.env is present and was validated through Docker Compose.'
    }
    else {
        Write-SindopolyInfo '.env is absent; committed development defaults will be used.'
    }

    $states = Get-ComposeServiceStates
    Assert-NoUnrelatedPortConflicts -ServiceStates $states
    Write-SindopolySuccess 'No unrelated fixed-port conflict was detected.'
    Show-StackStatus -Status (Get-StackStatus -ServiceStates $states)
    Write-SindopolySuccess 'Doctor checks passed. Host Java, Maven, Node, and npm are not required for this Docker workflow.'
    return 0
}

function Invoke-Main {
    if ([string]::IsNullOrWhiteSpace($Command)) {
        Show-Usage
        return 1
    }
    switch ($Command.ToLowerInvariant()) {
        'start' { return Invoke-StartCommand }
        'stop' { return Invoke-StopCommand }
        'status' { return Invoke-StatusCommand }
        'logs' { return Invoke-LogsCommand }
        'doctor' { return Invoke-DoctorCommand }
        default {
            Write-SindopolyWarning "Unknown command: $Command"
            Show-Usage
            return 1
        }
    }
}

$exitCode = 1
try {
    Push-Location -LiteralPath $script:RepositoryRoot
    $exitCode = Invoke-Main
}
catch {
    Write-Host "[Sindopoly] ERROR: $($_.Exception.Message)" -ForegroundColor Red
    $exitCode = 1
}
finally {
    Pop-Location
}
exit $exitCode
