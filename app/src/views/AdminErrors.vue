<template>
  <div class="admin-errors-page">
    <div class="page-header">
      <h1>Error Logs</h1>
      <button @click="refresh" class="btn btn-secondary">🔄 Refresh</button>
    </div>

    <div class="filters mb-3">
      <input
        v-model="searchQuery"
        @change="goToPage(1)"
        type="text"
        placeholder="Search errors..."
        class="search-input"
      />
      <select v-model="severityFilter" @change="goToPage(1)" class="severity-select">
        <option value="">All Severity</option>
        <option value="error">Error</option>
        <option value="warning">Warning</option>
        <option value="info">Info</option>
      </select>
    </div>

    <div v-if="!loading && !error">
      <button @click="prevPage" :disabled="!hasPrevPage()" class="btn btn-small">Previous</button>
      <span>Page {{ page }} ({{ total }} errors)</span>
      <button @click="nextPage" :disabled="!hasNextPage()" class="btn btn-small">Next</button>
    </div>

    <div v-if="loading" class="text-center p-3">
      <div class="loading"></div>
      <p>Loading error logs...</p>
    </div>

    <div v-else-if="error" class="error-box">
      <strong>Error:</strong> {{ error.message }}
      <button @click="refresh" class="btn btn-small mt-1">Retry</button>
    </div>

    <div v-else class="errors-table-container">
      <table class="errors-table">
        <thead>
          <tr>
            <th>Timestamp</th>
            <th>Severity</th>
            <th>Message</th>
            <th>Endpoint</th>
            <th>Details</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="errorLog in items" :key="errorLog.id">
            <td>{{ formatDate(errorLog.timestamp) }}</td>
            <td>
              <span :class="['severity-badge', `severity-${errorLog.severity}`]">
                {{ errorLog.severity }}
              </span>
            </td>
            <td class="message">{{ errorLog.message }}</td>
            <td>{{ errorLog.endpoint || '-' }}</td>
            <td>
              <button @click="showDetails(errorLog)" class="btn btn-small">View</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-if="selectedError" class="modal-overlay" @click="selectedError = null">
      <div class="modal" @click.stop>
        <div class="modal-header">
          <h2>Error Details</h2>
          <button @click="selectedError = null" class="btn-close">×</button>
        </div>
        <div class="modal-body">
          <div class="detail-row">
            <span class="label">Message:</span>
            <span class="value">{{ selectedError.message }}</span>
          </div>
          <div class="detail-row">
            <span class="label">Stack:</span>
            <code class="stack">{{ selectedError.stack }}</code>
          </div>
          <div class="detail-row">
            <span class="label">Context:</span>
            <pre class="context">{{ JSON.stringify(selectedError.context, null, 2) }}</pre>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { usePagination } from '@/composables/useAsync'
import { apiClient, ErrorLogRecord } from '@/services/api'

const searchQuery = ref('')
const severityFilter = ref('')
const selectedError = ref<ErrorLogRecord | null>(null)

const { items, page, total, loading, error, refresh, goToPage, nextPage, prevPage, hasNextPage, hasPrevPage } = usePagination<ErrorLogRecord>(
  async (page, size) => {
    const response = await apiClient.searchErrorLogs({
      page,
      pageSize: size,
      search: searchQuery.value || undefined,
      severity: severityFilter.value || undefined,
    })
    return {
      items: response.data.errors || [],
      total: response.data.total || 0,
    }
  },
  25
)

const formatDate = (dateString: string) => {
  return new Date(dateString).toLocaleString('en-IN')
}

const showDetails = (errorLog: ErrorLogRecord) => {
  selectedError.value = errorLog
}
</script>

<style scoped>
.admin-errors-page {
  display: flex;
  flex-direction: column;
  gap: 2rem;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-bottom: 1rem;
  border-bottom: 2px solid #ddd;
}

.page-header h1 {
  margin: 0;
}

.filters {
  display: flex;
  gap: 1rem;
}

.search-input,
.severity-select {
  padding: 0.75rem;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 0.875rem;
}

.search-input {
  flex: 1;
}

.errors-table-container {
  background: white;
  border: 1px solid #ddd;
  border-radius: 4px;
  overflow-x: auto;
}

.errors-table {
  width: 100%;
  border-collapse: collapse;
}

.errors-table th {
  background-color: #f0f0f0;
  padding: 1rem;
  text-align: left;
  font-weight: 600;
  border-bottom: 2px solid #ddd;
}

.errors-table td {
  padding: 1rem;
  border-bottom: 1px solid #ddd;
}

.errors-table tbody tr:hover {
  background-color: #f9f9f9;
}

.message {
  max-width: 300px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.severity-badge {
  display: inline-block;
  padding: 0.25rem 0.75rem;
  border-radius: 20px;
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
}

.severity-error {
  background-color: #f8d7da;
  color: #721c24;
}

.severity-warning {
  background-color: #fff3cd;
  color: #856404;
}

.severity-info {
  background-color: #d1ecf1;
  color: #0c5460;
}

.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal {
  background: white;
  border-radius: 8px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
  max-width: 700px;
  width: 90%;
  max-height: 80vh;
  overflow-y: auto;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1.5rem;
  border-bottom: 1px solid #ddd;
  position: sticky;
  top: 0;
  background: white;
}

.modal-header h2 {
  margin: 0;
}

.btn-close {
  background: none;
  border: none;
  font-size: 2rem;
  cursor: pointer;
  color: #999;
}

.modal-body {
  padding: 1.5rem;
}

.detail-row {
  margin-bottom: 1.5rem;
}

.label {
  display: block;
  font-weight: 600;
  color: #333;
  margin-bottom: 0.5rem;
}

.value {
  display: block;
  color: #666;
}

.stack {
  display: block;
  background-color: #f5f5f5;
  padding: 0.75rem;
  border-radius: 4px;
  font-family: 'Courier New', monospace;
  font-size: 0.75rem;
  overflow-x: auto;
  white-space: pre-wrap;
  word-break: break-word;
}

.context {
  display: block;
  background-color: #f5f5f5;
  padding: 0.75rem;
  border-radius: 4px;
  font-family: 'Courier New', monospace;
  font-size: 0.75rem;
  overflow-x: auto;
}

.error-box {
  padding: 1rem;
  background-color: #f8d7da;
  color: #721c24;
  border: 1px solid #f5c6cb;
  border-radius: 4px;
}

.text-center {
  text-align: center;
}
</style>
