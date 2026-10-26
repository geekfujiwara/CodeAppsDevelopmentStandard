param([switch]$InitializeSigningKey)

$ErrorActionPreference = 'Stop'
$project = Join-Path $PSScriptRoot '..\server\SalesCrm.Plugins\SalesCrm.Plugins.csproj'
$keyPath = Join-Path $PSScriptRoot '..\server\SalesCrm.Plugins\SalesCrm.Plugins.snk'
if (!(Test-Path -LiteralPath $keyPath)) {
    if (!$InitializeSigningKey) {
        throw 'Signing key missing. For a new deployment, pass -InitializeSigningKey. For an existing assembly, restore its original private signing key.'
    }
    $rsa = [System.Security.Cryptography.RSACryptoServiceProvider]::new(2048)
    $rsa.PersistKeyInCsp = $false
    try {
        [System.IO.File]::WriteAllBytes($keyPath, $rsa.ExportCspBlob($true))
    }
    finally {
        $rsa.Dispose()
    }
}
& dotnet build $project --configuration Release
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
$tests = Join-Path $PSScriptRoot '..\server\SalesCrm.Plugins.Tests\SalesCrm.Plugins.Tests.csproj'
& dotnet build $tests --configuration Release
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
& (Join-Path $PSScriptRoot '..\server\SalesCrm.Plugins.Tests\bin\Release\net462\SalesCrm.Plugins.Tests.exe')
exit $LASTEXITCODE
