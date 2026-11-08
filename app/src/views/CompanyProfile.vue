<template>
  <div class="company-profile-page">
    <header class="page-header">
      <div>
        <h1>Company profile</h1>
        <p>Manage the exporter identity and defaults used for new invoices.</p>
      </div>
      <router-link to="/invoices" class="btn btn-secondary">Back to invoices</router-link>
    </header>

    <p v-if="loading" role="status">Loading company profile...</p>
    <div v-else-if="loadError" class="error-box" role="alert">
      {{ loadError }}
      <button type="button" class="btn btn-small" @click="loadProfile">Retry</button>
    </div>

    <form v-else-if="profile" @submit.prevent="saveProfile" novalidate>
      <fieldset v-for="section in sections" :key="section.title" class="profile-section">
        <legend>{{ section.title }}</legend>
        <div class="profile-fields">
          <label v-for="field in section.fields" :key="field.key" :class="{ wide: field.multiline }">
            {{ field.label }}<span v-if="field.required"> *</span>
            <textarea v-if="field.multiline" v-model="profile[field.key]" rows="4" :aria-invalid="!!fieldErrors[field.key]" />
            <input v-else v-model="profile[field.key]" :type="field.type || 'text'" :aria-invalid="!!fieldErrors[field.key]" />
            <small v-if="fieldErrors[field.key]" class="field-error" role="alert">{{ fieldErrors[field.key] }}</small>
          </label>
        </div>
      </fieldset>

      <p v-if="saveError" class="error-box" role="alert">{{ saveError }}</p>
      <div class="form-actions">
        <button type="submit" class="btn btn-primary" :disabled="saving">
          {{ saving ? 'Saving...' : 'Save company profile' }}
        </button>
      </div>
    </form>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { apiClient, type CompanyProfile } from '@/services/api'
import { toastManager } from '@/services/notifications'

type ProfileKey = keyof CompanyProfile
interface ProfileField { key: ProfileKey; label: string; required?: boolean; type?: string; multiline?: boolean }

const sections: { title: string; fields: ProfileField[] }[] = [
  { title: 'Identity', fields: [
    { key: 'legalName', label: 'Legal name', required: true },
    { key: 'addressLine1', label: 'Address line 1', required: true },
    { key: 'addressLine2', label: 'Address line 2' },
    { key: 'addressLine3', label: 'Address line 3' },
    { key: 'city', label: 'City' },
    { key: 'district', label: 'District' },
    { key: 'state', label: 'State' },
    { key: 'pinCode', label: 'PIN code' },
    { key: 'country', label: 'Country' },
    { key: 'phone', label: 'Phone', type: 'tel' },
    { key: 'email', label: 'Email', type: 'email' },
    { key: 'website', label: 'Website', type: 'url' },
  ] },
  { title: 'Registrations', fields: [
    { key: 'gstin', label: 'GSTIN' },
    { key: 'iec', label: 'IEC (Import Export Code)' },
    { key: 'pan', label: 'PAN' },
    { key: 'lutArn', label: 'LUT/ARN number' },
  ] },
  { title: 'Bank', fields: [
    { key: 'bankName', label: 'Bank name' },
    { key: 'bankBranch', label: 'Branch' },
    { key: 'accountNumber', label: 'Account number' },
    { key: 'ifsc', label: 'IFSC' },
    { key: 'swift', label: 'SWIFT' },
  ] },
  { title: 'Shipping defaults', fields: [
    { key: 'countryOfOrigin', label: 'Country of origin' },
    { key: 'preCarriageBy', label: 'Pre-carriage by' },
    { key: 'placeOfReceipt', label: 'Place of receipt' },
    { key: 'portOfLoading', label: 'Port of loading' },
    { key: 'packing', label: 'Packing' },
    { key: 'grade', label: 'Grade' },
  ] },
  { title: 'Text blocks', fields: [
    { key: 'declarationText', label: 'Declaration text', multiline: true },
    { key: 'authorisedSignatoryLabel', label: 'Authorised signatory label' },
  ] },
]

const profile = ref<CompanyProfile | null>(null)
const loading = ref(true)
const saving = ref(false)
const loadError = ref('')
const saveError = ref('')
const fieldErrors = ref<Partial<Record<ProfileKey, string>>>({})

async function loadProfile() {
  loading.value = true
  loadError.value = ''
  try {
    profile.value = await apiClient.getCompanyProfile()
  } catch (error) {
    loadError.value = error instanceof Error ? error.message : 'Could not load the company profile'
  } finally {
    loading.value = false
  }
}

function validateProfile(value: CompanyProfile) {
  const errors: Partial<Record<ProfileKey, string>> = {}
  if (!value.legalName?.trim()) errors.legalName = 'Legal name is required'
  if (!value.addressLine1?.trim()) errors.addressLine1 = 'Address line 1 is required'
  if (value.email?.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.email.trim())) {
    errors.email = 'Enter a valid email address'
  }
  return errors
}

async function saveProfile() {
  saveError.value = ''
  if (!profile.value) return
  fieldErrors.value = validateProfile(profile.value)
  if (Object.keys(fieldErrors.value).length) return

  saving.value = true
  try {
    profile.value = await apiClient.updateCompanyProfile(profile.value)
    toastManager.success('Company profile saved')
  } catch (error) {
    saveError.value = error instanceof Error ? error.message : 'Could not save the company profile'
    toastManager.error(saveError.value)
  } finally {
    saving.value = false
  }
}

onMounted(loadProfile)
</script>

<style scoped>
.company-profile-page { display: grid; gap: 1.25rem; }
.page-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem; }
.page-header h1 { margin: 0; color: var(--text-heading); font-size: var(--font-size-page-title); }
.page-header p { margin: .35rem 0 0; color: var(--text-secondary); }
.profile-section { min-width: 0; margin: 0 0 1rem; padding: 1rem 1.25rem 1.25rem; border: 1px solid var(--rule); border-radius: 10px; background: var(--surface-card); }
.profile-section legend { padding: 0 .4rem; color: var(--text-heading); font-size: var(--font-size-section-title); font-weight: 700; }
.profile-fields { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: .85rem 1rem; }
.profile-fields label { display: grid; gap: .35rem; color: var(--text-primary); font-size: var(--font-size-label); font-weight: 600; }
.profile-fields label.wide { grid-column: 1 / -1; }
.profile-fields input, .profile-fields textarea { width: 100%; padding: .6rem .7rem; border: 1px solid var(--rule); border-radius: 6px; background: var(--white); color: var(--text-primary); font: inherit; font-weight: 400; }
.profile-fields textarea { resize: vertical; }
.profile-fields [aria-invalid="true"] { border-color: var(--danger-border); }
.field-error { color: var(--danger-text); font-size: var(--font-size-caption); }
.form-actions { display: flex; justify-content: flex-end; }
.error-box { color: var(--danger-text); }
@media (max-width: 640px) {
  .page-header { flex-direction: column; }
  .profile-fields { grid-template-columns: minmax(0, 1fr); }
  .profile-fields label.wide { grid-column: auto; }
}
</style>
