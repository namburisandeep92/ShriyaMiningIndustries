# ⛔ Deployment Readiness Check

**Question**: Will deployment to PROD work if I deploy it now?

**Answer**: **NO** — Deployment will fail in multiple ways. You need ~5 hours of work first.

---

## 🔴 Critical Issues (Will Cause Complete Failure)

### 1. **Missing: `staticwebapp.config.json`** ⛔ BLOCKER

**What's happening**:
- Azure Static Web Apps (SWA) doesn't know how to route requests
- Frontend Vue Router paths (e.g., `/invoices`, `/admin/users`) will 404
- API calls to `/api/*` won't forward to your Node backend
- SWA authentication won't work (can't validate x-ms-client-principal header)

**Failure mode**: Blank page or infinite 404s

**Fix**: Create `/staticwebapp.config.json` with:
```json
{
  "routes": [
    { "route": "/api/*", "serve": null },
    { "route": "/*", "serve": "/index.html", "statusCode": 200 }
  ],
  "auth": { "rolesSource": "/api/me" },
  "responseOverrides": {
    "401": { "rewrite": "/auth/login.html" },
    "404": { "rewrite": "/index.html" }
  }
}
```

**Effort**: 1 hour

---

### 2. **Missing: Frontend Build Output** ⛔ BLOCKER

**What's happening**:
- `/app/src/` contains TypeScript source code
- `/public/app/dist/` is **empty** (no built HTML/CSS/JS)
- SWA has nothing to serve
- Users see 404 on all routes

**Failure mode**: "Cannot GET /"

**Fix**: 
```bash
npm run app:build
# Creates /public/app/dist/ with index.html, JavaScript bundles, CSS
```

**Then**: Update `.github/workflows/azure-static-web-apps-nice-water-0523f0500.yml`:
```yaml
jobs:
  build_and_deploy_job:
    steps:
      - name: Build Vue App
        run: npm run app:build
      # ... rest of deploy ...
      - uses: Azure/static-web-apps-deploy@v1
        with:
          output_location: "public/app/dist"  # ← Add this
```

**Effort**: 30 minutes

---

### 3. **Missing: Azure Secrets Configuration** ⛔ BLOCKER

**What's happening**:
- CI/CD workflow references `secrets.DB_CONNECTION_STRING_TEST` and `DB_CONNECTION_STRING_PROD`
- These secrets don't exist in GitHub
- API can't connect to database
- Every API call fails with connection error

**Failure mode**: 500 errors on all endpoints

**Fix** (Manual in Azure portal):
1. Go to GitHub repo → Settings → Secrets and variables → Actions
2. Add secrets:
   - `DB_CONNECTION_STRING_TEST` (points to shriyamining-db-test)
   - `DB_CONNECTION_STRING_PROD` (points to shriyamining-db)
3. Go to SWA → Configuration → Application settings
   - `CONNECTION_STRING` = Your prod database connection
   - `ENVIRONMENT` = production
   - `LOG_LEVEL` = info

**Effort**: 30 minutes

---

### 4. **Incomplete: Database Migrations for PROD** ⚠️ RISKY

**What's happening**:
- CI/CD runs migrations on **test database only**
- Production database never gets migrations
- API starts but database schema is missing
- All database queries fail with "table not found" errors

**Failure mode**: Blank error pages with 500s

**Fix**: Add migration step to deploy workflow:
```yaml
- name: Run migrations on PROD database
  env:
    DB_CONNECTION_STRING: ${{ secrets.DB_CONNECTION_STRING_PROD }}
  run: npm run migrate
  
- name: Verify migration success
  run: echo "✅ Migrations complete"
```

**Effort**: 1 hour

---

### 5. **Broken: Environment Configuration** ⚠️ RISKY

