<template>
  <div class="invoice-editor-page">
    <div class="page-header">
      <h1>{{ isEdit ? 'Edit Invoice' : 'Create Invoice' }}</h1>
      <router-link to="/invoices" class="btn btn-secondary">← Back</router-link>
    </div>

    <div v-if="conflictError" class="conflict-warning">
      <strong>Conflict:</strong> This invoice has been modified. Please refresh and try again.
      <button @click="reloadInvoice" class="btn btn-small mt-1">Refresh</button>
    </div>

    <form @submit.prevent="submitForm" class="invoice-form">
      <!-- Header Section -->
      <section class="form-section">
        <h2>Invoice Details</h2>
        
        <div class="form-row">
          <div class="form-group">
            <label>Invoice Number</label>
            <input v-model="form.invoiceNumber" type="text" disabled class="form-input" />
            <small>Auto-generated</small>
          </div>
          <div class="form-group">
            <label>PO Number *</label>
            <input
              v-model="form.poNumber"
              type="text"
              @change="markDirty"
              class="form-input"
              required
            />
          </div>
          <div class="form-group">
            <label>Invoice Date *</label>
            <input
              v-model="form.invoiceDate"
              type="date"
              @change="markDirty"
              class="form-input"
              required
            />
          </div>
        </div>

        <div class="form-row">
          <div class="form-group">
            <label>Vendor Name *</label>
            <input
              v-model="form.vendorName"
              type="text"
              @change="markDirty"
              class="form-input"
              required
            />
          </div>
          <div class="form-group">
            <label>Status</label>
            <select v-model="form.status" @change="markDirty" class="form-input">
              <option value="draft">Draft</option>
              <option value="ready">Ready</option>
              <option value="sent">Sent</option>
              <option value="paid">Paid</option>
            </select>
          </div>
        </div>
      </section>

      <!-- Line Items Section -->
      <section class="form-section">
        <h2>Line Items</h2>
        <div v-if="form.lineItems.length === 0" class="empty-items">
          No line items. <a href="#" @click.prevent="addLineItem" class="link">Add one</a>
        </div>
        <table v-else class="line-items-table">
          <thead>
            <tr>
              <th>Description</th>
              <th>Unit Price</th>
              <th>Quantity</th>
              <th>Tax %</th>
              <th>Line Amount</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(item, idx) in form.lineItems" :key="idx">
              <td>
                <input
                  v-model="item.description"
                  type="text"
                  @change="markDirty"
                  class="form-input"
                />
              </td>
              <td>
                <input
                  v-model.number="item.unitPrice"
                  type="number"
                  @change="markDirty"
                  class="form-input text-right"
                />
              </td>
              <td>
                <input
                  v-model.number="item.quantity"
                  type="number"
                  @change="markDirty"
                  class="form-input text-right"
                />
              </td>
              <td>
                <input
                  v-model.number="item.taxPercent"
                  type="number"
                  @change="markDirty"
                  class="form-input text-right"
                />
              </td>
              <td class="text-right">
                {{ formatCurrency(calculateLineAmount(item)) }}
              </td>
              <td>
                <button
                  type="button"
                  @click="removeLineItem(idx)"
                  class="btn btn-danger btn-small"
                >
                  Delete
                </button>
              </td>
            </tr>
          </tbody>
        </table>
        <button
          type="button"
          @click="addLineItem"
          class="btn btn-secondary mt-2"
        >
          + Add Line Item
        </button>
      </section>

      <!-- Totals Section -->
      <section class="form-section totals-section">
        <div class="totals-row">
          <span>Subtotal:</span>
          <span class="amount">{{ formatCurrency(subtotal) }}</span>
        </div>
        <div class="totals-row">
          <span>Tax:</span>
          <span class="amount">{{ formatCurrency(totalTax) }}</span>
        </div>
        <div class="totals-row total">
          <span>Total:</span>
          <span class="amount">{{ formatCurrency(totalAmount) }}</span>
        </div>
      </section>

      <!-- Notes Section -->
      <section class="form-section">
        <h2>Notes</h2>
        <textarea
          v-model="form.notes"
          @change="markDirty"
          class="form-input form-textarea"
          placeholder="Additional notes..."
          rows="4"
        ></textarea>
      </section>

      <!-- Error Display -->
      <div v-if="error" class="error-box mb-2">
        <strong>Error:</strong> {{ error.message }}
      </div>

      <!-- Buttons -->
      <div class="form-actions">
        <router-link to="/invoices" class="btn btn-secondary">Cancel</router-link>
        <button
          type="submit"
          :disabled="isSubmitting || !isDirty"
          class="btn btn-primary"
        >
          <span v-if="isSubmitting" class="loading"></span>
          {{ isEdit ? 'Save Changes' : 'Create Invoice' }}
        </button>
      </div>
    </form>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useForm } from '@/composables/useAsync'
import { apiClient } from '@/services/api'
import { toastManager } from '@/services/notifications'

const route = useRoute()
const router = useRouter()

const invoiceId = computed(() => route.params.id as string)
const isEdit = computed(() => !!invoiceId.value)
const conflictError = ref(false)
const rowVersion = ref<string>('')

interface LineItem {
  description: string
  unitPrice: number
  quantity: number
  taxPercent: number
}

interface Invoice {
  invoiceNumber: string
  poNumber: string
  invoiceDate: string
  vendorName: string
  status: string
  lineItems: LineItem[]
  notes: string
}

const { form, isDirty, isSubmitting, error, markDirty, submit } = useForm<Invoice>({
  invoiceNumber: '',
  poNumber: '',
  invoiceDate: new Date().toISOString().split('T')[0],
  vendorName: '',
  status: 'draft',
  lineItems: [],
  notes: '',
})

