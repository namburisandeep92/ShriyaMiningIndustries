<template>
  <div class="po-import-page">
    <div class="page-header">
      <h1>PO Import</h1>
      <router-link to="/invoices" class="btn btn-secondary">← Back</router-link>
    </div>

    <div class="upload-section">
      <div class="upload-box">
        <input
          ref="fileInput"
          type="file"
          accept=".xlsx,.xls"
          @change="handleFileSelect"
          class="file-input"
          hidden
        />
        <button @click="$refs.fileInput?.click()" class="btn btn-primary btn-large">
          📁 Select PO File
        </button>
        <p class="upload-hint">Supported format: .xlsx (Excel)</p>
      </div>
    </div>

    <div v-if="uploading" class="progress-section">
      <div class="loading"></div>
      <p>Uploading and processing...</p>
    </div>

    <div v-else-if="uploadError" class="error-box">
      <strong>Error:</strong> {{ uploadError.message }}
    </div>

    <div v-else-if="uploadResult" class="result-section">
      <h2>Import Results</h2>
      <div class="result-summary">
        <div class="result-item">
          <span>Items Processed:</span>
          <strong>{{ uploadResult.itemsCount }}</strong>
        </div>
        <div class="result-item">
          <span>Invoice Created:</span>
          <strong>{{ uploadResult.invoiceId }}</strong>
        </div>
      </div>
      <router-link :to="`/invoices/${uploadResult.invoiceId}`" class="btn btn-primary">
        View Invoice
      </router-link>
    </div>

    <div class="history-section" v-if="!uploading">
      <h2>Recent Imports</h2>
      <p class="placeholder">Import history will be shown here</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { apiClient } from '@/services/api'
import { toastManager } from '@/services/notifications'

const fileInput = ref<HTMLInputElement>()
const uploading = ref(false)
const uploadError = ref<any>(null)
const uploadResult = ref<any>(null)

const handleFileSelect = async (event: Event) => {
  const target = event.target as HTMLInputElement
  const files = target.files
  if (!files || files.length === 0) return

  const file = files[0]
  if (!file.name.match(/\.(xlsx|xls)$/i)) {
    toastManager.error('Please select a valid Excel file (.xlsx or .xls)')
    return
  }

  uploading.value = true
  uploadError.value = null
  uploadResult.value = null

  try {
    const response = await apiClient.uploadPO(file)
    uploadResult.value = response.data
    toastManager.success(`Imported ${response.data.itemsCount} items successfully`)
  } catch (err: any) {
    uploadError.value = err
    toastManager.error(`Upload failed: ${err.message}`)
  } finally {
    uploading.value = false
    if (fileInput.value) {
      fileInput.value.value = ''
    }
  }
}
</script>

<style scoped>
.po-import-page {
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

.upload-section {
  background: white;
  padding: 2rem;
  border: 1px solid #ddd;
  border-radius: 4px;
}

.upload-box {
  text-align: center;
  padding: 2rem;
  background-color: #f9f9f9;
  border: 2px dashed #3498db;
  border-radius: 4px;
}

.btn-large {
  padding: 1rem 2rem;
  font-size: 1rem;
}

.upload-hint {
  margin-top: 1rem;
  color: #999;
  font-size: 0.875rem;
}

.progress-section {
  padding: 2rem;
  text-align: center;
  background: white;
  border: 1px solid #ddd;
  border-radius: 4px;
}

.error-box {
  padding: 1rem;
  background-color: #f8d7da;
  color: #721c24;
  border: 1px solid #f5c6cb;
  border-radius: 4px;
}

.result-section {
  background: white;
  padding: 1.5rem;
  border: 1px solid #ddd;
  border-radius: 4px;
}

.result-section h2 {
  margin-top: 0;
  margin-bottom: 1.5rem;
}

.result-summary {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 1rem;
  margin-bottom: 1.5rem;
}

.result-item {
  display: flex;
  justify-content: space-between;
  padding: 1rem;
  background-color: #f0f0f0;
  border-radius: 4px;
}

.result-item span {
  color: #666;
}

.result-item strong {
  font-size: 1.125rem;
  color: #2c3e50;
}

.history-section {
  background: white;
  padding: 1.5rem;
  border: 1px solid #ddd;
  border-radius: 4px;
}

.history-section h2 {
  margin-top: 0;
  margin-bottom: 1rem;
}

.placeholder {
  color: #999;
  text-align: center;
  padding: 2rem;
}
</style>
