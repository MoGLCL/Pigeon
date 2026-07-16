# PowerShell script to initialize and push all 4 repositories to GitHub

Write-Host "==============================================" -ForegroundColor Cyan
Write-Host "Pushing Pigeon main repository and releases..." -ForegroundColor Cyan
Write-Host "==============================================" -ForegroundColor Cyan

# 1. Main Repository Hub
Write-Host "`n[1/4] Pushing Main Repository Hub..." -ForegroundColor Yellow
if (!(Test-Path .git)) {
    git init
    git branch -M main
    git remote add origin https://github.com/MoGLCL/Pigeon.git
}
git add .
git commit -m "Initial commit of Pigeon Main Repository Hub"
git push -u origin main -f

# 2. Windows Local Release
Write-Host "`n[2/4] Pushing Windows Local Release..." -ForegroundColor Yellow
cd Out\Pigeon-Windows-Local
if (!(Test-Path .git)) {
    git init
    git branch -M main
    git remote add origin https://github.com/MoGLCL/Pigeon-Windows-Local.git
}
git add .
git commit -m "Initial release commit of Pigeon Windows Local"
git push -u origin main -f
cd ..\..

# 3. Linux Docker Release
Write-Host "`n[3/4] Pushing Linux Docker Release..." -ForegroundColor Yellow
cd Out\Pigeon-Linux-Docker
if (!(Test-Path .git)) {
    git init
    git branch -M main
    git remote add origin https://github.com/MoGLCL/Pigeon-Linux-Docker.git
}
git add .
git commit -m "Initial release commit of Pigeon Linux Docker"
git push -u origin main -f
cd ..\..

# 4. Private Hosting Release
Write-Host "`n[4/4] Pushing Private Hosting Release..." -ForegroundColor Yellow
cd Out\Pigeon-Private-Hosting
if (!(Test-Path .git)) {
    git init
    git branch -M main
    git remote add origin https://github.com/MoGLCL/Pigeon-Private-Hosting.git
}
git add .
git commit -m "Initial release commit of Pigeon Private Hosting"
git push -u origin main -f
cd ..\..

Write-Host "`n==============================================" -ForegroundColor Green
Write-Host "All repositories pushed successfully!" -ForegroundColor Green
Write-Host "==============================================" -ForegroundColor Green
