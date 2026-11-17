[CmdletBinding()]
param(
    [ValidateSet(
        'Menu',
        'AuthNormal',
        'AuthBurst',
        'AuthSuccessAfterFail',
        'AuthMultiAccountSpray',
        'AuthAccountLockout',
        'AppNormal',
        'AppDenialBurst',
        'AppSuccessAfterDenial',
        'VpnNormal',
        'VpnFailureBurst',
        'SsoFailureBurst',
        'SsoBaselineAndNewIp',
        'WinNativeAuthFail',
        'AppAuditScanProfile',
        'BoundaryJitterMix',
        'ColdStartNoHistory',
        'SetupAgent',
        'AllCore'
    )]
    [string]$Scenario = 'Menu',
    [string]$LogDirectory = 'C:\ProgramData\securaai-sim',
    [string]$Username,
    [string]$SourceIp,
    [string]$ApplicationId,
    [switch]$SkipBaseline,
    [ValidateRange(50, 5000)]
    [int]$MinDelayMs = 200,
    [ValidateRange(100, 10000)]
    [int]$MaxDelayMs = 450
)

$ErrorActionPreference = 'Stop'
if ($MaxDelayMs -lt $MinDelayMs) {
    $MaxDelayMs = $MinDelayMs
}

$LogPath = Join-Path $LogDirectory 'events.log'
$HistoryPath = Join-Path $LogDirectory 'run-history.csv'
$Utf8NoBom = New-Object System.Text.UTF8Encoding($false)

