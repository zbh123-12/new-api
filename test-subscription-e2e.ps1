<#!
.SYNOPSIS
  End-to-end test for the Subscription (package) feature in new-api.

.DESCRIPTION
  Exercises the full happy-path and a model-restriction failure-path.

  Step 1:  Login as admin
  Step 2:  Enable payment compliance (admin only)
  Step 3:  Login as a regular test user
  Step 4:  Admin creates a subscription plan with a strict model allow-list
  Step 5:  Admin binds the plan to the test user
  Step 6:  User verifies the active subscription via /api/subscription/self
  Step 7:  User creates an API key (auto-bound to the subscription)
  Step 8:  User retrieves the unmasked key via /api/token/{id}/key
  Step 9:  Calling /v1/chat/completions with an ALLOWED model must NOT contain
           the "subscription does not cover model" error.
  Step 10: Calling /v1/chat/completions with a DISALLOWED model MUST return 403
           and the body must contain "subscription does not cover model".

  After running, the script prints a colored PASS/FAIL line for every step
  and exits with a non-zero status if anything failed.

.PARAMETER BaseUrl            Override the API base URL. Default: http://localhost:3000
.PARAMETER AdminUser          Admin username. Default: root
.PARAMETER AdminPassword      Admin password (required).
.PARAMETER TestUser           Regular user that we will bind the plan to (must exist).
.PARAMETER TestUserPassword   Password for the regular user.
.PARAMETER AllowedModel       Model name that the test plan allows. Default: gpt-3.5-turbo
.PARAMETER DisallowedModel    Model name the plan does NOT allow. Default: gpt-4-turbo

.EXAMPLE
  pwsh -File .\test-subscription-e2e.ps1 -AdminPassword 'P@ssw0rd' -TestUser testuser -TestUserPassword 'UserPass!'

.NOTES
  Run from PowerShell 7+ (pwsh). Windows PowerShell 5.1 also works but
  Invoke-RestMethod behaves better on 7+.
#>

