param([ValidateSet('inspect','backup','grant','audit')][string]$Action='inspect')
$ErrorActionPreference='Stop'
$taskRepo=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$taskTarget=Join-Path $taskRepo 'node_modules/electron/dist'
$taskOutput=Join-Path $PSScriptRoot 'artifacts/search-round2/execution-lane-closeout'
if (-not $taskTarget.StartsWith($taskRepo+[IO.Path]::DirectorySeparatorChar)) { throw 'TARGET_ESCAPE' }
if ((Get-Item -LiteralPath $taskTarget).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'REPARSE_TARGET' }
function Read-TaskAcl([string]$taskPath) {
  try {
    $taskAcl=Get-Acl -LiteralPath $taskPath -ErrorAction Stop
    $taskRules=@($taskAcl.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier]) | ForEach-Object {
      [ordered]@{sid=$_.IdentityReference.Value;rights=[int]$_.FileSystemRights;rightsText=$_.FileSystemRights.ToString();type=$_.AccessControlType.ToString();inherited=$_.IsInherited;inheritance=$_.InheritanceFlags.ToString();propagation=$_.PropagationFlags.ToString()}
    })
    return [ordered]@{path=$taskPath;owner=$taskAcl.Owner;protected=$taskAcl.AreAccessRulesProtected;sddl=$taskAcl.Sddl;rules=$taskRules;readable=$true}
  } catch { return [ordered]@{path=$taskPath;readable=$false;error=$_.Exception.Message} }
}
function Save-TaskJson($taskName,$taskValue) { $taskValue | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath (Join-Path $taskOutput $taskName) -Encoding utf8 }
function Read-TaskTree {
  $taskItems=@((Get-Item -LiteralPath $taskTarget)) + @(Get-ChildItem -LiteralPath $taskTarget -Recurse -Force)
  if ($taskItems | Where-Object { $_.Attributes -band [IO.FileAttributes]::ReparsePoint }) { throw 'REPARSE_CHILD' }
  return @($taskItems | Sort-Object FullName | ForEach-Object { Read-TaskAcl $_.FullName })
}
if ($Action -eq 'inspect') {
  $taskPaths=@($taskRepo,(Join-Path $taskRepo 'node_modules'),(Join-Path $taskRepo 'node_modules/electron'),$taskTarget,(Join-Path $taskTarget 'electron.exe'))
  $taskParent=Split-Path $taskRepo -Parent
  while ($taskParent) { $taskPaths+=$taskParent; $taskNext=Split-Path $taskParent -Parent; if ($taskNext -eq $taskParent) { break }; $taskParent=$taskNext }
  Save-TaskJson 'acl-chain-before.json' @($taskPaths | ForEach-Object { Read-TaskAcl $_ })
  'ACL chain recorded; unreadable ancestors remain explicitly unknown'
} elseif ($Action -eq 'backup') {
  if (Test-Path -LiteralPath (Join-Path $taskOutput 'acl-dist-before.json')) { throw 'BACKUP_ALREADY_EXISTS' }
  $taskTree=Read-TaskTree
  if ($taskTree | Where-Object { -not $_.readable }) { throw 'UNREADABLE_TARGET_ACL' }
  Save-TaskJson 'acl-dist-before.json' $taskTree
  Push-Location (Split-Path $taskTarget -Parent)
  try { & icacls.exe 'dist' /save (Join-Path $taskOutput 'electron-dist.acl') /T /Q; if ($LASTEXITCODE -ne 0) { throw 'ACL_BACKUP_FAILED' } } finally { Pop-Location }
  Save-TaskJson 'acl-recovery-plan.json' ([ordered]@{target=$taskTarget;grant='*S-1-15-2-1:(OI)(CI)(RX)';restoreBase=(Split-Path $taskTarget -Parent);backup=(Join-Path $taskOutput 'electron-dist.acl');restoreCommand='icacls <restoreBase> /restore <backup>';items=$taskTree.Count;otherAclChanges=$false})
} elseif ($Action -eq 'grant') {
  if (-not (Test-Path -LiteralPath (Join-Path $taskOutput 'electron-dist.acl'))) { throw 'BACKUP_REQUIRED' }
  $taskReview=Get-Content -LiteralPath (Join-Path $taskOutput 'reproduction-review.json') -Raw | ConvertFrom-Json
  if (-not $taskReview.sameAclFatal) { throw 'REPRODUCED_ACL_FATAL_REQUIRED' }
  & icacls.exe $taskTarget /grant '*S-1-15-2-1:(OI)(CI)(RX)'
  $taskExit=$LASTEXITCODE
  Save-TaskJson 'acl-mutation.json' ([ordered]@{time=(Get-Date).ToUniversalTime().ToString('o');target=$taskTarget;arguments=@('/grant','*S-1-15-2-1:(OI)(CI)(RX)');exit=$taskExit})
  if ($taskExit -ne 0) { throw 'ACL_GRANT_FAILED' }
} elseif ($Action -eq 'audit') {
  $taskBefore=Get-Content -LiteralPath (Join-Path $taskOutput 'acl-dist-before.json') -Raw | ConvertFrom-Json
  $taskAfter=Read-TaskTree
  Save-TaskJson 'acl-dist-after.json' $taskAfter
  $taskProblems=@()
  foreach ($taskCurrent in $taskAfter) {
    $taskPrevious=$taskBefore | Where-Object path -eq $taskCurrent.path
    if (-not $taskCurrent.readable -or -not $taskPrevious -or $taskPrevious.owner -ne $taskCurrent.owner -or $taskPrevious.protected -ne $taskCurrent.protected) { $taskProblems+='owner/inheritance/readability: '+$taskCurrent.path; continue }
    $taskOld=@($taskPrevious.rules | Where-Object sid -ne 'S-1-15-2-1' | ConvertTo-Json -Compress)
    $taskNow=@($taskCurrent.rules | Where-Object sid -ne 'S-1-15-2-1' | ConvertTo-Json -Compress)
    if (($taskOld -join '') -ne ($taskNow -join '')) { $taskProblems+='other ACE changed: '+$taskCurrent.path }
    $taskPackage=@($taskCurrent.rules | Where-Object sid -eq 'S-1-15-2-1')
    if (-not $taskPackage.Count -or ($taskPackage | Where-Object { $_.type -ne 'Allow' -or $_.rights -ne 1179817 })) { $taskProblems+='package RX mismatch: '+$taskCurrent.path }
  }
  Save-TaskJson 'acl-audit.json' ([ordered]@{passed=($taskProblems.Count -eq 0 -and $taskBefore.Count -eq $taskAfter.Count);itemsBefore=$taskBefore.Count;itemsAfter=$taskAfter.Count;problems=$taskProblems;grantedSid='S-1-15-2-1';restrictedSidNotAdded=$true;scope=$taskTarget})
  if ($taskProblems.Count) { throw ($taskProblems -join '; ') }
  'ACL audit passed: '+$taskAfter.Count+' objects; only package RX added'
}
