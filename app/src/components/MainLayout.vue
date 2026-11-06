<template>
  <div class="app-layout">
    <header class="app-header">
      <div class="header-content">
        <h1 class="app-title">{{ config.appTitle }}</h1>
        <nav class="app-nav">
          <router-link to="/invoices" class="nav-link">Invoices</router-link>
          <router-link to="/po-import" class="nav-link" v-if="hasPermission('po.import')">
            PO Import
          </router-link>
          <router-link to="/admin" class="nav-link" v-if="hasPermission('admin.manage')">
            Admin
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
  background-color: #f5f5f5;
}

.app-header {
  background-color: #2c3e50;
  color: white;
  padding: 0;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
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
  font-weight: 600;
}

.app-nav {
  display: flex;
  gap: 2rem;
  align-items: center;
}

.nav-link {
  color: white;
  text-decoration: none;
  transition: color 0.3s;
}

.nav-link:hover {
  color: #3498db;
}

.nav-link.logout {
  color: #e74c3c;
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
