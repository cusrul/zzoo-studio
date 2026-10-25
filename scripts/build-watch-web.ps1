param(
    [Parameter(Mandatory = $true)][string]$Source,
    [string]$Emsdk = "$PSScriptRoot/../.tools/emsdk"
)
$ErrorActionPreference = 'Stop'
$siteRoot = [IO.Path]::GetFullPath("$PSScriptRoot/..")
$sourceRoot = (Resolve-Path -LiteralPath $Source).Path
$sdkRoot = (Resolve-Path -LiteralPath $Emsdk).Path
$expected = '0a26ca553b87fcf1cb2b1deb77d0aacf034a00e9'
$resolved = (& git -C $sourceRoot rev-parse --verify "$expected^{commit}").Trim()
if ($LASTEXITCODE -ne 0 -or $resolved -ne $expected) { throw "Pinned Crabit commit $expected is unavailable" }
$paths = @(
    'apps/mobile/native/nanoui_sim',
    'libraries/NanoUI',
    'firmware/stm32/Core/NanoUI',
    'apps/mobile/assets/crabit_collection.glb'
)
$changed = & git -C $sourceRoot diff --quiet $expected -- $paths
if ($LASTEXITCODE -eq 1) { throw 'The selected simulator/framework/assets must match the pinned commit.' }
if ($LASTEXITCODE -ne 0) { throw 'Unable to verify the selected simulator/framework/assets.' }
$untracked = & git -C $sourceRoot ls-files --others --exclude-standard -- $paths
if ($LASTEXITCODE -ne 0) { throw 'Unable to inspect untracked simulator/framework/assets.' }
if ($untracked) { throw 'The selected simulator/framework/assets must match the pinned commit.' }
$compiler = "$sdkRoot/upstream/emscripten/em++.exe"
if (!(Test-Path -LiteralPath $compiler)) { throw 'Emscripten compiler not found in the selected local SDK.' }
$env:EM_CONFIG = "$sdkRoot/.emscripten"
$product = "$sourceRoot/firmware/stm32/Core/NanoUI"
$output = "$siteRoot/public/watch-demo"
New-Item -ItemType Directory -Force -Path $output | Out-Null
$argsList = @(
    "$sourceRoot/apps/mobile/native/nanoui_sim/simulator.cpp",
    "$sourceRoot/libraries/NanoUI/src/NanoUI/product/runtime.cpp",
    "$product/src/font_engine.cpp",
    "$product/assets/generated/desktop/nanoui_assets.cpp",
    '-std=c++17', '-O2', '-fexceptions', '--no-entry',
    '-DNANOUI_SIMULATOR', '-DNANOUI_DYNAMIC_STORAGE=1',
    "-I$sourceRoot/apps/mobile/native/nanoui_sim",
    "-I$sourceRoot/apps/mobile/native/nanoui_sim/platform/stm32",
    "-I$sourceRoot/libraries/NanoUI/src", "-I$product/include", "-I$product",
    "-I$product/app_real", "-I$sourceRoot/firmware/shared",
    "-I$product/assets/generated/desktop",
    '-sMODULARIZE=1', '-sEXPORT_ES6=1', '-sALLOW_MEMORY_GROWTH=1',
    '-sENVIRONMENT=web,node', '-sFILESYSTEM=0',
    '-sEXPORTED_FUNCTIONS=["_crabit_sim_start","_crabit_sim_stop","_crabit_sim_step","_crabit_sim_button","_crabit_sim_frame","_crabit_sim_generation","_crabit_sim_show_clock","_crabit_sim_set_clock","_crabit_sim_set_weather"]',
    '-sEXPORTED_RUNTIME_METHODS=["HEAPU8"]',
    '-o', "$output/nanoui.mjs"
)
& $compiler @argsList
if ($LASTEXITCODE -ne 0) { throw "WebAssembly build failed ($LASTEXITCODE)" }
Copy-Item -LiteralPath "$sourceRoot/apps/mobile/assets/crabit_collection.glb" -Destination "$output/model.glb"
$provenance = [ordered]@{
    sourceCommit = $expected
    sourceModel = 'apps/mobile/assets/crabit_collection.glb'
    simulatorScope = 'STM32 app_real product UI with in-memory services; no BW16 game source.'
    modelSha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath "$output/model.glb").Hash.ToLowerInvariant()
    wasmSha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath "$output/nanoui.wasm").Hash.ToLowerInvariant()
    compiler = ((& $compiler --version) | Select-Object -First 1)
}
$provenance | ConvertTo-Json | Set-Content -Encoding utf8 -LiteralPath "$output/provenance.json"
Write-Output "Compiled real NanoUI simulator and copied Flutter model from pinned source $expected"
Get-FileHash -Algorithm SHA256 -LiteralPath "$output/nanoui.wasm", "$output/model.glb"
