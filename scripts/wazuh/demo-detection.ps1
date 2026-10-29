[CmdletBinding()]
param(
    [ValidateSet('All', 'AuthBurst', 'AuthSuccess', 'AppDenial', 'AppSuccess', 'VpnBurst', 'VpnNewContext', 'Normal')]
    [string]$Case = 'All',
    [string]$Container = 'single-node-wazuh.manager-1',
    [switch]$Send
)

$ErrorActionPreference = 'Stop'
$demoPath = Join-Path $PSScriptRoot '../../docs/contextual-detection-demo.json'
$records = Get-Content -LiteralPath $demoPath -Raw | ConvertFrom-Json
$runId = 'wazuh-demo-' + [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds() + '-' + [guid]::NewGuid().ToString('N').Substring(0, 6)
$outputDirectory = Join-Path ([IO.Path]::GetTempPath()) $runId
[void][IO.Directory]::CreateDirectory($outputDirectory)
$utf8 = New-Object System.Text.UTF8Encoding($false)

# Anchor the newest event at yesterday 18:00 UTC (01:00 Vietnam time).
# All events stay in the past; relative sequence/baseline intervals are preserved.
$anchor = [DateTime]::UtcNow.Date.AddDays(-1).AddHours(18)
$reference = [DateTimeOffset]::Parse('2026-10-29T18:00:00Z').UtcDateTime
$shift = $anchor - $reference
$expected = @{
    All = '49 events; 9 rule matches; 6 alerts; 3 grouped matches'
    AuthBurst = '6 events; AUTH_FAILURE_BURST; 1 alert + 1 grouped match'
    AuthSuccess = '7 events; AUTH_FAILURE_BURST + AUTH_SUCCESS_AFTER_FAILURE; 2 alerts + 1 grouped match'
    AppDenial = '11 events; APP_DENIAL_BURST; 1 alert + 1 grouped match'
    AppSuccess = '12 events; APP_DENIAL_BURST + APP_SUCCESS_AFTER_DENIAL; 2 alerts + 1 grouped match'
    VpnBurst = '6 events; VPN_SSO_FAILURE_BURST; 1 alert + 1 grouped match'
    VpnNewContext = '21 events; VPN_SSO_NEW_CONTEXT_OFF_HOURS; 1 alert (after 20 baseline events)'
    Normal = '3 events; no alerts with default thresholds'
}
$selected = @($records | Where-Object {
    $item = $_
    switch ($Case) {
        'All' { $true }
        'AuthBurst' { $item.accountIdentifier -eq 'demo-auth' -and $item.eventType -eq 'LOGIN_FAILURE' }
        'AuthSuccess' { $item.accountIdentifier -eq 'demo-auth' }
        'AppDenial' { $item.accountIdentifier -eq 'demo-app' -and $item.eventType -eq 'ACCESS_DENIED' }
        'AppSuccess' { $item.accountIdentifier -eq 'demo-app' }
        'VpnBurst' { $item.accountIdentifier -eq 'demo-vpn-burst' }
        'VpnNewContext' { $item.accountIdentifier -eq 'demo-sso-new-context' }
        'Normal' { $item.accountIdentifier -like 'demo-normal-*' }
    }
} | Sort-Object occurredAt, externalEventId)

$index = 0
foreach ($record in $selected) {
    $index++
    $timestamp = ([DateTimeOffset]::Parse($record.occurredAt).UtcDateTime + $shift).ToString("yyyy-MM-ddTHH:mm:ss.fff'Z'")
    $account = $runId + '-' + $record.accountIdentifier
    $data = @{ dstuser = $account; srcip = $record.sourceIp }
    switch ($record.eventFamily) {
        'AUTHENTICATION' {
            $failed = $record.eventType -eq 'LOGIN_FAILURE'
            $description = if ($failed) { 'Simulated Windows login failed' } else { 'Simulated Windows login success' }
            $groups = @('windows', 'windows_security')
            $eventCode = if ($failed) { '4625' } else { '4624' }
            $data.win = @{ system = @{ eventID = $eventCode; channel = 'Security' }; eventdata = @{ targetUserName = $account; ipAddress = $record.sourceIp } }
        }
        'APPLICATION_ACCESS' {
            $description = if ($record.eventType -eq 'ACCESS_DENIED') { 'Simulated application access denied' } else { 'Simulated application login success' }
            $groups = @('web_access_auth')
            $data.application_id = $record.normalizedPayload.applicationId
        }
        'VPN_SSO' {
            $isSso = $record.eventType.StartsWith('SSO_')
            $protocol = if ($isSso) { 'sso' } else { 'vpn' }
            $result = if ($record.eventType.EndsWith('FAILURE')) { 'failed' } else { 'success' }
            $description = "Simulated $protocol login $result"
            $groups = @($protocol)
        }
    }
    $alert = @{
        id = "$runId-$index"
        timestamp = $timestamp
        rule = @{ id = '929001'; level = 3; description = $description; groups = $groups }
        agent = @{ id = '001'; name = 'SecuraAI-Demo-Device'; ip = '192.0.2.50' }
        data = $data
    }
    $filePath = Join-Path $outputDirectory ('{0:D3}.json' -f $index)
    [IO.File]::WriteAllText($filePath, ($alert | ConvertTo-Json -Depth 12), $utf8)
}

Write-Host "Case: $Case | Run: $runId"
Write-Host "Files: $outputDirectory"
Write-Host "Generated: $index events"
Write-Host "Expected (new engine/default configuration): $($expected[$Case])"
if (-not $Send) {
    Write-Host 'Files generated only. Add -Send to dispatch through the Wazuh integration.'
    return
}

# Read the key inside the container. Never print it or place it in the PowerShell command line.
$dispatcher = @'
import glob, json, os, re, subprocess, sys
config = open('/var/ossec/etc/ossec.conf', encoding='utf-8').read()
block = re.search(r'<integration>\s*<name>custom-securaai</name>.*?</integration>', config, re.S)
if not block:
    sys.exit('custom-securaai integration is not configured in ossec.conf')
def setting(name):
    match = re.search(r'<' + name + r'>(.*?)</' + name + r'>', block.group(), re.S)
    return match.group(1).strip() if match else ''
key, hook = setting('api_key'), setting('hook_url')
if not key or not hook:
    sys.exit('Missing api_key or hook_url in custom-securaai integration')
integration = '/var/ossec/integrations/custom-securaai'
source = open(integration, encoding='utf-8').read()
directory = sys.argv[1]
files = sorted(glob.glob(os.path.join(directory, '*.json')))
if any(json.load(open(path, encoding='utf-8'))['rule']['groups'] == ['web_access_auth'] for path in files) and 'applicationId' not in source:
    sys.exit('Deploy the updated scripts/wazuh/custom-securaai first: application identity is required for App Access rules')
log = '/var/ossec/logs/integrations.log'
for path in files:
    event = json.load(open(path, encoding='utf-8'))
    before = os.path.getsize(log) if os.path.exists(log) else 0
    result = subprocess.run([sys.executable, integration, path, key, hook], capture_output=True, text=True)
    with open(log, encoding='utf-8', errors='replace') as stream:
        stream.seek(before)
        messages = stream.read()
    if result.returncode or ('Successfully posted event [' + event['id'] + ']') not in messages:
        sys.exit('Dispatch failed for ' + os.path.basename(path) + '; inspect integrations.log (no success was confirmed)')
    print('Posted ' + event['id'], flush=True)
print('Complete. Check Security Events, then Anomaly Monitoring. Do not run manual detection for realtime verification.', flush=True)
'@
$dispatcherPath = Join-Path $outputDirectory 'dispatch.py'
[IO.File]::WriteAllText($dispatcherPath, $dispatcher, $utf8)
$containerDirectory = '/tmp/' + $runId
& docker cp $outputDirectory "${Container}:$containerDirectory"
if ($LASTEXITCODE -ne 0) { throw 'docker cp failed. Check Docker Desktop and the Wazuh container.' }
& docker exec $Container /var/ossec/framework/python/bin/python3 "$containerDirectory/dispatch.py" $containerDirectory
if ($LASTEXITCODE -ne 0) { throw 'Demo dispatch failed; stop and inspect the integration configuration/log.' }
Write-Host 'Dispatch complete. The automated worker processes these Wazuh API events when enabled.'
