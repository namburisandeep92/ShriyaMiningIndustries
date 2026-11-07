# Azure SWA Application Settings Configuration

Since you've already added GitHub secrets, now we need to add the same connection strings to Azure SWA Application Settings.

## ⚠️ Why Both Places?

- **GitHub Secrets**: Used by CI/CD workflows to connect to database during migrations
- **Azure SWA App Settings**: Used by your running application to connect to database at runtime

---

## 🔧 Step 1: Configure Production SWA (swa-smi-invoice-prod)

1. **Go to Azure Portal** → Search: `swa-smi-invoice-prod`
2. Click on **swa-smi-invoice-prod**
3. Left sidebar → Click **Configuration**
4. Click button: **Application settings**
5. Click **+ New application setting** (for each setting below)

### Add These Application Settings:

```
Setting 1:
Name: DB_CONNECTION_STRING
Value: [PASTE YOUR PRODUCTION DATABASE CONNECTION STRING]

Setting 2:
Name: ENVIRONMENT
Value: production

Setting 3:
Name: LOG_LEVEL
Value: info

Setting 4:
Name: NODE_ENV
Value: production
```

6. After adding all 4 settings, click **OK**
7. Click **Save** button at the top
8. Wait for "Successfully updated application settings" message

---

## 🔧 Step 2: Configure Test SWA (swa-smi-invoice-test)

1. **Go to Azure Portal** → Search: `swa-smi-invoice-test`
2. Click on **swa-smi-invoice-test**
3. Left sidebar → Click **Configuration**
4. Click button: **Application settings**
5. Click **+ New application setting** (for each setting below)

### Add These Application Settings:

```
Setting 1:
Name: DB_CONNECTION_STRING
Value: [PASTE YOUR TEST DATABASE CONNECTION STRING]

Setting 2:
Name: ENVIRONMENT
Value: test

Setting 3:
Name: LOG_LEVEL
Value: debug

Setting 4:
Name: NODE_ENV
Value: production
```

6. After adding all 4 settings, click **OK**
7. Click **Save** button at the top
8. Wait for "Successfully updated application settings" message

---

## ✅ Verification

Once saved, you should see both SWA instances with all 4 application settings configured.

Use **Environment variables → Production** on each resource for its main-branch
deployment. `CONNECTION_STRING` is not recognized by the API; the exact key is
`DB_CONNECTION_STRING`. GitHub migration secrets do not update runtime settings.
Enter credentials privately, never in chat or source control. Use SQL server
`shriyamining-sql.database.windows.net` and the database names listed below,
not the outdated names in historical examples.

If you need to find your connection strings:
1. Azure Portal → Search: `shriyaminingdb` (production) or `shriyaminingdbtest` (test)
2. Click on the database
3. Left sidebar → **Connection strings**
4. Copy the **ADO.NET (SQL authentication)** string
   - Format: `Server=tcp:shriyamining.database.windows.net,1433;Initial Catalog=shriyaminingdb;Persist Security Info=False;User ID=smiadmin;Password=YOUR_PASSWORD;Encrypt=True;Connection Timeout=30;`

---

## 🎯 Next Steps After Azure Configuration

Once you've configured both SWA instances:

1. I'll update your CI/CD workflow files
2. I'll create `staticwebapp.config.json`
3. I'll fix the environment configuration files
4. We'll build and test the frontend
5. We'll test deployment to test SWA first

**Estimated remaining time: 2 hours**

---

## 💡 Need Help?

- **Can't find Connection strings?** Look for your SQL Server resource in Azure, then the databases within it
- **Can't find Application settings in SWA?** Make sure you're on the right SWA resource (swa-smi-invoice-prod or test)
- **Settings not saving?** Check if there are validation errors (connection string format issue)

Let me know once both SWA instances are configured! 🚀
