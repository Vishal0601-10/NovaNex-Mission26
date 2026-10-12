$ErrorActionPreference = "Stop"

Write-Host "PayGuard verification" -ForegroundColor Cyan
Write-Host "1/3 Installing dependencies..."
npm install

Write-Host "2/3 Running deterministic engine tests..."
npm test

Write-Host "3/3 Creating Vite production build..."
npm run build

Write-Host "Verification passed. Start the app with: npm run dev" -ForegroundColor Green
Write-Host "A package-lock.json should now exist. Commit it with the rest of the project." -ForegroundColor Green