function Ensure-SimEnvironment {
    if (-not (Test-Path -LiteralPath $LogDirectory)) {
        [void](New-Item -ItemType Directory -Force -Path $LogDirectory)
    }
    try {
        if (-not (Test-Path -LiteralPath $LogPath)) {
            [IO.File]::WriteAllText($LogPath, '', $Utf8NoBom)
        } else {
            [IO.File]::AppendAllText($LogPath, '', $Utf8NoBom)
        }
    } catch [System.UnauthorizedAccessException] {
        Write-Host "Dang cap quyen ghi thu muc $LogDirectory cho user hien tai (chi can 1 lan)..." -ForegroundColor Yellow
        Start-Process icacls.exe -Verb RunAs -ArgumentList "`"$LogDirectory`" /grant *S-1-5-32-545:(OI)(CI)M /T /Q" -Wait
    }
    if (-not (Test-Path -LiteralPath $HistoryPath)) {
        $header = "RunId,StartedAtLocal,Scenario,EventFamily,EventsEmitted,Principal,SourceIp,ApplicationId,ExpectedOutcome`r`n"
        [IO.File]::WriteAllText($HistoryPath, $header, $Utf8NoBom)
    }
}

function Get-RandomDelayMs {
    return Get-Random -Minimum $MinDelayMs -Maximum ($MaxDelayMs + 1)
}

function Write-SimEvent {
    param(
        [Parameter(Mandatory = $true)][string]$SimEvent,
        [Parameter(Mandatory = $true)][string]$Actor,
        [Parameter(Mandatory = $true)][string]$Ip,
        [string]$AppId,
        [string]$AppName,
        [string]$OccurredAtUtc,
        [int]$CustomDelayMs = -1
    )

    $emittedAt = if ($OccurredAtUtc) {
        $OccurredAtUtc
    } else {
        [DateTimeOffset]::UtcNow.ToString("yyyy-MM-ddTHH:mm:ss.fff'Z'")
    }

    $payload = [ordered]@{
        sim_type   = 'securaai'
        sim_event  = $SimEvent
        dstuser    = $Actor
        srcip      = $Ip
        emitted_at = $emittedAt
    }
    if ($AppId) {
        $payload['application_id'] = $AppId
    }
    if ($AppName) {
        $payload['application_name'] = $AppName
    }

    $jsonLine = ($payload | ConvertTo-Json -Compress)
    [IO.File]::AppendAllText($LogPath, $jsonLine + "`n", $Utf8NoBom)
    $sleepMs = if ($CustomDelayMs -ge 0) { $CustomDelayMs } else { Get-RandomDelayMs }
    if ($sleepMs -gt 0) {
        Start-Sleep -Milliseconds $sleepMs
    }
}

function Get-CounterpartFailureEvent {
    param([string]$SuccessSimEvent)
    switch ($SuccessSimEvent) {
        'AUTH_LOGIN_SUCCESS' { return 'AUTH_LOGIN_FAILURE' }
        'APP_ACCESS_GRANTED' { return 'APP_ACCESS_DENIED' }
        'VPN_LOGIN_SUCCESS'  { return 'VPN_LOGIN_FAILURE' }
        'SSO_LOGIN_SUCCESS'  { return 'SSO_LOGIN_FAILURE' }
        default              { return $null }
    }
}

function Write-AccountBaseline {
    param(
        [Parameter(Mandatory = $true)][string]$SuccessSimEvent,
        [Parameter(Mandatory = $true)][string]$Actor,
        [Parameter(Mandatory = $true)][string]$Ip,
        [string]$AppId,
        [string]$AppName,
        [int]$WindowCount = 0,
        [switch]$CleanOnly
    )

    if ($SkipBaseline) {
        return 0
    }

    $actualWindows = if ($WindowCount -gt 0) { $WindowCount } else { Get-Random -Minimum 22 -Maximum 35 }
    $failSimEvent = Get-CounterpartFailureEvent -SuccessSimEvent $SuccessSimEvent
    $emittedTotal = 0
    $noisyWindows = 0

    Write-Host "  -> Khoi tao $actualWindows cua so lich su tu nhien (co nhieu loi le te nhu nguoi dung that)..." -ForegroundColor DarkGray
    $nowUtc = [DateTimeOffset]::UtcNow
    $cursorMinutesAgo = 15

    for ($i = 1; $i -le $actualWindows; $i++) {
        $stepMinutes = Get-Random -Minimum 7 -Maximum 19
        $cursorMinutesAgo += $stepMinutes
        $rawTime = $nowUtc.AddMinutes(-$cursorMinutesAgo)
        $floorSeconds = [int64]([Math]::Floor($rawTime.ToUnixTimeSeconds() / 60.0) * 60)
        $windowBaseTime = [DateTimeOffset]::FromUnixTimeSeconds($floorSeconds)

        if (-not $CleanOnly -and $failSimEvent -and ((Get-Random -Minimum 1 -Maximum 101) -le 22)) {
            $noisyWindows++
            $benignFails = if ((Get-Random -Minimum 1 -Maximum 101) -le 75) { 1 } else { Get-Random -Minimum 2 -Maximum 4 }
            for ($f = 1; $f -le $benignFails; $f++) {
                $tFail = $windowBaseTime.AddSeconds($f * 4).ToString("yyyy-MM-ddTHH:mm:ss.fff'Z'")
                Write-SimEvent -SimEvent $failSimEvent -Actor $Actor -Ip $Ip -AppId $AppId -AppName $AppName -OccurredAtUtc $tFail -CustomDelayMs 45
                $emittedTotal++
            }
        }

        $tSuccess = $windowBaseTime.AddSeconds(25).ToString("yyyy-MM-ddTHH:mm:ss.fff'Z'")
        Write-SimEvent -SimEvent $SuccessSimEvent -Actor $Actor -Ip $Ip -AppId $AppId -AppName $AppName -OccurredAtUtc $tSuccess -CustomDelayMs 55
        $emittedTotal++
    }

    Write-Host "     (Da tao $emittedTotal su kien lich su tren $actualWindows cua so, trong do co $noisyWindows cua so co 1-3 loi nham lan)" -ForegroundColor DarkGray
    Start-Sleep -Milliseconds 1500
    return $emittedTotal
}

function Record-RunHistory {
    param(
        [string]$RunId,
        [string]$ScenarioName,
        [string]$Family,
        [int]$Count,
        [string]$Actor,
        [string]$Ip,
        [string]$AppId,
        [string]$Expected
    )

    $timestamp = (Get-Date).ToString('yyyy-MM-dd HH:mm:ss')
    $safeExpected = $Expected.Replace('"', '""')
    $row = "$RunId,$timestamp,$ScenarioName,$Family,$Count,$Actor,$Ip,$AppId,`"$safeExpected`"`r`n"
    [IO.File]::AppendAllText($HistoryPath, $row, $Utf8NoBom)
}

function Invoke-SimScenario {
    param([Parameter(Mandatory = $true)][string]$ScenarioName)

    Ensure-SimEnvironment
    $tag = (Get-Date).ToString('MMdd-HHmmss') + '-' + (Get-Random -Minimum 100 -Maximum 999)
    $runId = "sim-$tag"

    switch ($ScenarioName) {
        'AuthNormal' {
            $user = if ($Username) { $Username } else { "nv.ketoan.$tag" }
            $ip = if ($SourceIp) { $SourceIp } else { '10.20.10.15' }
            Write-Host "`n[1/1] Running AuthNormal ($user @ $ip)..." -ForegroundColor Cyan
            $baseCount = Write-AccountBaseline -SuccessSimEvent 'AUTH_LOGIN_SUCCESS' -Actor $user -Ip $ip
            Write-SimEvent -SimEvent 'AUTH_LOGIN_FAILURE' -Actor $user -Ip $ip
            1..2 | ForEach-Object { Write-SimEvent -SimEvent 'AUTH_LOGIN_SUCCESS' -Actor $user -Ip $ip }
            $expected = 'TN (NORMAL - Baseline READY, Score < 0.6700): 1 benign mistype + 2 successes within historical noise'
            Record-RunHistory $runId $ScenarioName 'AUTHENTICATION' ($baseCount + 3) $user $ip '-' $expected
        }

        'AuthBurst' {
            $user = if ($Username) { $Username } else { "ops.admin.$tag" }
            $ip = if ($SourceIp) { $SourceIp } else { '10.20.10.41' }
            Write-Host "`n[1/1] Running AuthBurst ($user @ $ip)..." -ForegroundColor Cyan
            $baseCount = Write-AccountBaseline -SuccessSimEvent 'AUTH_LOGIN_SUCCESS' -Actor $user -Ip $ip
            1..6 | ForEach-Object { Write-SimEvent -SimEvent 'AUTH_LOGIN_FAILURE' -Actor $user -Ip $ip }
            $expected = 'TP (ANOMALY - Score ~0.88-0.94 >= 0.6700, 22-34 baseline windows): Matches AUTH_FAILURE_BURST'
            Record-RunHistory $runId $ScenarioName 'AUTHENTICATION' ($baseCount + 6) $user $ip '-' $expected
        }

        'AuthSuccessAfterFail' {
            $user = if ($Username) { $Username } else { "sys.engineer.$tag" }
            $ip = if ($SourceIp) { $SourceIp } else { '10.20.10.42' }
            Write-Host "`n[1/1] Running AuthSuccessAfterFail ($user @ $ip)..." -ForegroundColor Cyan
            $baseCount = Write-AccountBaseline -SuccessSimEvent 'AUTH_LOGIN_SUCCESS' -Actor $user -Ip $ip
            1..6 | ForEach-Object { Write-SimEvent -SimEvent 'AUTH_LOGIN_FAILURE' -Actor $user -Ip $ip }
            Write-SimEvent -SimEvent 'AUTH_LOGIN_SUCCESS' -Actor $user -Ip $ip
            $expected = 'TP (ANOMALY - Score ~0.88-0.94 >= 0.6700, 22-34 baseline windows): Matches AUTH_FAILURE_BURST + AUTH_SUCCESS_AFTER_FAILURE'
            Record-RunHistory $runId $ScenarioName 'AUTHENTICATION' ($baseCount + 7) $user $ip '-' $expected
        }

        'AuthMultiAccountSpray' {
            $ip = if ($SourceIp) { $SourceIp } else { '10.20.10.99' }
            Write-Host "`n[1/1] Running AuthMultiAccountSpray (6 accounts x 2 failures @ $ip)..." -ForegroundColor Cyan
            $accounts = @('hr.anna', 'hr.minh', 'it.khoa', 'fin.lan', 'ops.huy', 'dev.tuan')
            foreach ($acc in $accounts) {
                $targetUser = "$acc.$tag"
                1..2 | ForEach-Object { Write-SimEvent -SimEvent 'AUTH_LOGIN_FAILURE' -Actor $targetUser -Ip $ip }
            }
            $expected = 'FN Limitation (Score 0.0000): 12 failures from 1 IP across 6 accounts (2 per user < threshold 5, no per-account baseline)'
            Record-RunHistory $runId $ScenarioName 'AUTHENTICATION' 12 "multi-user.$tag" $ip '-' $expected
        }

        'AuthAccountLockout' {
            $user = if ($Username) { $Username } else { "locked.user.$tag" }
            $ip = if ($SourceIp) { $SourceIp } else { '10.20.10.55' }
            Write-Host "`n[1/1] Running AuthAccountLockout ($user @ $ip)..." -ForegroundColor Cyan
            $baseCount = Write-AccountBaseline -SuccessSimEvent 'AUTH_LOGIN_SUCCESS' -Actor $user -Ip $ip
            1..5 | ForEach-Object { Write-SimEvent -SimEvent 'AUTH_LOGIN_FAILURE' -Actor $user -Ip $ip }
            Write-SimEvent -SimEvent 'AUTH_ACCOUNT_LOCKOUT' -Actor $user -Ip $ip
            $expected = 'TP (ANOMALY - Score ~0.88-0.94 >= 0.6700, 22-34 baseline windows): 5 failures trigger AUTH_FAILURE_BURST + ACCOUNT_LOCKOUT'
            Record-RunHistory $runId $ScenarioName 'AUTHENTICATION' ($baseCount + 6) $user $ip '-' $expected
        }

        'AppNormal' {
            $user = if ($Username) { $Username } else { "portal.staff.$tag" }
            $ip = if ($SourceIp) { $SourceIp } else { '10.20.20.12' }
            $appId = if ($ApplicationId) { $ApplicationId } else { 'erp-internal' }
            Write-Host "`n[1/1] Running AppNormal ($user @ $appId)..." -ForegroundColor Cyan
            $baseCount = Write-AccountBaseline -SuccessSimEvent 'APP_ACCESS_GRANTED' -Actor $user -Ip $ip -AppId $appId -AppName 'Internal ERP Portal'
            Write-SimEvent -SimEvent 'APP_ACCESS_DENIED' -Actor $user -Ip $ip -AppId $appId -AppName 'Internal ERP Portal'
            1..2 | ForEach-Object {
                Write-SimEvent -SimEvent 'APP_ACCESS_GRANTED' -Actor $user -Ip $ip -AppId $appId -AppName 'Internal ERP Portal'
            }
            $expected = 'TN (NORMAL - Baseline READY, Score < 0.6700): 1 benign denial + 2 granted within historical noise'
            Record-RunHistory $runId $ScenarioName 'APPLICATION_ACCESS' ($baseCount + 3) $user $ip $appId $expected
        }

        'AppDenialBurst' {
            $user = if ($Username) { $Username } else { "web.operator.$tag" }
            $ip = if ($SourceIp) { $SourceIp } else { '10.20.20.61' }
            $appId = if ($ApplicationId) { $ApplicationId } else { 'finance-portal' }
            Write-Host "`n[1/1] Running AppDenialBurst ($user @ $appId)..." -ForegroundColor Cyan
            $baseCount = Write-AccountBaseline -SuccessSimEvent 'APP_ACCESS_GRANTED' -Actor $user -Ip $ip -AppId $appId -AppName 'Finance Portal'
            1..11 | ForEach-Object {
                Write-SimEvent -SimEvent 'APP_ACCESS_DENIED' -Actor $user -Ip $ip -AppId $appId -AppName 'Finance Portal'
            }
            $expected = 'TP (ANOMALY - Score ~0.88-0.94 >= 0.6700, 22-34 baseline windows): Matches APP_DENIAL_BURST (11 denials >= 10)'
            Record-RunHistory $runId $ScenarioName 'APPLICATION_ACCESS' ($baseCount + 11) $user $ip $appId $expected
        }

        'AppSuccessAfterDenial' {
            $user = if ($Username) { $Username } else { "payroll.admin.$tag" }
            $ip = if ($SourceIp) { $SourceIp } else { '10.20.20.62' }
            $appId = if ($ApplicationId) { $ApplicationId } else { 'payroll-core' }
            Write-Host "`n[1/1] Running AppSuccessAfterDenial ($user @ $appId)..." -ForegroundColor Cyan
            $baseCount = Write-AccountBaseline -SuccessSimEvent 'APP_ACCESS_GRANTED' -Actor $user -Ip $ip -AppId $appId -AppName 'Payroll Core System'
            1..10 | ForEach-Object {
                Write-SimEvent -SimEvent 'APP_ACCESS_DENIED' -Actor $user -Ip $ip -AppId $appId -AppName 'Payroll Core System'
            }
            Write-SimEvent -SimEvent 'APP_ACCESS_GRANTED' -Actor $user -Ip $ip -AppId $appId -AppName 'Payroll Core System'
            $expected = 'TP (ANOMALY - Score ~0.88-0.94 >= 0.6700, 22-34 baseline windows): Matches APP_DENIAL_BURST + APP_SUCCESS_AFTER_DENIAL'
            Record-RunHistory $runId $ScenarioName 'APPLICATION_ACCESS' ($baseCount + 11) $user $ip $appId $expected
        }

        'VpnNormal' {
            $user = if ($Username) { $Username } else { "remote.dev.$tag" }
            $ip = if ($SourceIp) { $SourceIp } else { '10.20.30.18' }
            Write-Host "`n[1/1] Running VpnNormal ($user @ $ip)..." -ForegroundColor Cyan
            $baseCount = Write-AccountBaseline -SuccessSimEvent 'VPN_LOGIN_SUCCESS' -Actor $user -Ip $ip
            Write-SimEvent -SimEvent 'VPN_LOGIN_FAILURE' -Actor $user -Ip $ip
            1..2 | ForEach-Object { Write-SimEvent -SimEvent 'VPN_LOGIN_SUCCESS' -Actor $user -Ip $ip }
            $expected = 'TN (NORMAL - Baseline READY, Score < 0.6700): 1 benign VPN retry + 2 successes within historical noise'
            Record-RunHistory $runId $ScenarioName 'VPN_SSO' ($baseCount + 3) $user $ip '-' $expected
        }

        'VpnFailureBurst' {
            $user = if ($Username) { $Username } else { "vpn.contractor.$tag" }
            $ip = if ($SourceIp) { $SourceIp } else { '10.20.30.71' }
            Write-Host "`n[1/1] Running VpnFailureBurst ($user @ $ip)..." -ForegroundColor Cyan
            $baseCount = Write-AccountBaseline -SuccessSimEvent 'VPN_LOGIN_SUCCESS' -Actor $user -Ip $ip
            1..6 | ForEach-Object { Write-SimEvent -SimEvent 'VPN_LOGIN_FAILURE' -Actor $user -Ip $ip }
            $expected = 'TP (ANOMALY - Score ~0.88-0.94 >= 0.6700, 22-34 baseline windows): Matches VPN_SSO_FAILURE_BURST (OpenVPN)'
            Record-RunHistory $runId $ScenarioName 'VPN_SSO' ($baseCount + 6) $user $ip '-' $expected
        }

        'SsoFailureBurst' {
            $user = if ($Username) { $Username } else { "sso.analyst.$tag" }
            $ip = if ($SourceIp) { $SourceIp } else { '10.20.30.72' }
            Write-Host "`n[1/1] Running SsoFailureBurst ($user @ $ip)..." -ForegroundColor Cyan
            $baseCount = Write-AccountBaseline -SuccessSimEvent 'SSO_LOGIN_SUCCESS' -Actor $user -Ip $ip
            1..6 | ForEach-Object { Write-SimEvent -SimEvent 'SSO_LOGIN_FAILURE' -Actor $user -Ip $ip }
            $expected = 'TP (ANOMALY - Score ~0.88-0.94 >= 0.6700, 22-34 baseline windows): Matches VPN_SSO_FAILURE_BURST (Keycloak SSO)'
            Record-RunHistory $runId $ScenarioName 'VPN_SSO' ($baseCount + 6) $user $ip '-' $expected
        }

        'SsoBaselineAndNewIp' {
            $user = if ($Username) { $Username } else { "sso.exec.$tag" }
            $knownIp = '10.20.30.10'
            $newIp = if ($SourceIp) { $SourceIp } else { '10.20.99.200' }
            Write-Host "`n[1/1] Running SsoBaselineAndNewIp ($user : 22-34w $knownIp -> 1x $newIp)..." -ForegroundColor Cyan
            $baseCount = Write-AccountBaseline -SuccessSimEvent 'SSO_LOGIN_SUCCESS' -Actor $user -Ip $knownIp
            Write-SimEvent -SimEvent 'SSO_LOGIN_SUCCESS' -Actor $user -Ip $newIp
            $expected = 'Context-Dependent: Matches VPN_SSO_NEW_CONTEXT_OFF_HOURS outside 06:00-22:00 (Asia/Ho_Chi_Minh)'
            Record-RunHistory $runId $ScenarioName 'VPN_SSO' ($baseCount + 1) $user $newIp '-' $expected
        }

        'WinNativeAuthFail' {
            $user = if ($Username) { $Username } else { "winlab_$($tag.Replace('-', ''))" }
            Write-Host "`n[1/1] Triggering 6 real Windows Security Event 4625 logons via local loopback for [$user]..." -ForegroundColor Cyan
            1..6 | ForEach-Object {
                $null = cmd.exe /c "net use \\127.0.0.1\IPC$ WrongLabPass! /user:localhost\$user >nul 2>&1"
                Start-Sleep -Milliseconds (Get-RandomDelayMs)
            }
            $expected = 'Native Windows Event ID 4625 (INSUFFICIENT_BASELINE - Score 0.0000 unless account has >=20 history windows)'
            Record-RunHistory $runId $ScenarioName 'AUTHENTICATION (Win4625)' 6 $user '127.0.0.1' '-' $expected
        }

        'AppAuditScanProfile' {
            $user = if ($Username) { $Username } else { "audit.scanner.$tag" }
            $ip = if ($SourceIp) { $SourceIp } else { "10.20.40.$(Get-Random -Minimum 10 -Maximum 250)" }
            $modules = @(
                @{ Id = 'erp-internal'; Name = 'Internal ERP Portal' },
                @{ Id = 'finance-portal'; Name = 'Finance Portal' },
                @{ Id = 'payroll-core'; Name = 'Payroll Core System' }
            )
            $chosenMod = $modules[(Get-Random -Minimum 0 -Maximum $modules.Count)]
            $appId = if ($ApplicationId) { $ApplicationId } else { $chosenMod.Id }
            $appName = $chosenMod.Name
            $windowCount = Get-Random -Minimum 21 -Maximum 35
            $deniedCount = Get-Random -Minimum 2 -Maximum 15
            $grantedNoise = Get-Random -Minimum 2 -Maximum 5

            Write-Host "`n[1/1] Running AppAuditScanProfile ($user @ $appId, baseline=$windowCount, granted=$grantedNoise, denied=$deniedCount)..." -ForegroundColor Cyan
            $baseCount = Write-AccountBaseline -SuccessSimEvent 'APP_ACCESS_GRANTED' -Actor $user -Ip $ip -AppId $appId -AppName $appName -WindowCount $windowCount

            for ($g = 1; $g -le $grantedNoise; $g++) {
                Write-SimEvent -SimEvent 'APP_ACCESS_GRANTED' -Actor $user -Ip $ip -AppId $appId -AppName $appName -CustomDelayMs (Get-Random -Minimum 80 -Maximum 250)
            }
            for ($d = 1; $d -le $deniedCount; $d++) {
                Write-SimEvent -SimEvent 'APP_ACCESS_DENIED' -Actor $user -Ip $ip -AppId $appId -AppName $appName -CustomDelayMs (Get-Random -Minimum 60 -Maximum 220)
            }
            if ((Get-Random -Minimum 0 -Maximum 2) -eq 1) {
                Write-SimEvent -SimEvent 'APP_ACCESS_GRANTED' -Actor $user -Ip $ip -AppId $appId -AppName $appName -CustomDelayMs 150
                $grantedNoise++
            }

            $totalEmitted = $baseCount + $grantedNoise + $deniedCount
            $expected = if ($deniedCount -ge 10) {
                "Randomized Audit Profile (denied=$deniedCount >= 10, baseline=$windowCount): Expected ANOMALY"
            } else {
                "Randomized Audit Profile (denied=$deniedCount < 10, baseline=$windowCount): Boundary/Below threshold"
            }
            Record-RunHistory $runId $ScenarioName 'APPLICATION_ACCESS' $totalEmitted $user $ip $appId $expected
        }

        'BoundaryJitterMix' {
            $families = @('AUTHENTICATION', 'APPLICATION_ACCESS', 'VPN_SSO')
            $pickedFamily = $families[(Get-Random -Minimum 0 -Maximum $families.Count)]
            $windowCount = Get-Random -Minimum 18 -Maximum 34
            $ip = if ($SourceIp) { $SourceIp } else { "10.20.50.$(Get-Random -Minimum 10 -Maximum 250)" }

            if ($pickedFamily -eq 'AUTHENTICATION') {
                $user = if ($Username) { $Username } else { "jitter.auth.$tag" }
                $failCount = Get-Random -Minimum 1 -Maximum 9
                Write-Host "`n[1/1] Running BoundaryJitterMix [AUTH] ($user @ $ip, baseline=$windowCount, fail=$failCount)..." -ForegroundColor Cyan
                $baseCount = Write-AccountBaseline -SuccessSimEvent 'AUTH_LOGIN_SUCCESS' -Actor $user -Ip $ip -WindowCount $windowCount
                for ($f = 1; $f -le $failCount; $f++) {
                    Write-SimEvent -SimEvent 'AUTH_LOGIN_FAILURE' -Actor $user -Ip $ip -CustomDelayMs (Get-Random -Minimum 120 -Maximum 500)
                }
                $expected = "Organic Jitter AUTH (baseline=$windowCount, fail=$failCount): Score varies naturally with historical noise"
                Record-RunHistory $runId $ScenarioName 'AUTHENTICATION' ($baseCount + $failCount) $user $ip '-' $expected
            } elseif ($pickedFamily -eq 'APPLICATION_ACCESS') {
                $user = if ($Username) { $Username } else { "jitter.app.$tag" }
                $appId = if ($ApplicationId) { $ApplicationId } else { 'erp-internal' }
                $deniedCount = Get-Random -Minimum 1 -Maximum 14
                Write-Host "`n[1/1] Running BoundaryJitterMix [APP] ($user @ $appId, baseline=$windowCount, denied=$deniedCount)..." -ForegroundColor Cyan
                $baseCount = Write-AccountBaseline -SuccessSimEvent 'APP_ACCESS_GRANTED' -Actor $user -Ip $ip -AppId $appId -AppName 'Internal ERP Portal' -WindowCount $windowCount
                for ($d = 1; $d -le $deniedCount; $d++) {
                    Write-SimEvent -SimEvent 'APP_ACCESS_DENIED' -Actor $user -Ip $ip -AppId $appId -AppName 'Internal ERP Portal' -CustomDelayMs (Get-Random -Minimum 100 -Maximum 400)
                }
                $expected = "Organic Jitter APP (baseline=$windowCount, denied=$deniedCount): Score varies naturally with historical noise"
                Record-RunHistory $runId $ScenarioName 'APPLICATION_ACCESS' ($baseCount + $deniedCount) $user $ip $appId $expected
            } else {
                $user = if ($Username) { $Username } else { "jitter.vpn.$tag" }
                $failCount = Get-Random -Minimum 1 -Maximum 9
                Write-Host "`n[1/1] Running BoundaryJitterMix [VPN_SSO] ($user @ $ip, baseline=$windowCount, fail=$failCount)..." -ForegroundColor Cyan
                $baseCount = Write-AccountBaseline -SuccessSimEvent 'VPN_LOGIN_SUCCESS' -Actor $user -Ip $ip -WindowCount $windowCount
                for ($f = 1; $f -le $failCount; $f++) {
                    Write-SimEvent -SimEvent 'VPN_LOGIN_FAILURE' -Actor $user -Ip $ip -CustomDelayMs (Get-Random -Minimum 120 -Maximum 500)
                }
                $expected = "Organic Jitter VPN_SSO (baseline=$windowCount, fail=$failCount): Score varies naturally with historical noise"
                Record-RunHistory $runId $ScenarioName 'VPN_SSO' ($baseCount + $failCount) $user $ip '-' $expected
            }
        }

        'ColdStartNoHistory' {
            $user = if ($Username) { $Username } else { "unknown.attacker.$tag" }
            $ip = if ($SourceIp) { $SourceIp } else { '203.0.113.88' }
            $appId = if ($ApplicationId) { $ApplicationId } else { 'payroll-core' }
            Write-Host "`n[1/1] Running ColdStartNoHistory ($user @ $ip, 0 baseline windows -> 8 auth fails + 12 app denials)..." -ForegroundColor Cyan
            1..8 | ForEach-Object {
                Write-SimEvent -SimEvent 'AUTH_LOGIN_FAILURE' -Actor $user -Ip $ip
            }
            1..12 | ForEach-Object {
                Write-SimEvent -SimEvent 'APP_ACCESS_DENIED' -Actor $user -Ip $ip -AppId $appId -AppName 'Payroll Core System'
            }
            $expected = 'FN Limitation (INSUFFICIENT_BASELINE - Score 0.0000): Attacker without history (<20 windows) blocked by Cold-Start guard despite 8 auth fails + 12 app denials'
            Record-RunHistory $runId $ScenarioName 'AUTHENTICATION+APP_ACCESS' 20 $user $ip $appId $expected
        }

        'AllCore' {
            $batch = @(
                'AuthNormal',
                'AuthSuccessAfterFail',
                'AuthMultiAccountSpray',
                'ColdStartNoHistory',
                'AppNormal',
                'AppSuccessAfterDenial',
                'VpnFailureBurst'
            )
            foreach ($item in $batch) {
                Invoke-SimScenario -ScenarioName $item
            }
            return
        }
    }

    Write-Host "Completed [$ScenarioName] -> RunId: $runId" -ForegroundColor Green
    Write-Host "Log file : $LogPath"
    Write-Host "History  : $HistoryPath"
}

