# 🚀 QUICK START: Deploy to Production

## Right Now: Just 10 Minutes to Configure Azure

### Step 1: Production SWA Settings (5 min)
```
Azure Portal → Static Web Apps → swa-smi-invoice-prod
→ Configuration → Application settings → New application setting (x4)

Name                Value
CONNECTION_STRING   [Your PROD DB connection string]
ENVIRONMENT         production
LOG_LEVEL           info
NODE_ENV            production

Save ✓
```

### Step 2: Test SWA Settings (5 min)
```
Azure Portal → Static Web Apps → swa-smi-invoice-test
→ Configuration → Application settings → New application setting (x4)

Name                Value
CONNECTION_STRING   [Your TEST DB connection string]
ENVIRONMENT         test
LOG_LEVEL           debug
NODE_ENV            development

Save ✓
```

---

## Then: Deploy to Production (30 min)

### Test First (Safe)
```bash
git checkout -b test-deployment
git push origin test-deployment
# Wait for GitHub Actions to complete
# Visit test SWA URL to verify
```

### Then Go Live
```bash
git checkout main
git merge test-deployment
git push origin main
# GitHub Actions deploys to production
# Your site is live! 🎉
```

---

## Status Checklist

- [x] Frontend built ✓
- [x] SWA config created ✓
- [x] Workflows updated ✓
- [x] GitHub secrets added ✓
- [ ] Azure Portal settings (THIS IS YOU NOW)
- [ ] Test deployment
- [ ] Production deployment

---

## Documents for Reference

- **DEPLOYMENT_STATUS.md** - Full guide and checklist
- **DEPLOYMENT_READINESS.md** - Troubleshooting and detailed info
- **AZURE_SWA_CONFIG.md** - Step-by-step Azure setup
- **staticwebapp.config.json** - SWA routing configuration

---

## Connection Strings (Where to Find Them)

Azure Portal → SQL databases → [Database name] → Connection strings → ADO.NET (SQL authentication)

Format: `Server=tcp:shriyamining.database.windows.net,1433;Initial Catalog=shriyamining-db;Persist Security Info=False;User ID=smiadmin;Password=***;Encrypt=True;Connection Timeout=30;`

---

## Deployment Timeline

| Step | Time | What Happens |
|------|------|--------------|
| Configure Azure | 10 min | You add settings in Azure Portal |
| Test Deploy | 5 min | Push test-deployment branch |
| Wait for build | 2-3 min | GitHub Actions runs |
| Verify test | 10 min | Click preview link, test 6 screens |
| Merge to main | 2 min | Git merge and push |
| Prod deploy | 2-3 min | GitHub Actions runs again |
| Live! | ✓ | Site is live at Azure SWA URL |
| **Total** | **~30 min** | **From now to production** |

---

## Success Looks Like

- ✅ Azure Portal → SWA → Application settings showing your 4 settings
- ✅ GitHub Actions shows green checkmarks (build, migration, deploy)
- ✅ Test SWA URL loads without errors
- ✅ Can navigate all 6 screens
- ✅ API calls work (check network tab)
- ✅ Production site is live

---

## If Something Goes Wrong

1. Check GitHub Actions logs (GitHub → Actions → Latest run → View logs)
2. Check Azure Portal logs (Static Web Apps → Your SWA → Logs)
3. Verify connection strings are correct
4. Look for migration errors or permission issues

---

## You're Almost There! 🎉

Everything technical is done. Just need those 10 minutes in Azure Portal!

Questions? Check:
- DEPLOYMENT_STATUS.md for detailed explanations
- DEPLOYMENT_READINESS.md for troubleshooting
- AZURE_SWA_CONFIG.md for step-by-step Azure guide