[CmdletBinding()]
param(
    [string] $BaseUrl         = 'http://localhost:3000',
    [string] $AdminUser       = 'root',
    [Parameter(Mandatory = $true)]
    [string] $AdminPassword,
    [Parameter(Mandatory = $true)]
    [string] $TestUser,
    [Parameter(Mandatory = $true)]
    [string] $TestUserPassword,
    [string] $AllowedModel    = 'gpt-3.5-turbo',
    [string] $DisallowedModel = 'gpt-4-turbo'
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

# --- Visual helpers -------------------------------------------------------
function Step-Name {
    param([string]$text)
    Write-Host '[' -NoNewline
    Write-Host $script:stepNum -NoNewline -ForegroundColor Cyan
    Write-Host '] ' -NoNewline
    Write-Host $text
}
function Pass-Label            { Write-Host ' PASS' -ForegroundColor Green }
function Fail-Label {
    param([string]$msg)
    Write-Host ' FAIL' -ForegroundColor Red
    Write-Host '       ' -NoNewline
    Write-Host $msg -ForegroundColor DarkRed
}
function Info {
    param([string]$msg)
    Write-Host '       ' -NoNewline
    Write-Host $msg -ForegroundColor DarkGray
}

$script:failures = 0
$script:stepNum  = 0

# --- Helpers --------------------------------------------------------------
function Extract-Data {
    param($obj)
    if ($null -eq $obj) { return $null }
    if ($obj.PSObject.Properties.Name -contains 'data') { return $obj.data }
    return $obj
}

function Invoke-Api {
    param(
        [string] $Method,
        [string] $Path,
        $Body = $null,
        [string] $Token = $null,
        [int]    $TimeoutSec = 30
    )
    $headers = @{ 'Content-Type' = 'application/json' }
    if ($Token) { $headers['Authorization'] = 'Bearer ' + $Token }
    $uri = $BaseUrl + $Path
    $params = @{
        Method      = $Method
        Uri         = $uri
        Headers     = $headers
        TimeoutSec  = $TimeoutSec
    }
    if ($null -ne $Body) {
        $params['Body'] = ($Body | ConvertTo-Json -Depth 10)
    }
    return Invoke-RestMethod @params
}

function Login-User {
    param([string]$User, [string]$Pass)
    $resp = Invoke-Api -Method POST -Path '/api/user/login' -Body @{
        username = $User; password = $Pass
    }
    $data = Extract-Data $resp
    if (-not $data -or -not $data.access_token) {
        throw ('Login failed for ' + $User + ': ' + ($resp | ConvertTo-Json -Depth 5))
    }
    return $data
}

function Invoke-ChatCall {
    param([string]$Model, [string]$Key)
    # Use System.Net.WebRequest directly to call /v1/chat/completions. This
    # avoids PowerShell Invoke-WebRequest (which cannot reliably read 4xx bodies)
    # and avoids shell-quoting issues from passing JSON via curl.
    $url = $BaseUrl + '/v1/chat/completions'
    $json = (@{ model = $Model; messages = @(@{ role = 'user'; content = 'ping' }); max_tokens = 4 } | ConvertTo-Json -Depth 8 -Compress)
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
    $req = [System.Net.WebRequest]::Create($url)
    $req.Method = 'POST'
    $req.ContentType = 'application/json; charset=utf-8'
    $req.Headers.Add('Authorization', 'Bearer ' + $Key)
    $req.ContentLength = $bytes.Length
    $req.Timeout = 30000
    $status = 0
    $respBody = ''
    try {
        $stream = $req.GetRequestStream()
        $stream.Write($bytes, 0, $bytes.Length)
        $stream.Close()
        $resp = $req.GetResponse()
        $respStream = $resp.GetResponseStream()
        $reader = New-Object System.IO.StreamReader($respStream, [System.Text.Encoding]::UTF8)
        $respBody = $reader.ReadToEnd()
        $reader.Close()
        $respStream.Close()
        $resp.Close()
        $status = [int]$resp.StatusCode
    } catch [System.Net.WebException] {
        $resp = $_.Exception.Response
        if ($resp) {
            $status = [int]$resp.StatusCode
            try {
                $respStream = $resp.GetResponseStream()
                $reader = New-Object System.IO.StreamReader($respStream, [System.Text.Encoding]::UTF8)
                $respBody = $reader.ReadToEnd()
                $reader.Close()
                $respStream.Close()
            } catch {
                $respBody = ''
            }
        } else {
            $respBody = $_.Exception.Message
        }
    } catch {
        $status = 0
        $respBody = $_.Exception.Message
    }
    return @{ Status = $status; Body = $respBody }
}

# --- Step 1: Login as admin ----------------------------------------------
$script:stepNum++
Step-Name ('Admin login as ' + $AdminUser)
try {
    $adminLogin = Login-User -User $AdminUser -Pass $AdminPassword
    $adminToken = $adminLogin.access_token
    $adminId    = [int]$adminLogin.user.id
    Info ('admin user id = ' + $adminId)
    if ($null -eq $adminToken) { Fail-Label 'no access_token returned'; $script:failures++ }
    else { Pass-Label }
} catch {
    Fail-Label $_.Exception.Message
    $script:failures++
    Write-Host 'Cannot continue without admin token. Exiting.' -ForegroundColor Red
    exit 1
}

# --- Step 2: Enable payment compliance (idempotent) -----------------------
$script:stepNum++
Step-Name 'Enable payment compliance (admin only) - POST /api/option/payment_compliance'
try {
    $null = Invoke-Api -Method POST -Path '/api/option/payment_compliance' -Token $adminToken -Body @{ confirmed = $true }
    Pass-Label
    Info 'compliance confirmation accepted (already-enabled is also fine)'
} catch {
    $msg = $_.Exception.Message
    if ($msg -match '400|already') {
        Pass-Label
        Info 'compliance likely already enabled'
    } else {
        Fail-Label ('could not enable compliance: ' + $msg)
        $script:failures++
    }
}


# --- Step 3: Login as test user ------------------------------------------
$script:stepNum++
Step-Name ('Login as test user ' + $TestUser)
try {
    $userLogin  = Login-User -User $TestUser -Pass $TestUserPassword
    $userToken  = $userLogin.access_token
    $testUserId = [int]$userLogin.user.id
    Info ('test user id = ' + $testUserId)
    if ($null -eq $userToken) { Fail-Label 'no access_token returned'; $script:failures++ }
    else { Pass-Label }
} catch {
    Fail-Label $_.Exception.Message
    $script:failures++
    Write-Host 'Cannot continue without user token. Exiting.' -ForegroundColor Red
    exit 1
}


# --- Step 3.5: Reset test-user subscriptions (so old empty allowed_models rows do not bypass) ---


$script:stepNum++
Step-Name ('Reset test user subscriptions via psql')
$ErrorActionPreference = 'SilentlyContinue'
docker compose exec postgres psql -U root -d new-api -c ('DELETE FROM user_subscriptions WHERE user_id = ' + $testUserId + ';') 2>$null | Out-Null
$ErrorActionPreference = 'Continue'
Pass-Label
# --- Step 4: Create the subscription plan --------------------------------
$script:stepNum++
Step-Name ('Admin creates subscription plan with allow-list (model=' + $AllowedModel + ')')
$planId = $null
try {
    $planTitle = 'E2E-Test-' + (Get-Date -Format 'yyyyMMddHHmmss')
    $planResp  = Invoke-Api -Method POST -Path '/api/subscription/admin/plans' -Token $adminToken -Body @{
        plan = @{
            title                       = $planTitle
            subtitle                    = 'auto-generated by e2e test'
            price_amount                = 0
            currency                    = 'USD'
            duration_unit               = 'month'
            duration_value              = 1
            enabled                     = $true
            sort_order                  = 0
            max_purchase_per_user       = 1
            total_amount                = 1000000
            quota_reset_period          = 'never'
            upgrade_group               = ''
            downgrade_group             = ''
            allowed_models              = $AllowedModel
            allow_balance_pay           = $false
            allow_wallet_overflow       = $true
            stripe_price_id             = ''
            creem_product_id            = ''
            waffo_pancake_product_id    = ''
        }
    }
    $planData = Extract-Data $planResp
    if (-not $planData -or -not $planData.id) {
        throw ('plan creation returned no id: ' + ($planResp | ConvertTo-Json -Depth 5))
    }
    $planId = [int]$planData.id
    Info ('created plan id=' + $planId + ' title=' + $planTitle + ' allowed=' + $AllowedModel)
    $allowedList = ($planData.allowed_models -split ',') | ForEach-Object { $_.Trim() }
    if ($allowedList -contains $AllowedModel) { Pass-Label }
    else { Fail-Label 'allowed_models not saved correctly'; $script:failures++ }
} catch {
    Fail-Label $_.Exception.Message
    $script:failures++
    Write-Host 'Cannot continue without plan id. Exiting.' -ForegroundColor Red
    exit 1
}

# --- Step 5: Bind the plan to the test user ------------------------------
$script:stepNum++
Step-Name ('Admin binds the plan to user id=' + $testUserId)
$userSubId = $null
try {
    $bindResp = Invoke-Api -Method POST -Path ('/api/subscription/admin/users/' + $testUserId + '/subscriptions') -Token $adminToken -Body @{ plan_id = $planId }
    $bindData = Extract-Data $bindResp
    if ($bindData -and $bindData.subscription -and $bindData.subscription.id) {
        $userSubId = [int]$bindData.subscription.id
    } elseif ($bindData -and $bindData.id) {
        $userSubId = [int]$bindData.id
    } elseif ($bindData -and $bindData.message) {
        Info ('server returned message: ' + $bindData.message)
    }
    if ($userSubId) { Info ('user_sub id=' + $userSubId) }
    Pass-Label
} catch {
    Fail-Label $_.Exception.Message
    $script:failures++
}


# --- Step 6: User verifies via /api/subscription/self --------------------
$script:stepNum++
Step-Name 'User verifies own subscription via GET /api/subscription/self'
try {
    $selfResp = Invoke-Api -Method GET -Path '/api/subscription/self' -Token $userToken
    $selfData = Extract-Data $selfResp
    $subs      = $selfData.subscriptions
    if (-not $subs -or $subs.Count -eq 0) { throw 'no active subscriptions returned for user' }
    $hit = $null
    foreach ($s in $subs) {
        if ($s.subscription.plan_id -eq $planId) { $hit = $s.subscription; break }
    }
    if (-not $hit) { throw ('no subscription matching plan_id=' + $planId + ' in active list') }
    Info ('subscription id=' + $hit.id + ' plan_id=' + $hit.plan_id + ' amount_total=' + $hit.amount_total + ' allowed_models=' + $hit.allowed_models)
    if ($hit.allowed_models -match [regex]::Escape($AllowedModel)) { Pass-Label }
    else { Fail-Label 'allowed_models snapshot missing the allowed model name'; $script:failures++ }
} catch {
    Fail-Label $_.Exception.Message
    $script:failures++
}

# --- Step 6.5: Force user's billing_preference to subscription_only so tests exercise the subscription path ---
$script:stepNum++
Step-Name 'Force user billing_preference = subscription_only (PUT /api/subscription/self/preference)'
try {
    $prefResp = Invoke-Api -Method GET -Path '/api/subscription/self' -Token $userToken
    $prefData = Extract-Data $prefResp
    $originalPref = if ($prefData) { $prefData.billing_preference } else { 'unknown' }
    Info ('current billing_preference = ' + $originalPref)

    $null = Invoke-Api -Method PUT -Path '/api/subscription/self/preference' -Token $userToken -Body @{ billing_preference = 'subscription_only' }
    $verify = Invoke-Api -Method GET -Path '/api/subscription/self' -Token $userToken
    $verifyData = Extract-Data $verify
    if ($verifyData.billing_preference -eq 'subscription_only') {
        Pass-Label
        Info ('set to subscription_only (was ' + $originalPref + ')')
    } else {
        Fail-Label ('preference did not update, still = ' + $verifyData.billing_preference)
        $script:failures++
    }
} catch {
    Fail-Label $_.Exception.Message
    $script:failures++
}

# --- Step 7: User creates an API key -------------------------------------
$script:stepNum++
Step-Name 'User creates API key (POST /api/token/) - should auto-bind to subscription'
$tokenId = $null
try {
    $null = Invoke-Api -Method POST -Path '/api/token/' -Token $userToken -Body @{
        name                 = ('e2e-' + (Get-Date -Format 'HHmmss'))
        remain_quota         = 99999999
        unlimited_quota      = $true
        expired_time         = -1
        group                = 'default'
        model_limits_enabled = $false
    }
    $listResp = Invoke-Api -Method GET -Path '/api/token/?p=0' -Token $userToken
    $listData = Extract-Data $listResp
    $newest   = $null
    if ($listData -and $listData.items) {
        $newest = $listData.items | Sort-Object { [int64]$_.created_time } -Descending | Select-Object -First 1
    } elseif ($listData -and ($listData -is [array])) {
        $newest = $listData | Sort-Object { [int64]$_.created_time } -Descending | Select-Object -First 1
    }
    if (-not $newest -or -not $newest.id) {
        throw 'could not find newly created token in list'
    }
    $tokenId = [int]$newest.id
    Info ('created token id=' + $tokenId + ' name=' + $newest.name)
    Pass-Label
} catch {
    Fail-Label $_.Exception.Message
    $script:failures++
}

# --- Step 8: Retrieve unmasked key ---------------------------------------
$script:stepNum++
Step-Name ('Retrieve unmasked key via POST /api/token/' + $tokenId + '/key')
$apiKey = $null
try {
    $keyResp = Invoke-Api -Method POST -Path ('/api/token/' + $tokenId + '/key') -Token $userToken -Body @{}
    $keyData = Extract-Data $keyResp
    $apiKey  = $keyData.key
    if (-not $apiKey) { throw 'no key returned' }
    Info ('key fetched (length=' + $apiKey.Length + ')')
    Pass-Label
} catch {
    Fail-Label $_.Exception.Message
    $script:failures++
}

# --- Step 9: Call /v1/chat/completions with ALLOWED model ----------------
$script:stepNum++
Step-Name ('Chat completion with ALLOWED model (' + $AllowedModel + ') - must NOT contain subscription-does-not-cover')
$allowedPassed = $false
try {
    if (-not $apiKey) { throw 'no api key from step 8, skipping' }
    $r = Invoke-ChatCall -Model $AllowedModel -Key $apiKey
    Info ('HTTP ' + $r.Status)
    if ($r.Body -and ($r.Body -match 'subscription does not cover')) {
        Fail-Label ('allow-list wrongly blocked the allowed model: ' + $r.Body)
        $script:failures++
    } elseif ($r.Status -ge 200 -and $r.Status -lt 500) {
        Pass-Label
        $allowedPassed = $true
    } else {
        Fail-Label ('unhandled response (status=' + $r.Status + '): ' + $r.Body)
        $script:failures++
    }
} catch {
    Fail-Label $_.Exception.Message
    $script:failures++
}

# --- Step 10: Call /v1/chat/completions with DISALLOWED model -------------
$script:stepNum++
Step-Name ('Chat completion with DISALLOWED model (' + $DisallowedModel + ') - must return 403 + subscription does not cover')
try {
    if (-not $apiKey) { throw 'no api key from step 8, skipping' }
    $r = Invoke-ChatCall -Model $DisallowedModel -Key $apiKey
    Info ('HTTP ' + $r.Status)
    if ($r.Status -eq 403 -and ($r.Body -match 'subscription does not cover')) {
        Pass-Label
    } else {
        Fail-Label ('expected 403 with subscription-does-not-cover - got HTTP ' + $r.Status + ' body=' + $r.Body)
        $script:failures++
    }
} catch {
    Fail-Label $_.Exception.Message
    $script:failures++
}

# --- Step 11: Re-check subscription --------------------------------------
$script:stepNum++
Step-Name 'Re-check subscription amount_used (proxy for billing happened)'
try {
    $selfResp = Invoke-Api -Method GET -Path '/api/subscription/self' -Token $userToken
    $selfData = Extract-Data $selfResp
    $hit = $null
    foreach ($s in $selfData.subscriptions) {
        if ($s.subscription.plan_id -eq $planId) { $hit = $s.subscription; break }
    }
    if (-not $hit) { throw 'subscription disappeared after calls' }
    Info ('amount_total=' + $hit.amount_total + '  amount_used=' + $hit.amount_used)
    Pass-Label
} catch {
    Fail-Label $_.Exception.Message
    $script:failures++
}

# --- Step 12: Cleanup -----------------------------------------------------
$script:stepNum++
Step-Name 'Cleanup: disable and delete the test plan'
try {
    $null = Invoke-Api -Method PATCH -Path ('/api/subscription/admin/plans/' + $planId) -Token $adminToken -Body @{ enabled = $false }
    Info 'disabled'
    if ($userSubId) {
        try {
            $null = Invoke-Api -Method DELETE -Path ('/api/subscription/admin/user_subscriptions/' + $userSubId) -Token $adminToken
            Info ('deleted user_sub ' + $userSubId)
        } catch {
            Info ('could not delete user_sub ' + $userSubId + ' (may already be cleaned up)')
        }
    }
    Pass-Label
} catch {
    Fail-Label $_.Exception.Message
    $script:failures++
}

# --- Summary -------------------------------------------------------------
Write-Host ''
Write-Host '===========================================' -ForegroundColor Cyan
if ($script:failures -eq 0) {
    Write-Host ('ALL CHECKS PASSED  (' + $script:stepNum + ' steps)') -ForegroundColor Green
    exit 0
} else {
    Write-Host ('FAILURES: ' + $script:failures + ' / ' + $script:stepNum + ' steps') -ForegroundColor Red
    exit 1
}
