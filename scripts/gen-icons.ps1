# 生成 Tauri 所需的占位图标（最小合法 PNG）。
# 用法：在仓库根目录执行  powershell -ExecutionPolicy Bypass -File scripts/gen-icons.ps1
# 真实发布前请替换为正式设计稿。
$ErrorActionPreference = 'Stop'
$iconsDir = Join-Path $PSScriptRoot '..' 'src-tauri' 'icons'
New-Item -ItemType Directory -Force -Path $iconsDir | Out-Null

Add-Type -AssemblyName System.Drawing
function New-Png([int]$size, [string]$name) {
    $bmp = New-Object System.Drawing.Bitmap($size, $size)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.Clear([System.Drawing.Color]::FromArgb(0xFF, 0x2D, 0x6C, 0xDF))  # 主题蓝
    $g.Dispose()
    $path = Join-Path $iconsDir $name
    $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
    Write-Host "生成 $path"
}

New-Png 32   '32x32.png'
New-Png 128  '128x128.png'
New-Png 256  '128x128@2x.png'

# .ico 复用 128 尺寸
$icoPath = Join-Path $iconsDir 'icon.ico'
$bmp = New-Object System.Drawing.Bitmap(128, 128)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.Clear([System.Drawing.Color]::FromArgb(0xFF, 0x2D, 0x6C, 0xDF))
$g.Dispose()
$ico = [System.Drawing.Icon]::FromHandle($bmp.GetHicon())
$fs = [System.IO.File]::Create($icoPath)
$ico.Save($fs)
$fs.Close(); $bmp.Dispose(); $ico.Dispose()
Write-Host "生成 $icoPath"

# .icns 在 Windows 上无原生支持，dev/build 非 macOS 时不强制；macOS 打包前需补。
Write-Host "提示：macOS 打包需 icon.icns，请在 Mac 上用 tauri icon 正式生成。"
