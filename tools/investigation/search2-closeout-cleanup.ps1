param([ValidateSet('processes','files')][string]$Action='files')
$ErrorActionPreference='Stop'
$taskRepo=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$taskRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot 'artifacts/search-round2/execution-lane-closeout'))
if (-not $taskRoot.StartsWith($taskRepo+[IO.Path]::DirectorySeparatorChar)) { throw 'ROOT_ESCAPE' }
if ($Action -eq 'processes') {
  $taskProcesses=@(Get-CimInstance Win32_Process | Where-Object {
    ($_.ExecutablePath -and $_.ExecutablePath.StartsWith($taskRepo+[IO.Path]::DirectorySeparatorChar)) -or
    ($_.Name -match '^(electron|node)\.exe$' -and $_.CommandLine -match 'search2-(closeout|lanes|lane)')
  } | Select-Object ProcessId,ParentProcessId,Name,ExecutablePath)
  [ordered]@{time=(Get-Date).ToUniversalTime().ToString('o');ownedProcesses=$taskProcesses;ownedProcessCount=$taskProcesses.Count;method='normal-user CIM: all executables inside project (including build/crashpad helpers) + private Search Node/Electron tool command lines; no process killed'} | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $taskRoot 'process-audit.json') -Encoding utf8
  if ($taskProcesses.Count) { throw 'OWNED_PROCESS_REMAINS' }
  'Owned Electron/Node/Search processes = 0'
  exit
}
$taskOwned=@('electron-profile','explorer-second','raw-fixtures','user-data') | ForEach-Object { Join-Path $taskRoot $_ }
$taskOriginalProfile=[IO.Path]::GetFullPath((Join-Path $taskRoot '../lane-electron-profile'))
$taskBaseline=Get-Content -LiteralPath (Join-Path $taskRoot 'baseline.json') -Raw | ConvertFrom-Json
if (Test-Path -LiteralPath $taskOriginalProfile) {
  if ((Get-Item -LiteralPath $taskOriginalProfile).CreationTimeUtc -ge [DateTimeOffset]::Parse($taskBaseline.measuredAt).UtcDateTime) { $taskOwned+=$taskOriginalProfile }
}
$taskRemoved=@()
foreach ($taskPath in $taskOwned) {
  if (-not (Test-Path -LiteralPath $taskPath)) { continue }
  $taskResolved=(Resolve-Path -LiteralPath $taskPath).Path
  $taskParent=[IO.Path]::GetFullPath((Join-Path $taskRoot '..'))
  if (-not ($taskResolved.StartsWith($taskRoot+[IO.Path]::DirectorySeparatorChar) -or $taskResolved -eq $taskOriginalProfile) -or -not $taskResolved.StartsWith($taskParent+[IO.Path]::DirectorySeparatorChar)) { throw 'DELETE_ESCAPE' }
  $taskItems=@((Get-Item -LiteralPath $taskResolved)) + @(Get-ChildItem -LiteralPath $taskResolved -Force -Recurse)
  if ($taskItems | Where-Object { $_.Attributes -band [IO.FileAttributes]::ReparsePoint }) { throw 'REPARSE_CLEANUP' }
  $taskBytes=($taskItems | Where-Object { -not $_.PSIsContainer } | Measure-Object Length -Sum).Sum
  Remove-Item -LiteralPath $taskResolved -Recurse -Force
  $taskRemoved+=@{path=$taskResolved;bytes=$taskBytes;removed=$true}
}
$taskDatabases=@(Get-ChildItem -LiteralPath $taskRoot -Recurse -File | Where-Object Name -Match '\.db(?:-wal|-shm)?$')
if ($taskDatabases.Count) { throw 'UNREVIEWED_DATABASE_REMAINS' }
[ordered]@{time=(Get-Date).ToUniversalTime().ToString('o');removed=$taskRemoved;remainingDatabaseFiles=0;aclBackupPreserved=(Test-Path -LiteralPath (Join-Path $taskRoot 'electron-dist.acl'));evidencePreserved=$true;sourceRootUntouched=$true} | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $taskRoot 'cleanup.json') -Encoding utf8
'Profiles/fixtures removed; DB/WAL/SHM = 0; ACL backup preserved'
