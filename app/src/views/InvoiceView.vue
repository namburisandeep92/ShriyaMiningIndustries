<template>
  <div class="invoice-view-page">
    <div class="page-header">
      <h1>Invoice {{ invoiceData?.invoiceNumber }}</h1>
      <div class="header-actions">
        <button
          @click="downloadExcel"
          class="btn btn-secondary"
          v-if="hasPermission('invoice.read')"
        >
          📄 Export Excel
        </button>
        <button v-if="invoiceData?.document && hasPermission('invoice.read')" @click="downloadLegacyPdf" class="btn btn-secondary">Save PDF</button>
        <router-link
          :to="`/invoices/${invoiceId}/edit`"
          class="btn btn-primary"
          v-if="hasPermission('invoice.update')"
        >
          ✏️ Edit
        </router-link>
        <router-link to="/invoices" class="btn btn-secondary">← Back</router-link>
      </div>
    </div>

    <div v-if="loading" class="text-center p-3">
      <div class="loading"></div>
      <p>Loading invoice...</p>
    </div>

    <div v-else-if="error" class="error-box">
      <strong>Error:</strong> {{ error.message }}
      <button @click="reloadInvoice" class="btn btn-small mt-1">Retry</button>
    </div>

    <div v-else-if="invoiceData" class="invoice-content">
      <section v-if="invoiceData.document" class="invoice-section">
        <h2>Invoice &amp; packing list</h2>
        <iframe title="Invoice and packing list" :srcdoc="legacyPreview" sandbox="" style="width:100%;height:800px;border:1px solid #c8bead"></iframe>
      </section>
      <!-- Invoice Header -->
      <section class="invoice-section">
        <div class="section-row">
          <div class="section-col">
            <h3>Vendor</h3>
            <p>{{ invoiceData.vendorName }}</p>
          </div>
          <div class="section-col">
            <h3>PO Number</h3>
            <p>{{ invoiceData.poNumber }}</p>
          </div>
          <div class="section-col">
            <h3>Invoice Date</h3>
            <p>{{ formatDate(invoiceData.invoiceDate) }}</p>
          </div>
          <div class="section-col">
            <h3>Status</h3>
            <p>
              <span :class="['status-badge', `status-${invoiceData.status}`]">
                {{ invoiceData.status }}
              </span>
            </p>
          </div>
        </div>
      </section>

      <!-- Line Items -->
      <section class="invoice-section">
        <h2>Line Items</h2>
        <table class="invoice-table">
          <thead>
            <tr>
              <th>Description</th>
              <th class="text-right">Unit Price</th>
              <th class="text-right">Quantity</th>
              <th class="text-right">Tax %</th>
              <th class="text-right">Line Amount</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(item, idx) in invoiceData.lineItems" :key="idx">
              <td>{{ item.description }}</td>
              <td class="text-right">{{ formatCurrency(item.unitPrice) }}</td>
              <td class="text-right">{{ item.quantity }}</td>
              <td class="text-right">{{ item.taxPercent }}%</td>
              <td class="text-right">{{ formatCurrency(calculateLineAmount(item)) }}</td>
            </tr>
          </tbody>
        </table>
      </section>

      <!-- Totals -->
      <section class="invoice-section totals">
        <div class="totals-row">
          <span>Subtotal:</span>
          <span>{{ formatCurrency(subtotal) }}</span>
        </div>
        <div class="totals-row">
          <span>Tax:</span>
          <span>{{ formatCurrency(totalTax) }}</span>
        </div>
        <div class="totals-row total">
          <span>Total Amount:</span>
          <span>{{ formatCurrency(totalAmount) }}</span>
        </div>
      </section>

      <!-- Notes -->
      <section class="invoice-section" v-if="invoiceData.notes">
        <h2>Notes</h2>
        <p class="notes">{{ invoiceData.notes }}</p>
      </section>

      <!-- History -->
      <section class="invoice-section" v-if="hasPermission('invoice.read')">
        <h2>Version History</h2>
        <div v-if="historyLoading" class="text-center">
          <div class="loading"></div>
        </div>
        <div v-else-if="historyError" class="error-box">
          <strong>Error:</strong> {{ historyError.message }}
        </div>
        <table v-else class="history-table">
          <thead>
            <tr>
              <th>Version</th>
              <th>Modified</th>
              <th>By</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="entry in history" :key="`${entry.version}`">
              <td>v{{ entry.version }}</td>
              <td>{{ formatDate(entry.modifiedAt) }}</td>
              <td>{{ entry.modifiedBy || '-' }}</td>
              <td>
                <button
                  v-if="entry.version < invoiceData.version"
                  @click="showComparison(entry.version)"
                  class="btn btn-small"
                >
                  Compare
                </button>
                <span v-else>Current</span>
              </td>
            </tr>
          </tbody>
        </table>
        <div v-if="comparison">
          <h3>Version Comparison</h3>
          <p v-if="comparison.changes.length === 0">No changes</p>
          <div v-for="change in comparison.changes" :key="change.field">
            <strong>{{ change.field }}</strong>
            <pre>{{ JSON.stringify(change.before, null, 2) }}</pre>
            <pre>{{ JSON.stringify(change.after, null, 2) }}</pre>
          </div>
        </div>
      </section>

      <!-- Metadata -->
      <section class="invoice-section metadata">
        <div class="metadata-row">
          <span>Invoice ID:</span>
          <code>{{ invoiceId }}</code>
        </div>
        <div class="metadata-row">
          <span>Created:</span>
          <span>{{ formatDate(invoiceData.createdAt) }}</span>
        </div>
        <div class="metadata-row">
          <span>Modified:</span>
          <span>{{ formatDate(invoiceData.modifiedAt) }}</span>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { useAsync } from '@/composables/useAsync'