const subtotal = computed(() => {
  return form.value.lineItems.reduce((sum, item) => {
    return sum + (item.unitPrice * item.quantity)
  }, 0)
})

const totalTax = computed(() => {
  return form.value.lineItems.reduce((sum, item) => {
    const lineAmount = item.unitPrice * item.quantity
    return sum + (lineAmount * item.taxPercent / 100)
  }, 0)
})

const totalAmount = computed(() => {
  return subtotal.value + totalTax.value
})

const calculateLineAmount = (item: LineItem) => {
  const base = item.unitPrice * item.quantity
  return base + (base * item.taxPercent / 100)
}

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
  }).format(amount)
}

const addLineItem = () => {
  form.value.lineItems.push({
    description: '',
    unitPrice: 0,
    quantity: 1,
    taxPercent: 0,
  })
  markDirty()
}

const removeLineItem = (idx: number) => {
  form.value.lineItems.splice(idx, 1)
  markDirty()
}

const reloadInvoice = async () => {
  try {
    const response = await apiClient.getInvoice(invoiceId.value)
    const invoice = response.data
    form.value = {
      invoiceNumber: invoice.invoiceNumber,
      poNumber: invoice.poNumber,
      invoiceDate: invoice.invoiceDate,
      vendorName: invoice.vendorName,
      status: invoice.status,
      lineItems: invoice.lineItems || [],
      notes: invoice.notes || '',
    }
    rowVersion.value = invoice.rowVersion
    conflictError.value = false
  } catch (err: any) {
    toastManager.error('Failed to reload invoice')
  }
}

const submitForm = async () => {
  await submit(async (data) => {
    if (isEdit.value) {
      await apiClient.updateInvoice(invoiceId.value, data, rowVersion.value)
      toastManager.success('Invoice updated successfully')
    } else {
      await apiClient.createInvoice(data)
      toastManager.success('Invoice created successfully')
    }
    router.push('/invoices')
  }).catch((err) => {
    if (err.statusCode === 409) {
      conflictError.value = true
      toastManager.warning('Invoice was modified. Please refresh and try again.')
    }
  })
}

onMounted(async () => {
  if (isEdit.value) {
    await reloadInvoice()
  }
})
</script>

<style scoped>
.invoice-editor-page {
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

.conflict-warning {
  padding: 1rem;
  background-color: #fff3cd;
  color: #856404;
  border: 1px solid #ffeaa7;
  border-radius: 4px;
}

.invoice-form {
  display: flex;
  flex-direction: column;
  gap: 2rem;
}

.form-section {
  background: white;
  padding: 1.5rem;
  border: 1px solid #ddd;
  border-radius: 4px;
}

.form-section h2 {
  margin-top: 0;
  margin-bottom: 1.5rem;
  font-size: 1.25rem;
  color: #2c3e50;
  border-bottom: 2px solid #f0f0f0;
  padding-bottom: 1rem;
}

.form-row {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 1.5rem;
  margin-bottom: 1rem;
}

.form-group {
  display: flex;
  flex-direction: column;
}

.form-group label {
  margin-bottom: 0.5rem;
  font-weight: 500;
  color: #333;
}

.form-input {
  padding: 0.75rem;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 0.875rem;
}

.form-input:focus {
  outline: none;
  border-color: #3498db;
  box-shadow: 0 0 0 3px rgba(52, 152, 219, 0.1);
}

.form-input:disabled {
  background-color: #f5f5f5;
  color: #999;
  cursor: not-allowed;
}

.form-textarea {
  resize: vertical;
  min-height: 100px;
}

.form-group small {
  margin-top: 0.25rem;
  color: #999;
  font-size: 0.75rem;
}

.line-items-table {
  width: 100%;
  border-collapse: collapse;
  margin-bottom: 1rem;
}

.line-items-table th {
  background-color: #f0f0f0;
  padding: 0.75rem;
  text-align: left;
  font-weight: 600;
  border-bottom: 2px solid #ddd;
}

.line-items-table td {
  padding: 0.75rem;
  border-bottom: 1px solid #ddd;
}

.line-items-table input {
  width: 100%;
  padding: 0.5rem;
  border: 1px solid #ddd;
  border-radius: 4px;
}

.empty-items {
  padding: 2rem 1rem;
  text-align: center;
  background-color: #f9f9f9;
  border-radius: 4px;
  color: #666;
}

.link {
  color: #3498db;
  text-decoration: none;
  cursor: pointer;
}

.link:hover {
  text-decoration: underline;
}

.totals-section {
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
  font-size: 1.125rem;
  border-bottom: 2px solid #2c3e50;
  margin-top: 0.5rem;
}

.totals-row .amount {
  font-family: 'Courier New', monospace;
}

.form-actions {
  display: flex;
  gap: 1rem;
  justify-content: flex-end;
}

.form-actions .btn {
  min-width: 150px;
}

.error-box {
  padding: 1rem;
  background-color: #f8d7da;
  color: #721c24;
  border: 1px solid #f5c6cb;
  border-radius: 4px;
}

.text-right {
  text-align: right;
}

@media (max-width: 768px) {
  .form-row {
    grid-template-columns: 1fr;
  }

  .line-items-table {
    font-size: 0.8rem;
  }

  .line-items-table th,
  .line-items-table td {
    padding: 0.5rem;
  }

  .form-actions {
    flex-direction: column;
  }

  .form-actions .btn {
    width: 100%;
    min-width: auto;
  }
}
</style>
