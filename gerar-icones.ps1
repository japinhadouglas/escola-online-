# Gera os icones PWA (192, 512, 512 maskable) com System.Drawing
Add-Type -AssemblyName System.Drawing

$outDir = "C:\Users\User\Downloads\Escola Online\public"
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

function New-RoundedPath([float]$x, [float]$y, [float]$w, [float]$h, [float]$r) {
    $p = New-Object System.Drawing.Drawing2D.GraphicsPath
    $d = $r * 2
    $p.AddArc($x, $y, $d, $d, 180, 90)                    # canto sup. esquerdo
    $p.AddArc(($x + $w - $d), $y, $d, $d, 270, 90)       # canto sup. direito
    $p.AddArc(($x + $w - $d), ($y + $h - $d), $d, $d, 0, 90)   # inf. direito
    $p.AddArc($x, ($y + $h - $d), $d, $d, 90, 90)        # inf. esquerdo
    $p.CloseFigure()
    return $p
}

function New-Icon([int]$size, [string]$file, [bool]$maskable) {
    $bmp = New-Object System.Drawing.Bitmap($size, $size)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.Clear([System.Drawing.Color]::Transparent)

    # Fundo: quadrado arredondado (full-bleed p/ maskable, com margem p/ normal)
    $bgColor = [System.Drawing.Color]::FromArgb(255, 88, 101, 242) # #5865F2
    $bgBrush = New-Object System.Drawing.SolidBrush($bgColor)
    $margin = if ($maskable) { 0 } else { [float]($size * 0.04) }
    $side = $size - (2 * $margin)
    $radius = if ($maskable) { [float]($size * 0.12) } else { [float]($size * 0.18) }
    $path = New-RoundedPath $margin $margin $side $side $radius
    $g.FillPath($bgBrush, $path)

    # Gradiente sutil no fundo (roxo mais claro no topo)
    $gradBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
        (New-Object System.Drawing.Rectangle(0, 0, $size, $size)),
        [System.Drawing.Color]::FromArgb(90, 255, 255, 255),
        [System.Drawing.Color]::FromArgb(0, 255, 255, 255),
        [System.Drawing.Drawing2D.LinearGradientMode]::Vertical)
    $g.FillPath($gradBrush, $path)

    $white = [System.Drawing.Brushes]::White
    $cx = $size / 2.0

    # Capelo (mortarboard): losango branco
    $cy = $size * 0.40
    $w = $size * 0.32
    $h = $size * 0.155
    $pts = New-Object System.Drawing.PointF[] 4
    $pts[0] = New-Object System.Drawing.PointF(($cx - $w), $cy)
    $pts[1] = New-Object System.Drawing.PointF($cx, ($cy - $h))
    $pts[2] = New-Object System.Drawing.PointF(($cx + $w), $cy)
    $pts[3] = New-Object System.Drawing.PointF($cx, ($cy + $h))
    $g.FillPolygon($white, $pts)

    # Base do capelo (faixa sob o losango)
    $baseW = $size * 0.17
    $baseH = $size * 0.16
    $baseTop = $cy + $h * 0.35
    $basePts = New-Object System.Drawing.PointF[] 4
    $basePts[0] = New-Object System.Drawing.PointF(($cx - $baseW), $baseTop)
    $basePts[1] = New-Object System.Drawing.PointF(($cx + $baseW), $baseTop)
    $basePts[2] = New-Object System.Drawing.PointF(($cx + $baseW * 0.72), ($baseTop + $baseH))
    $basePts[3] = New-Object System.Drawing.PointF(($cx - $baseW * 0.72), ($baseTop + $baseH))
    $g.FillPolygon($white, $basePts)

    # Tassel: linha vertical + bolinha
    $pen = New-Object System.Drawing.Pen($white, [float]($size * 0.028))
    $pen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
    $pen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
    $tX = $cx + $w
    $g.DrawLine($pen, [float]$tX, [float]$cy, [float]$tX, [float]($cy + $size * 0.16))
    $tasselR = $size * 0.035
    $g.FillEllipse($white, [float]($tX - $tasselR), [float]($cy + $size * 0.16 - $tasselR), [float]($tasselR * 2), [float]($tasselR * 2))

    $g.Dispose()
    $bmp.Save($file, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
    Write-Host "OK: $file ($size x $size)"
}

New-Icon 192 "$outDir\icon-192.png" $false
New-Icon 512 "$outDir\icon-512.png" $false
New-Icon 512 "$outDir\icon-512-maskable.png" $true
Write-Host "Icones gerados!"