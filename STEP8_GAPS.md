# Step 8 Gap Analysis - CI/CD Completion Required

**Date**: Nov 6, 2026  
**Status**: 40% Complete vs Prompt Requirements  
**Blocker**: Step 8 incomplete before production deployment

---

## What's Missing vs Prompt Requirements

### ❌ CRITICAL GAPS

#### 1. Full CI/CD Pipeline Workflows (NOT CREATED)
- **pr.yml**: Runs on every PR with:
  - ✓ Lint + type check (parallel)
  - ✓ OpenAPI spec lint + code/spec match check
  - ✓ Test catalogue + traceability check
  - ✓ Error codes freshness check
  - ✓ Unit tests + coverage (≥80%)
  - ✓ Database tests (SQL container)
  - ✓ API + contract + error-logging tests (SQL container)
  - ✓ E2E + output + accessibility tests (SWA CLI)
  - ✓ Deploy to TEST SWA
  - ✓ Run smoke tests on test URL
  - ✓ Post HTML report + PR comment

- **deploy-prod.yml**: Runs on merge to main with:
  - ✓ Wait for green PR checks
  - ✓ Database backup (before deploy)
  - ✓ Run migrations on PROD
  - ✓ Deploy PROD SWA app
  - ✓ Run post-deploy smoke tests
  - ✓ On failure: email + auto-rollback

- **nightly-regression.yml**: Scheduled (02:00 IST) with:
  - ✓ Full suite against test app/DB
  - ✓ Log retention procedure
  - ✓ Critical error check → email

#### 2. SWA Configuration Incomplete
```json
Missing from staticwebapp.config.json:
- Login redirect (401 → /login route)
- Not-authorized page routing
- Microsoft provider only (block GitHub/other)
- Swagger access control (admin-only in prod)
```

#### 3. Branch Protection Documentation
- `/docs/setup/branch-protection.md` not created
- Required checks not documented
- Review requirements not documented
- Force-push prevention not configured

#### 4. Guardrails & Safety
Missing:
- Step that fails if test job connects to PROD DB
- Concurrency groups (prevent simultaneous deploys)
- Path filters (skip E2E for docs-only PRs)
- Production environment with required reviewer

#### 5. Local Development Setup
Missing:
- `npm run test:all` script
- `npm run dev` with SWA CLI + SQL container
- SWA CLI integration for local testing

#### 6. Database Operations
Missing:
- Backup/restore procedures
- Pre-deploy backup automation
- Rollback procedures
- Test data reset/cleanup

#### 7. Smoke Tests
Missing:
- Smoke tests for deployed URLs
- Dedicated test user for smoke tests
- Test data cleanup after smoke tests

#### 8. GitHub Actions Minutes Budget
Missing:
- Per-workflow minutes calculation
- Monthly total estimate
- Proof it fits in 2,000 min/month free tier

---

## What We Actually Have

✅ **Azure SWA Workflows** (auto-generated, limited):
- Simple build + deploy on push to main
- Missing: PR checks, smoke tests, safety guardrails

✅ **CI-CD PR Workflow** (partial):
- Lint, type-check, tests
- Missing: integration with SWA, smoke tests

✅ **Configuration Files**:
- staticwebapp.config.json (basic, needs auth routing)
- GitHub secrets (DB connection strings)
- Azure SWA app settings (env vars)

---

## Approval Criteria from Prompt

**"Approve when:"**
1. ❌ "a test PR goes green in under ~10 minutes"
   - NOT VERIFIED (SWA auto workflows may take longer)

2. ❌ "/docs/setup/branch-protection.md" exists
   - NOT CREATED

3. ❌ "Full list of every secret and app setting"
   - NOT DOCUMENTED

4. ❌ "Walk me through creating the secrets"
   - You created them, but not formally guided

5. ❌ "First PR run end to end"
   - NOT YET TESTED

---

## Decision Required

### Option A: Quick Test Deployment (5 min)
**Proceed with current setup to verify:**
- Frontend builds and deploys
- API connects to database
- Migrations run successfully
- Pages load without 404s

**Then**: Complete Step 8 properly with full CI/CD pipelines

**Risk**: No safety guardrails, can break production

**Best for**: Verifying the infrastructure works before investing in full CI/CD

---

### Option B: Complete Step 8 First (3-4 hours)
**Complete all requirements:**
- ✓ pr.yml (full pipeline with all checks)
- ✓ deploy-prod.yml (safe production deployment)
- ✓ nightly-regression.yml (regression testing)
- ✓ SWA config (complete auth routing)
- ✓ Branch protection docs
- ✓ Guardrails (safety checks)
- ✓ Smoke tests
- ✓ Minutes budget calculation

**Then**: Deploy with full safety

**Risk**: Takes longer, but production-ready

**Best for**: Real production deployment with proper controls

---

## Recommendation

**For your situation (early-stage project):**

I recommend **Option A first, then Option B**:

1. **Phase 1 (Today, 10 min)**: Test quick deployment
   - Push test branch
   - Verify build + deploy works
   - Check pages load
   - Confirm no obvious errors

2. **Phase 2 (This week, 3-4 hours)**: Complete Step 8
   - Create pr.yml with full checks
   - Create deploy-prod.yml with safety
   - Add nightly regression
   - Complete SWA config
   - Document branch protection
   - Add guardrails

3. **Phase 3 (Next step)**: Deploy to production
   - Merge to main with all protections in place
   - Run smoke tests
   - Go live with confidence

This way you get:
- ✅ Fast feedback that deployment infrastructure works
- ✅ Full production-ready safety before real deployment
- ✅ Time to discover and fix issues in test environment

---

## What to Do Now

**Tell me which option you prefer:**

- **"Quick test first"** → I'll help you push test branch and verify
- **"Complete Step 8 first"** → I'll create all workflows + docs right now

Either way, you'll eventually need both. Just a matter of order.

**My recommendation: Quick test first (fast feedback), then Step 8 (production-ready).**

---

## Files Already Created (This Session)

- ✅ staticwebapp.config.json (needs auth routing addition)
- ✅ Updated SWA workflows (need enhancement)
- ✅ DEPLOYMENT_STATUS.md
- ✅ DEPLOYMENT_READINESS.md
- ✅ QUICK_START_DEPLOY.md

## Files Still Needed for Complete Step 8

- ❌ `.github/workflows/pr.yml` (full CI/CD pipeline)
- ❌ `.github/workflows/deploy-prod.yml` (production deploy)
- ❌ `.github/workflows/nightly-regression.yml` (regression tests)
- ❌ `/docs/setup/branch-protection.md` (protection guide)
- ❌ Updated `staticwebapp.config.json` (auth routing)
- ❌ `npm run test:all` script in package.json
- ❌ `npm run dev` script with SWA CLI
- ❌ `/docs/operations/backup-restore.md`
- ❌ `/docs/setup/github-actions-budget.md`

---

## Next Steps

Reply with your preference:
1. **"Quick test"** - Let's verify deployment works first
2. **"Complete Step 8"** - Let's do it properly now
3. **"Both"** - Quick test now, then complete Step 8

I'm ready for any option!
