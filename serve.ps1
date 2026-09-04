# serve.ps1 — tiny local web server for developing Diane.
#
# Why this exists: Diane uses ES modules and a service worker. Browsers block
# both when you open index.html directly from disk (file://). They need to be
# served over http://. You have no Node or Python installed, so this is a
# small server built into PowerShell itself.
#
# Run it:   powershell -ExecutionPolicy Bypass -File serve.ps1
# Stop it:  Ctrl+C  (the loop below checks for it a few times a second)
# Then open http://localhost:8124/

param(
  [string]$Root = $PSScriptRoot,
  [int]$Port = 8124
)

$mime = @{
  ".html" = "text/html; charset=utf-8"
  ".js"   = "text/javascript; charset=utf-8"
  ".css"  = "text/css; charset=utf-8"
  ".json" = "application/json; charset=utf-8"
  ".webmanifest" = "application/manifest+json; charset=utf-8"
  ".svg"  = "image/svg+xml"
  ".png"  = "image/png"
  ".ico"  = "image/x-icon"
}

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")

try {
  $listener.Start()
} catch {
  Write-Host "Could not start on port $Port. It's probably already in use." -ForegroundColor Yellow
  Write-Host "Find and stop the old one:" -ForegroundColor Yellow
  Write-Host "  Get-Process powershell | Where-Object { `$_.MainWindowTitle -eq '' }" -ForegroundColor Yellow
  Write-Host "or just close this window and open a new terminal." -ForegroundColor Yellow
  return
}

Write-Host "Diane dev server -> http://localhost:$Port/   (Ctrl+C to stop)"

try {
  while ($listener.IsListening) {
    # GetContextAsync + a short timed wait, instead of a blocking GetContext().
    # The WaitOne(250) hands control back to PowerShell 4x a second, which is
    # where a Ctrl+C actually gets processed and breaks this loop.
    $task = $listener.GetContextAsync()
    while (-not $task.AsyncWaitHandle.WaitOne(250)) { }
    $ctx = $task.GetAwaiter().GetResult()

    $rel = [System.Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath.TrimStart("/"))
    if ($rel -eq "") { $rel = "index.html" }
    $path = Join-Path $Root $rel

    if (Test-Path $path -PathType Leaf) {
      $ext = [System.IO.Path]::GetExtension($path).ToLower()
      $ct = $mime[$ext]; if (-not $ct) { $ct = "application/octet-stream" }
      $bytes = [System.IO.File]::ReadAllBytes($path)
      $ctx.Response.ContentType = $ct
      $ctx.Response.Headers.Add("Service-Worker-Allowed", "/")
      # Dev server: never let the browser HTTP-cache a file, so edits always
      # show on a normal refresh (the network-first service worker still
      # fetches through the HTTP cache).
      $ctx.Response.Headers.Add("Cache-Control", "no-store, must-revalidate")
      $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
    } else {
      $ctx.Response.StatusCode = 404
      $msg = [System.Text.Encoding]::UTF8.GetBytes("404: $rel")
      $ctx.Response.OutputStream.Write($msg, 0, $msg.Length)
    }
    $ctx.Response.Close()
  }
} finally {
  # Runs on Ctrl+C too — frees the port so the next run starts cleanly.
  $listener.Stop()
  $listener.Close()
  Write-Host "`nServer stopped."
}