import { apiClient } from '@/services/api'
import { toastManager } from '@/services/notifications'
import { buildLegacyPrintHtml } from '../../../api/services/legacy-invoice.js'
import { printInvoice } from '@/services/invoice-download'

const route = useRoute()
const invoiceId = computed(() => route.params.id as string)
const comparison = ref<{ changes: { field: string; before: unknown; after: unknown }[] } | null>(null)
const legacyPreview = computed(() => invoiceData.value?.document ? buildLegacyPrintHtml(invoiceData.value.document, invoiceData.value.invoiceNumber) : '')
async function downloadLegacyPdf() {
  try {
    await printInvoice(await apiClient.legacyPrintHtml(invoiceId.value), `Invoice_${invoiceData.value!.invoiceNumber.replace(/[^a-zA-Z0-9_-]/g, '-')}`)
    toastManager.info('Choose Save as PDF to download the invoice and packing list')
  } catch (error) { toastManager.error(error instanceof Error ? error.message : 'Failed to open PDF print document') }
}

const { data: invoiceData, loading, error, execute: reloadInvoice } = useAsync(
  async () => {
    const response = await apiClient.getInvoice(invoiceId.value)
    return response.data
  },
  true
)

const { data: history, loading: historyLoading, error: historyError } = useAsync(
  async () => {
    const response = await apiClient.getInvoiceHistory(invoiceId.value)
    return response.data.versions || []
  },
  true
)

const subtotal = computed(() => {
  return invoiceData.value?.totals.subtotal ?? 0
})

const totalTax = computed(() => {
  return invoiceData.value?.totals.tax ?? 0
})

const totalAmount = computed(() => {
  return subtotal.value + totalTax.value
})

const hasPermission = (permission: string) => {
  return apiClient.hasPermission(permission)
}

const formatDate = (dateString: string) => {
  return new Date(dateString).toLocaleDateString('en-IN', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: invoiceData.value?.document ? 'USD' : 'INR',
  }).format(amount)
}

const calculateLineAmount = (item: any) => {
  const base = item.unitPrice * item.quantity
  return base + (base * item.taxPercent / 100)
}

