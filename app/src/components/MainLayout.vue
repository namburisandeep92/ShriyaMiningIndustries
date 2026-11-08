<template>
  <div class="app-layout">
    <header class="app-header">
      <div class="header-content">
        <h1 class="app-title">{{ config.appTitle }}</h1>
        <nav class="app-nav">
          <router-link to="/invoices" class="nav-link">Invoices</router-link>
          <router-link to="/po-import" class="nav-link" v-if="hasPermission('file.upload')">
            PO Import
          </router-link>
          <router-link to="/admin/users" class="nav-link" v-if="hasPermission('user.manage') && apiClient.getAuthContext()?.roles?.includes('Admin')">
            Admin
          </router-link>
          <router-link to="/admin/errors" class="nav-link" v-if="hasPermission('errorlog.view') && apiClient.getAuthContext()?.roles?.includes('Admin')">
            Error Logs
          </router-link>
          <a href="/.auth/logout?post_logout_redirect_uri=/" class="nav-link logout">
            Logout
          </a>
        </nav>
      </div>
    </header>

    <main class="app-main">
      <slot />
    </main>

    <ToastContainer />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { getConfig } from '@/config'
import { apiClient } from '@/services/api'
import ToastContainer from '@/components/ToastContainer.vue'

const config = computed(() => getConfig())

const hasPermission = (permission: string) => {
  return apiClient.hasPermission(permission)
}
</script>

<style scoped>
.app-layout {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  background-color: var(--cream);
}

.app-header {
  background-color: var(--parchment);
  color: var(--ink);
  padding: 0;
  border-bottom: 1px solid var(--rule);
}

.header-content {
  max-width: 1400px;
  margin: 0 auto;
  padding: 1rem 2rem;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.app-title {
  margin: 0;
  font-size: 1.5rem;
  line-height: 1.2;
  font-weight: 600;
  color: var(--text-heading);
}

.app-nav {
  display: flex;
  gap: 2rem;
  align-items: center;
}

.nav-link {
  color: var(--ink-lt);
  text-decoration: none;
  transition: color 0.3s;
}

.nav-link:hover {
  color: var(--earth-lt);
}

.nav-link.logout {
  color: var(--tera-lt);
}

.app-main {
  flex: 1;
  max-width: 1400px;
  width: 100%;
  margin: 0 auto;
  padding: 2rem;
}

@media (max-width: 768px) {
  .header-content {
    flex-direction: column;
    gap: 1rem;
    align-items: flex-start;
  }

  .app-nav {
    width: 100%;
    flex-wrap: wrap;
  }

  .app-main {
    padding: 1rem;
  }
}
</style>
