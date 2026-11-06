# Step 0 Setup - Completion Checklist & Instructions

**Status**: Azure resources created ✅ | GitHub Secrets ❌ | Repository Setup ⚠️

This guide walks you through the remaining Step 0 setup tasks needed before Step 6 (API) can run.

---

## ✅ Completed (Already Done)

- [x] GitHub repo created (`namburisandeep92/ShriyaMiningIndustries`)
- [x] Source files committed:
  - `/docs/requirements/SMI_Invoice_Platform_Prompt.md` (requirements)
  - `/legacy/` (existing invoice generator)
  - `/tests/fixtures/po/sample-po.xlsx` (sample PO)
- [x] Azure SQL databases created:
  - `shriyamining-sql` server
  - `shriyamining-db` (production)
  - `shriyamining-db-test` (test, isolated)
- [x] Static Web Apps created:
  - `swa-smi-invoice-prod` (production)
  - `swa-smi-invoice-test` (test, connects to test DB only)
- [x] Application Insights created (workspace-based)
- [x] Budget set: $1/month with email alerts

---

## ❌ TODO: GitHub Secrets Configuration

The CI/CD pipeline in `.github/workflows/ci-cd.yml` needs database credentials to run. Follow these steps:

### 1. Gather Connection Strings

You need **two** connection strings (test and production):

**For Test Database (`shriyamining-db-test`):**
- Azure Portal → SQL databases → shriyamining-db-test → Connection strings
- Copy the **ADO.NET (SQL authentication)** string
- Replace `{your_username}` and `{your_password}` with actual test DB credentials
- Example format:
  ```
  Server=tcp:shriyamining-sql.database.windows.net,1433;Initial Catalog=shriyamining-db-test;Persist Security Info=False;User ID=testuser;Password=TestPass123!;Encrypt=True;Connection Timeout=30;
  ```

**For Production Database (`shriyamining-db`):**
- Copy the ADO.NET string for `shriyamining-db`
- Replace with production credentials
- Example format:
  ```
  Server=tcp:shriyamining-sql.database.windows.net,1433;Initial Catalog=shriyamining-db;Persist Security Info=False;User ID=produser;Password=ProdPass123!;Encrypt=True;Connection Timeout=30;
  ```

### 2. Add Secrets to GitHub

1. Go to: https://github.com/namburisandeep92/ShriyaMiningIndustries/settings/secrets/actions
2. Click **"New repository secret"**
3. Add these secrets (copy-paste connection strings exactly):

| Secret Name | Value |
|---|---|
| `DB_CONNECTION_STRING_TEST` | Test database connection string (from above) |
| `DB_CONNECTION_STRING_PROD` | Production database connection string (from above) |
| `AZURE_STORAGE_ACCOUNT` | (Optional, for Phase 2 file uploads) |
| `ZOHO_API_KEY` | (Optional, for Phase 3 email) |

**Important Security Notes:**
- Never commit connection strings to code
- Secrets are masked in GitHub Actions logs
- Each secret can be revoked independently
- For production, consider using **Azure Managed Identity** instead (see "Future Enhancement" below)

### 3. Verify Secrets Work

After adding secrets:
1. Go to: https://github.com/namburisandeep92/ShriyaMiningIndustries/actions
2. Push any commit to `step-5-database` or create a new branch `test-secrets`
3. GitHub Actions should run automatically
4. Check the workflow logs:
   - If secrets are readable: "✅ Database migrations applied successfully"
   - If secrets are missing/wrong: "❌ Error: Connection string not found" or "Connection failed"

---

## ⚠️ TODO: Repository Configuration

### 1. Add `.env.example` to `.gitignore` (it's safe to commit)

The `.env.example` file should already be in the repo. Verify it's not in `.gitignore`:

```bash
cd "C:\GIT Repo\ShriyaMiningIndustries"
git status
```

You should see `.env.example` as a tracked file (green). ✅

### 2. Create Local `.env` File (DO NOT COMMIT)

For local development:

```bash
cd "C:\GIT Repo\ShriyaMiningIndustries"
# Copy the template
copy .env.example .env

# Edit .env with your test DB credentials (never commit this!)
# .env is in .gitignore, so it's safe
```

**Contents of `.env` (local development only):**
```
DB_CONNECTION_STRING_TEST=Server=tcp:shriyamining-sql.database.windows.net,1433;Initial Catalog=shriyamining-db-test;...
DB_CONNECTION_STRING_PROD=Server=tcp:shriyamining-sql.database.windows.net,1433;Initial Catalog=shriyamining-db;...
ENVIRONMENT=local
NODE_ENV=development
```

### 3. Verify `.env` is Ignored

```bash
# Check that .env is in .gitignore
type .gitignore | findstr "\.env"
```

Should show: `.env` (with no `.env.example`)