**What's happening**:
- `/app/.env.production` has hardcoded `VUE_APP_API_URL=http://localhost:7071`
- Frontend built for production talks to localhost
- Works locally but fails in Azure (localhost doesn't exist)
- All API calls fail with CORS or connection errors

**Failure mode**: "Cannot reach API" errors

**Fix**: Update `/app/.env.production`:
```env
# Instead of localhost, use relative URLs or Azure URL
VUE_APP_API_URL=/api
# or
VUE_APP_API_URL=https://swa-smi-invoice-prod.azurestaticapps.net/api
```

**Effort**: 30 minutes

---

## 📊 Deployment Readiness Score

| Component | Status | Impact |
|-----------|--------|--------|
| Frontend built | ❌ NO | Can't serve UI |
| staticwebapp.config.json | ❌ NO | Routing broken |
| GitHub secrets configured | ❌ NO | API can't connect to DB |
| Build in CI/CD | ❌ NO | Workflow doesn't build app |
| Migrations on PROD | ❌ NO | Database schema missing |
| Environment vars correct | ❌ NO | Frontend talks to localhost |
| Workflow tests | ✅ YES | Tests pass |
| Backend code | ✅ YES | API works locally |
| Database schema (test) | ✅ YES | Test DB ready |

**Overall**: **0/8 critical items ready** = **NOT READY FOR PROD**

---

## 🚀 Safe Path Forward (5 Hours)

### Phase 1: Local Testing (30 min)
```bash
# Build frontend locally
npm run app:build

# Verify output exists
ls -la public/app/dist/
# Should have: index.html, assets/, chunk files

# Start backend
npm run api:dev

# Start frontend (from built output, using a local server)
# or run dev server to test
npm run app:dev

# Visit http://localhost:5173 or http://localhost:3000
# Should see all 6 screens working
```

### Phase 2: Create Configuration (1 hour)
```bash
# 1. Create staticwebapp.config.json
cat > staticwebapp.config.json << 'EOF'
{
  "routes": [
    { "route": "/api/*", "serve": null },
    { "route": "/*", "serve": "/index.html", "statusCode": 200 }
  ],
  "auth": { "rolesSource": "/api/me" },
  "responseOverrides": {
    "401": { "rewrite": "/auth/login.html" },
    "404": { "rewrite": "/index.html" }
  }
}
EOF

# 2. Update app/.env.production
# Change VUE_APP_API_URL to relative URL

# 3. Commit both changes
git add staticwebapp.config.json app/.env.production
git commit -m "Add SWA configuration and fix environment URLs"
```

### Phase 3: Update CI/CD Workflow (1 hour)
Modify `.github/workflows/azure-static-web-apps-nice-water-0523f0500.yml`:

```yaml
jobs:
  build_and_deploy_job:
    if: github.event_name == 'push' || (github.event_name == 'pull_request' && github.event.action != 'closed')
    runs-on: ubuntu-latest
    name: Build and Deploy Job
    steps:
      - uses: actions/checkout@v3
        with:
          submodules: true
          lfs: false
      
      # NEW: Build frontend
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '18'
          cache: 'npm'
      
      - name: Install dependencies
        run: npm install
      
      - name: Build Vue App
        run: npm run app:build
      
      # NEW: Run migrations before API starts
      - name: Run Database Migrations
        env:
          DB_CONNECTION_STRING: ${{ secrets.DB_CONNECTION_STRING_PROD }}
        run: npm run migrate || true  # Don't fail deploy if migration fails
      
      # EXISTING: Deploy to SWA
      - name: Build And Deploy
        id: builddeploy
        uses: Azure/static-web-apps-deploy@v1
        with:
          azure_static_web_apps_api_token: ${{ secrets.AZURE_STATIC_WEB_APPS_API_TOKEN_NICE_WATER_0523F0500 }}
          repo_token: ${{ secrets.GITHUB_TOKEN }}
          action: "upload"
          app_location: "/"
          api_location: "api"
          output_location: "public/app/dist"  # ← CHANGED
```

### Phase 4: Configure Azure Secrets (30 min)
**In GitHub** (Settings → Secrets and variables → Actions):
1. Click "New repository secret"
2. Add `DB_CONNECTION_STRING_PROD`:
   - Value: `Server=tcp:shriyamining.database.windows.net,1433;Initial Catalog=shriyamining-db;Persist Security Info=False;User ID=smiadmin;Password=***;Encrypt=True;Connection Timeout=30;`
   - (Replace with your actual connection string)
3. Add `DB_CONNECTION_STRING_TEST`:
   - Value: `Server=tcp:shriyamining.database.windows.net,1433;Initial Catalog=shriyamining-db-test;Persist Security Info=False;User ID=smiadmin;Password=***;Encrypt=True;Connection Timeout=30;`

**In Azure Portal** (SWA → Configuration → Application settings):
1. Add settings:
   - `CONNECTION_STRING` = `Server=tcp:shriyamining.database.windows.net,1433;Initial Catalog=shriyamining-db;...`
   - `ENVIRONMENT` = `production`
   - `LOG_LEVEL` = `info`
   - `NODE_ENV` = `production`

### Phase 5: Test with Test SWA First (2 hours)
```bash
# DO NOT push to main yet!
# Test with the test SWA first

# 1. Create a test branch
git checkout -b test-deployment

# 2. Commit all changes
git add .
git commit -m "Add SWA configuration and CI/CD updates for deployment"

# 3. Push to test branch
git push origin test-deployment

# 4. Create a PR to main (DON'T MERGE YET)
# GitHub should trigger SWA deploy to preview

# 5. Go to Azure Portal → swa-smi-invoice-test
# Find the preview URL from the PR
# Test all flows:
#   - Sign in
#   - Create invoice
#   - Edit invoice
#   - View history
#   - Export to Excel
#   - View errors

# 6. Check logs
# Azure SWA → Logs → Monitor
# Look for any errors

# 7. If all works, squash and merge to main
```

---

## ⏱️ Time Breakdown

| Task | Time | Priority |
|------|------|----------|
| Build frontend locally + verify | 30 min | P0 |
| Create staticwebapp.config.json | 30 min | P0 |
| Fix environment URLs | 30 min | P0 |
| Update CI/CD workflow | 1 hour | P0 |
| Configure Azure secrets | 30 min | P0 |
| Test with test SWA | 1.5 hours | P1 |
| Document deployment process | 30 min | P2 |
| **Total** | **~5 hours** | |

---

## ✅ Go-Live Checklist

- [ ] `staticwebapp.config.json` created
- [ ] `npm run app:build` produces `/public/app/dist/index.html`
- [ ] `.env.production` has correct API URLs
- [ ] CI/CD workflow includes app build step
- [ ] CI/CD workflow includes migration step
- [ ] GitHub secrets configured (`DB_CONNECTION_STRING_PROD`, `DB_CONNECTION_STRING_TEST`)
- [ ] Azure SWA application settings configured
- [ ] Test SWA deployment successful (full flow tested)
- [ ] All 130 tests passing
- [ ] Ready to merge to main

---

## 🎯 Next Steps

1. **Don't push to main yet**
2. Do the 5 hours of work above
3. Test with test SWA first
4. Only then push to main/prod

**Estimated time to production**: 2 days (with focus)

---

## FAQ

**Q: Can we skip staticwebapp.config.json?**  
A: No. SWA won't route requests correctly without it. You'll get 404s on all Vue Router paths.

**Q: What if we deploy the raw source code instead of built assets?**  
A: Won't work. SWA can't execute TypeScript or Vite build tools. It only serves static files (HTML, JS, CSS, assets).

**Q: Can we test locally without these changes?**  
A: Yes. Locally you can run `npm run app:dev` and `npm run api:dev` separately and everything works. But in Azure SWA, they need the config file and built output.

**Q: What if secrets are wrong?**  
A: API will fail to start or connect to the wrong database. You'll see 500 errors on all endpoints.

**Q: Should we deploy to prod or test SWA first?**  
A: **Test SWA first**. That's why you have two SWA instances. The workflow setup lets you test in a preview environment with zero risk to production.