const downloadExcel = async () => {
  try {
    const blob = await apiClient.exportInvoiceAsExcel(invoiceId.value)
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${invoiceData.value!.invoiceNumber}.xlsx`
    document.body.appendChild(a)
    a.click()
    window.URL.revokeObjectURL(url)
    document.body.removeChild(a)
    toastManager.success('Invoice exported successfully')
  } catch (err: any) {
    toastManager.error('Failed to export invoice: ' + err.message)
  }
}

const showComparison = async (version: number) => {
  try {
    if (!invoiceData.value) throw new Error('Invoice has not loaded')
    comparison.value = (await apiClient.compareInvoiceVersions(invoiceId.value, version, invoiceData.value.version)).data
  } catch {
    toastManager.error('Failed to compare invoice versions')
  }
}
</script>

<style scoped>
.invoice-view-page {
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
  flex: 1;
}

.header-actions {
  display: flex;
  gap: 1rem;
}

.invoice-content {
  display: flex;
  flex-direction: column;
  gap: 2rem;
}

.invoice-section {
  background: white;
  padding: 1.5rem;
  border: 1px solid #ddd;
  border-radius: 4px;
}

.invoice-section h2 {
  margin-top: 0;
  margin-bottom: 1.5rem;
  font-size: 1.25rem;
  color: #2c3e50;
  border-bottom: 2px solid #f0f0f0;
  padding-bottom: 1rem;
}

.section-row {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 2rem;
}

.section-col h3 {
  margin: 0 0 0.5rem 0;
  font-size: 0.875rem;
  text-transform: uppercase;
  color: #999;
  font-weight: 600;
}

.section-col p {
  margin: 0;
  font-size: 1rem;
  color: #333;
}

.invoice-table {
  width: 100%;
  border-collapse: collapse;
}

.invoice-table th {
  background-color: #f0f0f0;
  padding: 1rem;
  text-align: left;
  font-weight: 600;
  border-bottom: 2px solid #ddd;
}

.invoice-table td {
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

.totals {
  background-color: #f9f9f9;
}

.totals-row {
  display: flex;
  justify-content: space-between;
  padding: 0.75rem 0;
  border-bottom: 1px solid #ddd;
}

.totals-row.total {
  font-weight: 600;
  font-size: 1.25rem;
  border-top: 2px solid #2c3e50;
  border-bottom: none;
  margin-top: 1rem;
  padding-top: 1rem;
}

.notes {
  white-space: pre-wrap;
  color: #666;
  line-height: 1.6;
}

.history-table {
  width: 100%;
  border-collapse: collapse;
}

.history-table th {
  background-color: #f0f0f0;
  padding: 1rem;
  text-align: left;
  font-weight: 600;
  border-bottom: 2px solid #ddd;
}

.history-table td {
  padding: 1rem;
  border-bottom: 1px solid #ddd;
}

.metadata {
  background-color: #f9f9f9;
}

.metadata-row {
  display: flex;
  justify-content: space-between;
  padding: 0.75rem 0;
  border-bottom: 1px solid #ddd;
}

.metadata-row:last-child {
  border-bottom: none;
}

.metadata-row span {
  color: #666;
  font-weight: 500;
}

.metadata-row code {
  font-family: 'Courier New', monospace;
  color: #e74c3c;
  font-size: 0.875rem;
}

.text-center {
  text-align: center;
}

.text-right {
  text-align: right;
}

.error-box {
  padding: 1rem;
  background-color: #f8d7da;
  color: #721c24;
  border: 1px solid #f5c6cb;
  border-radius: 4px;
}

@media (max-width: 768px) {
  .page-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 1rem;
  }

  .header-actions {
    width: 100%;
    flex-wrap: wrap;
  }

  .section-row {
    grid-template-columns: 1fr;
    gap: 1rem;
  }

  .invoice-table {
    font-size: 0.8rem;
  }

  .invoice-table th,
  .invoice-table td {
    padding: 0.5rem;
  }
}
</style>
