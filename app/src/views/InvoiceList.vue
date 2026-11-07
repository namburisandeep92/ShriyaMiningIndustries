<template>
  <div class="invoice-list-page">
    <div class="page-header">
      <h1>Invoices</h1>
      <router-link to="/invoices/create" class="btn btn-primary" v-if="hasPermission('invoice.create')">
        + Create Invoice
      </router-link>
    </div>

    <div class="filters mb-3">
      <input
        v-model="searchQuery"
        @change="goToPage(1)"
        type="text"
        placeholder="Search by invoice number or PO..."
        class="search-input"
      />
      <select v-model="statusFilter" @change="goToPage(1)" class="status-select">
        <option value="">All Status</option>
        <option value="draft">Draft</option>
        <option value="in review">In Review</option>
        <option value="approved">Approved</option>
        <option value="shipped">Shipped</option>
      </select>
    </div>

    <div v-if="loading" class="text-center p-3">
      <div class="loading"></div>
      <p>Loading invoices...</p>
    </div>

    <div v-else-if="error" class="error-box">
      <strong>Error:</strong> {{ error.message }}
      <button @click="refresh" class="btn btn-small mt-1">Retry</button>
    </div>

    <div v-else-if="items.length === 0" class="empty-state">
      <p>No invoices found. Create one to get started.</p>
    </div>

    <div v-else class="invoice-table-container">
      <table class="invoice-table">
        <thead>
          <tr>
            <th>Invoice #</th>
            <th>PO #</th>
            <th>Vendor</th>
            <th>Date</th>
            <th>Amount</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="invoice in items" :key="invoice.id">
            <td>{{ invoice.invoiceNumber }}</td>
            <td>{{ invoice.poNumber || '-' }}</td>
            <td>{{ invoice.vendorName || '-' }}</td>
            <td>{{ formatDate(invoice.createdAt) }}</td>
            <td class="text-right">{{ formatCurrency(invoice.totalAmount, !!invoice.document) }}</td>
            <td>
              <span :class="['status-badge', `status-${invoice.status}`]">
                {{ invoice.status }}
              </span>
            </td>
            <td class="actions">
              <router-link :to="`/invoices/${invoice.id}`" class="action-link">
                View
              </router-link>
              <router-link
                :to="`/invoices/${invoice.id}/edit`"
                class="action-link"
                v-if="hasPermission('invoice.update')"
              >
                Edit
              </router-link>
              <button
                @click="downloadExcel(invoice.id, invoice.invoiceNumber)"
                class="action-link"
                v-if="hasPermission('invoice.read')"
              >
                Export
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-if="!loading && items.length > 0" class="pagination-container">
      <button
        @click="prevPage"
        :disabled="!hasPrevPage()"
        class="btn btn-small"
      >
        ← Previous
      </button>
      <span class="page-info">
        Page {{ page }} of {{ Math.ceil(total / pageSize) }} ({{ total }} total)
      </span>
      <button
        @click="nextPage"
        :disabled="!hasNextPage()"
        class="btn btn-small"
      >
        Next →
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { usePagination } from '@/composables/useAsync'
import { apiClient } from '@/services/api'
import { toastManager } from '@/services/notifications'

const searchQuery = ref('')
const statusFilter = ref('')

const { items, page, pageSize, total, loading, error, nextPage, prevPage, hasPrevPage, hasNextPage, goToPage, refresh } = usePagination<{
  id: string; invoiceNumber: string; vendorName: string; poNumber: string | null; createdAt: string; status: string; totalAmount: number; document?: unknown
}>(
  async (pageNum, size) => {
    const response = await apiClient.listInvoices({
      page: pageNum,
      pageSize: size,
      search: searchQuery.value || undefined,
      status: statusFilter.value || undefined,
    })
    return {
      items: response.data.invoices || [],
      total: response.data.total || 0,
    }
  },
  10
)

const hasPermission = (permission: string) => {
  return apiClient.hasPermission(permission)
}

const formatDate = (dateString: string) => {
  return new Date(dateString).toLocaleDateString('en-IN', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

const formatCurrency = (amount: number, legacy = false) => {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: legacy ? 'USD' : 'INR',
  }).format(amount)
}

const downloadExcel = async (invoiceId: string, invoiceNumber: string) => {
  try {
    const blob = await apiClient.exportInvoiceAsExcel(invoiceId)
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${invoiceNumber}.xlsx`
    document.body.appendChild(a)
    a.click()
    window.URL.revokeObjectURL(url)
    document.body.removeChild(a)
    toastManager.success('Invoice exported successfully')
  } catch (err: any) {
    toastManager.error('Failed to export invoice: ' + err.message)
  }
}
</script>

<style scoped>
.invoice-list-page {
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
  font-size: 2rem;
}

.filters {
  display: flex;
  gap: 1rem;
}

.search-input,
.status-select {
  padding: 0.75rem;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 0.875rem;
}

.search-input {
  flex: 1;
  min-width: 200px;
}

.status-select {
  width: 150px;
}

.invoice-table-container {
  overflow-x: auto;
  border: 1px solid #ddd;
  border-radius: 4px;
  background: white;
}

.invoice-table {
  width: 100%;
  border-collapse: collapse;
}

.invoice-table thead {
  background-color: #f0f0f0;
}

.invoice-table thead th {
  padding: 1rem;
  text-align: left;
  font-weight: 600;
  border-bottom: 2px solid #ddd;
}

.invoice-table tbody td {
  padding: 1rem;
  border-bottom: 1px solid #ddd;
}

.invoice-table tbody tr:hover {
  background-color: #f9f9f9;
}

.status-badge {
  display: inline-block;
  padding: 0.25rem 0.75rem;
  border-radius: 20px;
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
}

.status-draft {
  background-color: #e8e8e8;
  color: #333;
}

.status-ready {
  background-color: #d4edda;
  color: #155724;
}

.status-sent {
  background-color: #d1ecf1;
  color: #0c5460;
}

.status-paid {
  background-color: #c3e6cb;
  color: #155724;
}

.actions {
  display: flex;
  gap: 0.5rem;
}

.action-link {
  color: #3498db;
  cursor: pointer;
  text-decoration: none;
  font-size: 0.875rem;
}

.action-link:hover {
  text-decoration: underline;
}

.pagination-container {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 1rem;
  padding: 1rem;
}

.page-info {
  color: #666;
  font-size: 0.875rem;
}

.error-box {
  padding: 1rem;
  background-color: #f8d7da;
  color: #721c24;
  border: 1px solid #f5c6cb;
  border-radius: 4px;
}

.empty-state {
  padding: 3rem 1rem;
  text-align: center;
  color: #666;
  background-color: white;
  border: 1px solid #ddd;
  border-radius: 4px;
}

@media (max-width: 768px) {
  .page-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 1rem;
  }

  .filters {
    flex-direction: column;
  }

  .search-input,
  .status-select {
    width: 100%;
  }

  .invoice-table {
    font-size: 0.8rem;
  }

  .invoice-table thead th,
  .invoice-table tbody td {
    padding: 0.5rem;
  }

  .actions {
    flex-wrap: wrap;
  }
}
</style>
