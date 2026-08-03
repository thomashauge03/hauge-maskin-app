# Lagar trimma logo + ikon ut frå assets/logo.png (originalen blir ikkje endra)
Add-Type -AssemblyName System.Drawing
$dir = Split-Path -Parent $MyInvocation.MyCommand.Path
$src = [System.Drawing.Bitmap]::FromFile((Join-Path $dir 'logo.png'))

$minX = $src.Width; $minY = $src.Height; $maxX = 0; $maxY = 0
for ($y = 0; $y -lt $src.Height; $y++) {
  for ($x = 0; $x -lt $src.Width; $x++) {
    $p = $src.GetPixel($x, $y)
    if ($p.R -lt 240 -or $p.G -lt 240 -or $p.B -lt 240) {
      if ($x -lt $minX) { $minX = $x }
      if ($y -lt $minY) { $minY = $y }
      if ($x -gt $maxX) { $maxX = $x }
      if ($y -gt $maxY) { $maxY = $y }
    }
  }
}

$pad = 8
$minX = [Math]::Max(0, $minX - $pad); $minY = [Math]::Max(0, $minY - $pad)
$maxX = [Math]::Min($src.Width - 1, $maxX + $pad); $maxY = [Math]::Min($src.Height - 1, $maxY + $pad)
$w = $maxX - $minX + 1; $h = $maxY - $minY + 1

# Trimma PNG. Berre den YTRE kvite bakgrunnen blir gjennomsiktig (flood fill frå kantane) –
# det kvite inni H-en blir verande, så logoen ser nøyaktig ut som originalen.
$trim = New-Object System.Drawing.Bitmap $w, $h, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$px = New-Object 'System.Drawing.Color[]' ($w * $h)
for ($y = 0; $y -lt $h; $y++) {
  for ($x = 0; $x -lt $w; $x++) { $px[$y * $w + $x] = $src.GetPixel($minX + $x, $minY + $y) }
}
$isBg = New-Object 'bool[]' ($w * $h)
$isWhite = { param($c) $c.R -ge 244 -and $c.G -ge 244 -and $c.B -ge 244 }
$stack = New-Object System.Collections.Generic.Stack[int]
for ($x = 0; $x -lt $w; $x++) { $stack.Push($x); $stack.Push(($h - 1) * $w + $x) }
for ($y = 0; $y -lt $h; $y++) { $stack.Push($y * $w); $stack.Push($y * $w + $w - 1) }
while ($stack.Count -gt 0) {
  $i = $stack.Pop()
  if ($isBg[$i]) { continue }
  $c = $px[$i]
  if (-not (& $isWhite $c)) { continue }
  $isBg[$i] = $true
  $x = $i % $w; $y = [int](($i - $x) / $w)
  if ($x -gt 0) { $stack.Push($i - 1) }
  if ($x -lt $w - 1) { $stack.Push($i + 1) }
  if ($y -gt 0) { $stack.Push($i - $w) }
  if ($y -lt $h - 1) { $stack.Push($i + $w) }
}
for ($y = 0; $y -lt $h; $y++) {
  for ($x = 0; $x -lt $w; $x++) {
    $i = $y * $w + $x
    if ($isBg[$i]) { $trim.SetPixel($x, $y, [System.Drawing.Color]::FromArgb(0, 255, 255, 255)) }
    else { $trim.SetPixel($x, $y, $px[$i]) }
  }
}
$trim.Save((Join-Path $dir 'logo-trim.png'), [System.Drawing.Imaging.ImageFormat]::Png)

# Kvadratisk ikon 256x256 med gjennomsiktig bakgrunn
$size = 256
$icon = New-Object System.Drawing.Bitmap $size, $size, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$g = [System.Drawing.Graphics]::FromImage($icon)
$g.InterpolationMode = 'HighQualityBicubic'
$scale = [Math]::Min(($size - 24) / $w, ($size - 24) / $h)
$dw = [int]($w * $scale); $dh = [int]($h * $scale)
$g.DrawImage($trim, [int](($size - $dw) / 2), [int](($size - $dh) / 2), $dw, $dh)
$g.Dispose()
$icon.Save((Join-Path $dir 'icon.png'), [System.Drawing.Imaging.ImageFormat]::Png)

$trim.Dispose(); $icon.Dispose(); $src.Dispose()
Write-Output "ferdig: ${w}x${h}"