### 4. Add Branch Protection for `main` (Optional for Now)

This prevents accidental pushes to production. Set up later in Step 8.

---

## 🧪 Test Your Setup

Run the full test suite locally to verify everything works:

```bash
cd "C:\GIT Repo\ShriyaMiningIndustries"

# Install dependencies (if not done)
npm install

# Run all tests (should all pass)
npm run test:all

# Run database migrations locally (optional)
node database/migration-runner.js --dry-run
```

Expected output:
```
✅ Unit Tests:        48 passed
✅ API Tests:         18 passed
✅ Output Tests:      20 passed
✅ Database Tests:    9 passed (using mock DB, no Azure connection needed)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   TOTAL:            95 TESTS PASSING
```

---

## 📋 Step 0 Completion Checklist

- [ ] **GitHub Secrets added:**
  - [ ] `DB_CONNECTION_STRING_TEST` ← test database credentials
  - [ ] `DB_CONNECTION_STRING_PROD` ← production database credentials
  
- [ ] **Local `.env` file created:**
  - [ ] `.env.example` is committed to repo
  - [ ] `.env` is created locally with test credentials
  - [ ] `.env` is in `.gitignore`
  - [ ] `.env` is NOT committed to git
  
- [ ] **GitHub Actions workflow tested:**
  - [ ] Pushed a commit to test GitHub Actions
  - [ ] Workflow ran successfully
  - [ ] Database migrations applied (or mocked successfully)
  - [ ] All 95 tests passed in CI
  
- [ ] **Azure Resources verified:**
  - [ ] `shriyamining-db-test` exists and is accessible
  - [ ] `shriyamining-db` (prod) exists and is accessible
  - [ ] `swa-smi-invoice-test` SWA created and linked to repo
  - [ ] `swa-smi-invoice-prod` SWA created and linked to repo
  - [ ] Application Insights workspace created with daily cap
  - [ ] Budget alert set: $1/month

---

## 🚀 What Happens Next (Step 6)

Once Step 0 is complete:

1. **Step 6 (API Implementation)** can begin
   - Implement Azure Functions endpoints
   - Create OpenAPI/Swagger spec
   - Deploy to `swa-smi-invoice-test`
   - Tests will run against real test DB (via secrets)

2. **Step 7 (Frontend)**
   - Keep legacy HTML structure (your choice)
   - Build API client to call Step 6 endpoints
   - Deploy to `swa-smi-invoice-test`

3. **Step 8 (CI/CD Completion)**
   - Enable branch protection on `main`
   - Set deployment workflow
   - Configure production SWA

---

## ⚠️ Troubleshooting

### Issue: "Connection failed" in GitHub Actions

**Cause**: Connection string is incorrect or Azure SQL firewall is blocking GitHub Actions

**Fix**:
1. Test the connection string locally:
   ```bash
   node -e "const mssql = require('mssql'); const config = { connectionString: process.env.DB_CONNECTION_STRING_TEST }; mssql.connect(config).then(() => console.log('✅ Connected')).catch(e => console.log('❌ Error:', e.message));"
   ```

2. Check Azure SQL firewall:
   - Portal → SQL servers → shriyamining-sql → Firewalls and virtual networks
   - Allow "Azure services and resources to access this server" = ON
   - This allows GitHub Actions to connect

### Issue: "Secret not found" error

**Cause**: Secret name doesn't match what the workflow expects

**Fix**:
1. Verify secret names in GitHub Settings exactly match:
   - `DB_CONNECTION_STRING_TEST` (case-sensitive)
   - `DB_CONNECTION_STRING_PROD` (case-sensitive)

2. Check workflow file (`.github/workflows/ci-cd.yml`):
   ```yaml
   env:
     DB_CONNECTION_STRING_TEST: ${{ secrets.DB_CONNECTION_STRING_TEST }}
   ```

### Issue: Database is paused (auto-pause after inactivity)

**Expected**: Free tier pauses after 1 hour of inactivity to save costs

**Solution**: First API call will wake it up (with 30s delay). No action needed.

---

## 💾 Backup Important Info

Keep these handy (do not paste into chat):

- Azure SQL Server: `shriyamining-sql.database.windows.net`
- Test Database: `shriyamining-db-test`
- Production Database: `shriyamining-db`
- Test SWA: `swa-smi-invoice-test`
- Production SWA: `swa-smi-invoice-prod`
- GitHub Repo: `namburisandeep92/ShriyaMiningIndustries`

---

## 📞 Next Step

Once all checkboxes above are ✅, reply with:

> "Step 0 is complete. Ready for Step 6 (API Implementation)."

Then we'll create the Azure Functions API endpoints that the frontend will call.

---

**Current Progress**: ✅ Database & Tests | ⏳ Step 0 (Secrets & Config) | ⏭️ Step 6 (API)