function Show-SimHistory {
    Ensure-SimEnvironment
    $rows = Import-Csv -LiteralPath $HistoryPath
    if (-not $rows -or $rows.Count -eq 0) {
        Write-Host "`nChua co lich su chay nao trong $HistoryPath." -ForegroundColor Yellow
        return
    }
    Write-Host "`n=== LICH SU CAC DOT GIA LAP GAN NHAT ===" -ForegroundColor Cyan
    $rows | Select-Object -Last 15 | Format-Table RunId, StartedAtLocal, Scenario, EventFamily, EventsEmitted, Principal, SourceIp -AutoSize
}

function Check-AgentStatus {
    param([switch]$AutoConfigure)
    Ensure-SimEnvironment
    Write-Host "`n=== KIEM TRA & CAU HINH WINDOWS WAZUH AGENT ===" -ForegroundColor Cyan
    Write-Host "1. Thu muc log gia lap : $LogPath (OK)" -ForegroundColor Green
    $svc = Get-Service -Name 'WazuhSvc' -ErrorAction SilentlyContinue
    if ($svc) {
        Write-Host "2. Dich vu WazuhSvc    : $($svc.Status)" -ForegroundColor Green
    } else {
        Write-Host "2. Dich vu WazuhSvc    : Khong tim thay tren may nay (Chi can tren may cai Wazuh Agent)" -ForegroundColor Yellow
        return
    }
    $agentConf = 'C:\Program Files (x86)\ossec-agent\ossec.conf'
    if (Test-Path -LiteralPath $agentConf) {
        $content = Get-Content -LiteralPath $agentConf -Raw -ErrorAction SilentlyContinue
        if ($content -match [Regex]::Escape($LogPath)) {
            Write-Host "3. ossec.conf localfile: Da khai bao $LogPath (OK)" -ForegroundColor Green
        } else {
            Write-Host "3. ossec.conf localfile: CHUA co $LogPath trong $agentConf -> Dang tu dong cau hinh..." -ForegroundColor Yellow
            $currentPrincipal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
            if (-not $currentPrincipal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
                $argList = "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`" -Scenario SetupAgent"
                Start-Process powershell.exe -Verb RunAs -ArgumentList $argList -Wait
                return
            }
            $backupPath = "$agentConf.securaai.bak"
            [IO.File]::WriteAllText($backupPath, $content, $Utf8NoBom)
            $localfileBlock = "`r`n  <!-- SecuraAI Scenario Simulator Stream -->`r`n  <localfile>`r`n    <log_format>json</log_format>`r`n    <location>$LogPath</location>`r`n  </localfile>`r`n</ossec_config>"
            $lastCloseIndex = $content.LastIndexOf('</ossec_config>')
            if ($lastCloseIndex -ge 0) {
                $updatedContent = $content.Substring(0, $lastCloseIndex) + $localfileBlock + $content.Substring($lastCloseIndex + '</ossec_config>'.Length)
                [IO.File]::WriteAllText($agentConf, $updatedContent, $Utf8NoBom)
                Restart-Service -Name 'WazuhSvc' -Force
                Write-Host "   -> Da them <localfile> vao $agentConf va khoi dong lai WazuhSvc!" -ForegroundColor Green
            }
        }
    }
}

