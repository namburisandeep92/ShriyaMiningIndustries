# Azure Portal Configuration - Manual Setup Guide

Since you're already logged into Azure Portal, follow these exact steps to get your connection strings and configure everything.

---

## 📋 Part 1: Get Connection Strings

### For Production Database (shriyamining-db)

1. Go to **Azure Portal** → **SQL databases** (search bar at top)
2. Click **shriyamining-db**
3. In left sidebar, click **Connection strings**
4. Copy the **ADO.NET (SQL authentication)** string
   - It looks like: `Server=tcp:shriyamining.database.windows.net,1433;Initial Catalog=shriyamining-db;Persist Security Info=False;User ID=smiadmin;Password=YOUR_PASSWORD;...`
5. **Save this** in a text file - you'll need it shortly

### For Test Database (shriyamining-db-test)

1. Go back to **SQL databases**
2. Click **shriyamining-db-test**
3. In left sidebar, click **Connection strings**
4. Copy the **ADO.NET (SQL authentication)** string
5. **Save this** in a text file as well

---

## 📋 Part 2: Configure Production SWA (swa-smi-invoice-prod)

1. Go to **Static Web Apps** (search bar)
2. Click **swa-smi-invoice-prod**
3. In left sidebar, click **Configuration**
4. Click **Application settings** button
5. Click **+ New application setting** and add these 4 settings:

| Setting Name | Value |
|--------------|-------|
| `CONNECTION_STRING` | Paste your **production** connection string from Part 1 |
| `ENVIRONMENT` | `production` |
| `LOG_LEVEL` | `info` |
| `NODE_ENV` | `production` |

6. Click **OK** to close the dialog
7. Click **Save** button at the top
8. Wait for confirmation message

---

## 📋 Part 3: Configure Test SWA (swa-smi-invoice-test)

1. Go to **Static Web Apps** (search bar)
2. Click **swa-smi-invoice-test**
3. In left sidebar, click **Configuration**
4. Click **Application settings** button
5. Click **+ New application setting** and add these 4 settings:

| Setting Name | Value |
|--------------|-------|
| `CONNECTION_STRING` | Paste your **test** connection string from Part 1 |
| `ENVIRONMENT` | `test` |
| `LOG_LEVEL` | `debug` |
| `NODE_ENV` | `development` |

6. Click **OK** to close the dialog
7. Click **Save** button at the top
8. Wait for confirmation message

---

## 📋 Part 4: Share Connection Strings

Once you've completed Parts 1-3:

1. Copy your **production connection string** from Part 1
2. Copy your **test connection string** from Part 1
3. Come back here and share them with me

I'll then automatically:
- Add GitHub Secrets for CI/CD
- Update your workflows
- Create deployment configuration files
- Verify everything works

---

## ⏱️ Time Needed

- Part 1 (Get connection strings): **3 minutes**
- Part 2 (Configure prod SWA): **3 minutes**
- Part 3 (Configure test SWA): **3 minutes**
- **Total: ~10 minutes**

---

## 🚨 Important Security Notes

✅ **Connection strings SHOULD go in Azure SWA Application Settings** (they're encrypted at rest and in transit)  
✅ **Connection strings SHOULD go in GitHub Secrets** (for CI/CD to use)  
❌ **Connection strings SHOULD NOT be in code or .env files**

---

## 📞 Help

If you get stuck on any step:
- Look for the blue **Help** icon (?) in Azure Portal
- Search for the resource name in the search bar
- Check your resource group to find resources

Once you have the connection strings, paste them here and I'll finish the setup! 🚀
