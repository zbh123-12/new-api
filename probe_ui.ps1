$BaseUrl = 'http://localhost:3000'

function Raw-Api($method, $path, $token, $body) {
    $headers = @{ 'Content-Type' = 'application/json' }
    if ($token) { $headers['Authorization'] = 'Bearer ' + $token }
    $params = @{ Method = $method; Uri = ($BaseUrl + $path); Headers = $headers; TimeoutSec = 30 }
    if ($body) { $params['Body'] = ($body | ConvertTo-Json -Compress) }
    return (Invoke-WebRequest @params).Content
}

$adminToken = ((Raw-Api POST '/api/user/login' $null @{ username='root'; password='12345678' }) | ConvertFrom-Json).data.access_token
$userToken  = ((Raw-Api POST '/api/user/login' $null @{ username='12345678'; password='12345678' }) | ConvertFrom-Json).data.access_token
Write-Host ('admin token len = ' + $adminToken.Length)
Write-Host ('user  token len = ' + $userToken.Length)

# 1) Admin: full raw response of /api/subscription/admin/plans
Write-Host ''
Write-Host '=== Admin raw response: /api/subscription/admin/plans (first 1 plan) ==='
$rawPlans = Raw-Api GET '/api/subscription/admin/plans' $adminToken
$parsed = $rawPlans | ConvertFrom-Json
$firstPlan = $parsed.data[0]
$firstPlan | ConvertTo-Json -Depth 4

Write-Host ''
Write-Host '=== Admin plan count: ' $parsed.data.Count '==='
Write-Host ''
Write-Host '=== User self (active subs only) ==='
$selfRaw = Raw-Api GET '/api/subscription/self' $userToken
$selfRaw | ConvertFrom-Json | ConvertTo-Json -Depth 5

Write-Host ''
Write-Host '=== Public plans /api/subscription/plans (first 1) ==='
$pubRaw = Raw-Api GET '/api/subscription/plans' $null
$pubRaw | ConvertFrom-Json | ConvertTo-Json -Depth 4