if ($Scenario -eq 'SetupAgent') {
    Check-AgentStatus -AutoConfigure
    return
}

if ($Scenario -ne 'Menu') {
    Invoke-SimScenario -ScenarioName $Scenario
    return
}

while ($true) {
    Write-Host "`n==================================================================" -ForegroundColor DarkCyan
    Write-Host "   SECURAAI - WAZUH WINDOWS AGENT SCENARIO MANAGER (3 FAMILIES)" -ForegroundColor Cyan
    Write-Host "==================================================================" -ForegroundColor DarkCyan
    Write-Host " [AUTHENTICATION]"
    Write-Host "   1. AuthNormal             (22-34w baseline + 1 fail + 2 success -> TN that, Score < 0.67)"
    Write-Host "   2. AuthBurst              (22-34w baseline + 6 fail -> TP ANOMALY ~0.88-0.94)"
    Write-Host "   3. AuthSuccessAfterFail   (22-34w baseline + 6 fail + 1 success -> TP ANOMALY ~0.88-0.94)"
    Write-Host "   4. AuthMultiAccountSpray  (6 tai khoan x 2 fail tu 1 IP -> Gioi han FN Spray, Score 0.0000)"
    Write-Host "   5. AuthAccountLockout     (22-34w baseline + 5 fail + 1 lockout -> TP ANOMALY ~0.88-0.94)"
    Write-Host "   13. WinNativeAuthFail     (6 su kien Windows Security 4625 that qua SMB local)"
    Write-Host " [APPLICATION_ACCESS]"
    Write-Host "   6. AppNormal              (22-34w baseline + 1 denied + 2 granted -> TN that, Score < 0.67)"
    Write-Host "   7. AppDenialBurst         (22-34w baseline + 11 denied -> TP ANOMALY ~0.88-0.94)"
    Write-Host "   8. AppSuccessAfterDenial  (22-34w baseline + 10 denied + 1 granted -> TP ANOMALY ~0.88-0.94)"
    Write-Host " [VPN_SSO]"
    Write-Host "   9. VpnNormal              (22-34w baseline + 1 fail + 2 success -> TN that, Score < 0.67)"
    Write-Host "   10. VpnFailureBurst       (22-34w baseline + 6 OpenVPN fail -> TP ANOMALY ~0.88-0.94)"
    Write-Host "   11. SsoFailureBurst       (22-34w baseline + 6 Keycloak SSO fail -> TP ANOMALY ~0.88-0.94)"
    Write-Host "   12. SsoBaselineAndNewIp   (22-34w SSO IP cu + 1 IP moi -> Off-hours New Context)"
    Write-Host " [KIEM CHUNG BIEN THIEN NGAU NHIEN & GIOI HAN COLD-START]"
    Write-Host "   14. AppAuditScanProfile   (Baseline 21-34w + 2-14 denied ngau nhien + jitter)"
    Write-Host "   15. BoundaryJitterMix     (Baseline 18-33w + su kien ngau nhien vat ngang nguong)"
    Write-Host "   16. ColdStartNoHistory    (Ke tan cong moi 0 lich su: 8 fail + 12 denied -> Gioi han FN Cold-Start)"
    Write-Host " [TIEN ICH QUAN LY]"
    Write-Host "   A. Chay bo 7 kich ban dai dien (AllCore: TN, TP, FN Spray, FN Cold-Start)"
    Write-Host "   R. Chay 5 luot ngau nhien (14 + 15) de danh gia thong ke"
    Write-Host "   H. Xem lich su cac dot da chay (run-history.csv)"
    Write-Host "   C. Kiem tra trang thai Wazuh Agent & file log"
    Write-Host "   Q. Thoat"
    Write-Host "------------------------------------------------------------------" -ForegroundColor DarkCyan

    $choice = (Read-Host "Chon kich ban (1-16, A, R, H, C, Q)").Trim().ToUpperInvariant()
    switch ($choice) {
        '1'  { Invoke-SimScenario 'AuthNormal' }
        '2'  { Invoke-SimScenario 'AuthBurst' }
        '3'  { Invoke-SimScenario 'AuthSuccessAfterFail' }
        '4'  { Invoke-SimScenario 'AuthMultiAccountSpray' }
        '5'  { Invoke-SimScenario 'AuthAccountLockout' }
        '6'  { Invoke-SimScenario 'AppNormal' }
        '7'  { Invoke-SimScenario 'AppDenialBurst' }
        '8'  { Invoke-SimScenario 'AppSuccessAfterDenial' }
        '9'  { Invoke-SimScenario 'VpnNormal' }
        '10' { Invoke-SimScenario 'VpnFailureBurst' }
        '11' { Invoke-SimScenario 'SsoFailureBurst' }
        '12' { Invoke-SimScenario 'SsoBaselineAndNewIp' }
        '13' { Invoke-SimScenario 'WinNativeAuthFail' }
        '14' { Invoke-SimScenario 'AppAuditScanProfile' }
        '15' { Invoke-SimScenario 'BoundaryJitterMix' }
        '16' { Invoke-SimScenario 'ColdStartNoHistory' }
        'A'  { Invoke-SimScenario 'AllCore' }
        'R'  {
            1..5 | ForEach-Object {
                $pick = if ((Get-Random -Minimum 0 -Maximum 2) -eq 0) { 'AppAuditScanProfile' } else { 'BoundaryJitterMix' }
                Invoke-SimScenario $pick
            }
        }
        'H'  { Show-SimHistory }
        'C'  { Check-AgentStatus }
        'Q'  { Write-Host "Da thoat." -ForegroundColor Cyan; return }
        default { Write-Host "Lua chon khong hop le." -ForegroundColor Yellow }
    }
}
