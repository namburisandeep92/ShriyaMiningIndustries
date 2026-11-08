<template>
  <div class="po-flow">
    <header class="toolbar">
      <h1>PO to invoice</h1>
      <router-link to="/invoices" class="btn btn-secondary">Back to invoices</router-link>
    </header>
    <nav class="toolbar" aria-label="Invoice steps">
      <button :disabled="busy || !!saved" @click="step = 1">1. Upload PO</button>
      <button :disabled="busy || !rows.length || !!saved" @click="step = 2">2. Select lines</button>
      <button :disabled="busy || !invoice" @click="step = 3">3. Review, preview &amp; download</button>
    </nav>
    <p v-if="error" role="alert" class="error">{{ error }}</p>
    <p v-if="busy" role="status">Processing...</p>

    <section v-if="step === 1" class="panel" @dragover.prevent @drop.prevent="dropFile">
      <h2>Upload PendingOrders</h2>
      <p>Select or drop the PendingOrders workbook. No vendor or PO number is needed to read the file.</p>
      <label>PO file <input type="file" accept=".xlsx,.csv" :disabled="busy" @change="selectFile" /></label>
      <p>Supported: .xlsx and .csv, up to 10 MB. Convert older .xls files to .xlsx first.</p>
    </section>

    <section v-if="step === 2" class="panel">
      <h2>Select PO lines</h2>
      <p role="status">{{ fileName }} loaded successfully. Invoice fields are validated after selecting lines.</p>
      <div class="toolbar">
        <label>Search <input v-model="query" placeholder="Search item, SKU, PO#..." /></label>
        <button @click="clearFilters">Clear filters</button>
        <button @click="selectShown(true)">Select shown</button>
        <button @click="selectShown(false)">Clear shown</button>
        <details>
          <summary>Columns</summary>
          <label v-for="column in columns" :key="column" class="column-option">
            <input type="checkbox" :checked="!hidden.has(column)" :disabled="column === 'SPS Item'" @change="toggleColumn(column)" />
            {{ column }}
          </label>
        </details>
        <strong role="status">{{ selected.size }} selected · {{ visibleRows.length }} of {{ rows.length }} shown</strong>
        <button class="btn btn-primary" :disabled="!selected.size" @click="review">Create invoice</button>
      </div>
      <div class="table-scroll">
        <table class="po-table">
          <colgroup><col class="select-column" /><col v-for="column in visibleColumns" :key="column" /></colgroup>
          <thead>
            <tr>
              <th class="pinned-check">Select</th>
              <th v-for="column in visibleColumns" :key="column" :class="{ pinned: column === 'SPS Item' }"
                  :draggable="column !== 'SPS Item'" @dragstart="dragColumn = column" @dragover.prevent @drop.prevent="moveColumn(column)">{{ column }}</th>
            </tr>
            <tr>
              <th class="pinned-check"></th>
              <th v-for="column in visibleColumns" :key="column" :class="{ pinned: column === 'SPS Item' }">
                <select v-if="filterOptions[column]" v-model="filters[column]" :aria-label="`Filter ${column}`">
                  <option value="">All</option>
                  <option v-for="value in filterOptions[column]" :key="value" :value="value">{{ value || '(blank)' }}</option>
                </select>
                <input v-else v-model="filters[column]" :aria-label="`Filter ${column}`" placeholder="Filter..." />
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in visibleRows" :key="row.key" :class="{ chosen: selected.has(row.id) }">
              <td class="pinned-check"><input type="checkbox" :aria-label="`Select PO line ${row.id + 1}`" :checked="selected.has(row.id)" @change="toggleSelection(row.id)" /></td>
              <td v-for="column in visibleColumns" :key="column" :class="{ pinned: column === 'SPS Item' }">{{ row.raw[column] }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <section v-if="step === 3 && invoice" class="panel">
      <h2>Review &amp; edit invoice</h2>
      <p>Amounts are USD, quantity × rate (no tax). Crate ranges follow table order. Rates start at the legacy defaults; check every line.</p>
      <p v-if="saved" role="status">Saved invoice {{ saved.invoiceNumber }} · version {{ saved.version }}</p>
      <div v-if="summaryMessages.length" class="error" role="alert" tabindex="-1" data-validation-summary>
        <strong>Correct these fields before saving or previewing:</strong>
        {{ summaryMessages.join('. ') }}
      </div>
      <div class="header-groups">
        <fieldset v-for="group in headerGroups" :key="group.title" :disabled="busy || !canEdit">
          <legend>{{ group.title }}</legend>
          <div class="fields">
            <label v-for="key in group.fields" :key="key">
              {{ key }}
              <textarea v-if="headerDefaults[key].includes('\n')" v-model="invoice.header[key]" rows="4"
                        :data-validation-key="`header:${key}`" :aria-invalid="invalid(key)" :class="{ invalid: invalid(key) }"
                        @blur="touch(key)"></textarea>
              <input v-else v-model="invoice.header[key]" :type="/date/i.test(key) ? 'date' : 'text'"
                     :inputmode="key === 'Crate starting no' ? 'numeric' : undefined"
                     :data-validation-key="`header:${key}`" :aria-invalid="invalid(key)" :class="{ invalid: invalid(key) }"
                     @blur="touch(key)" />
              <small v-if="fieldIssue(key)" class="field-error" role="alert">{{ fieldIssue(key) }}</small>
            </label>
          </div>
        </fieldset>
      </div>
      <p v-if="groupedLines.length">Enter one required HSN code for each category in its heading. Non-digits are removed automatically.</p>
      <div class="table-scroll line-scroll">
        <table class="line-table">
          <thead><tr>
            <th v-for="field in lineFields" :key="field.key">{{ field.label }}</th>
            <th>Amount USD</th><th>Action</th>
          </tr></thead>
          <tbody>
            <template v-for="category in groupedLines" :key="category.name">
              <tr class="category-row">
                <th :colspan="lineFields.length + 2">
                  <div class="category-heading">
                    <strong>{{ category.name }}</strong>
                    <label>
                      HSN code *
                      <input v-model="invoice.hsnCodes[category.rawName]" :aria-label="`${category.name} HSN code`" inputmode="numeric"
                             :disabled="busy || !canEdit" :data-validation-key="`category:${category.rawName}:hsn`"
                             :aria-invalid="invalid('hsn', undefined, category.rawName)"
                             :class="{ invalid: invalid('hsn', undefined, category.rawName) }"
                             @input="sanitizeCategoryHsn(category.rawName)"
                             @blur="sanitizeCategoryHsn(category.rawName); touch('hsn', undefined, category.rawName)" />
                      <small v-if="fieldIssue('hsn', undefined, category.rawName)" class="field-error" role="alert">
                        {{ fieldIssue('hsn', undefined, category.rawName) }}
                      </small>
                    </label>
                  </div>
                </th>
              </tr>
              <tr v-for="entry in category.lines" :key="entry.line.src || entry.index">
                  <td v-for="field in lineFields" :key="field.key">
                    <div v-if="field.key === 'stone'" class="stone-ref">
                      <input v-model="entry.line.stone" :aria-label="`Line ${entry.index + 1} Stone`" :disabled="busy || !canEdit"
                             :size="inputSize(entry.line.stone, 'Stone')"
                             :data-validation-key="`line:${entry.index}:stone`" :aria-invalid="invalid('stone', entry.index)"
                             :class="{ invalid: invalid('stone', entry.index) }" @blur="touch('stone', entry.index)" />
                      <input v-model="entry.line.ref" :aria-label="`Line ${entry.index + 1} PO / ref`" :disabled="busy || !canEdit"
                             :size="inputSize(entry.line.ref, 'PO / ref')"
                             :data-validation-key="`line:${entry.index}:ref`" :aria-invalid="invalid('ref', entry.index)"
                             :class="{ invalid: invalid('ref', entry.index) }" @blur="touch('ref', entry.index)" />
                    </div>
                    <template v-else>
                      <input v-model="entry.line[field.key]" :aria-label="`Line ${entry.index + 1} ${field.label}`"
                             :size="inputSize(entry.line[field.key], field.label)"
                             :inputmode="field.numeric ? 'decimal' : undefined" :readonly="field.key === 'crt'"
                             :disabled="busy || !canEdit" :data-validation-key="`line:${entry.index}:${field.key}`"
                             :aria-invalid="invalid(field.key, entry.index)" :class="{ invalid: invalid(field.key, entry.index) }"
                             @blur="touch(field.key, entry.index)" />
                      <small v-if="fieldIssue(field.key, entry.index)" class="field-error" role="alert">
                        {{ fieldIssue(field.key, entry.index) }}
                      </small>
                    </template>
                  </td>
                  <td>{{ money(lineAmount(entry.line)) }}</td>
                  <td><button :disabled="busy || !canEdit" @click="invoice.lines.splice(entry.index, 1)">Remove</button></td>
              </tr>
            </template>
          </tbody>
        </table>
      </div>
      <button data-validation-key="header:lines" :disabled="busy || !canEdit" @click="addLine">Add line</button>
      <p>Total crates: {{ totalCrates }} · {{ quantityTotal }} · Wgt: {{ totalWeight }} KGS · <strong>TOTAL USD {{ money(total) }}</strong></p>
      <label>Amount chargeable in words <input v-model="invoice.words" aria-label="Amount chargeable in words" readonly /></label>
      <fieldset :disabled="busy || !!saved || !canEdit">
        <legend>Cloud invoice association</legend>
        <p>Choose the database vendor and buyer before saving. These do not replace the editable exporter and consignee above.</p>
        <div class="fields">
          <label>Vendor <select v-model.number="vendorId" aria-label="Vendor"><option :value="0">Select vendor</option><option v-for="vendor in master.vendors" :key="vendor.id" :value="vendor.id">{{ vendor.name }}</option></select></label>
          <label>Buyer <select v-model.number="buyerId" aria-label="Buyer"><option :value="0">Select buyer</option><option v-for="buyer in master.buyers" :key="buyer.id" :value="buyer.id">{{ buyer.name }}</option></select></label>
        </div>
      </fieldset>
      <p v-if="!saved && (!vendorId || !buyerId)">Vendor and buyer are required to save &amp; download. Preview does not require a database association.</p>
      <div class="toolbar">
        <label>Format <select v-model="format" aria-label="Format"><option value="excel">Excel (.xlsx)</option><option value="pdf">PDF (Save as PDF in print dialog)</option></select></label>
        <button :disabled="busy || !canEdit || (!saved && (!vendorId || !buyerId))" @click="saveInvoice">Save</button>
        <button :disabled="busy" @click="preview">Preview</button>
        <button class="btn btn-primary" :disabled="busy || !canEdit || (!saved && (!vendorId || !buyerId))" @click="saveDownload">Save &amp; download</button>
        <button v-if="saved" :disabled="busy" @click="reload">Reload saved invoice (discard edits)</button>
      </div>
      <div v-if="previewHtml">
        <h3>Preview</h3>
        <iframe title="Invoice and packing list preview" :srcdoc="previewHtml" sandbox="" class="preview"></iframe>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { onBeforeRouteLeave, useRoute } from 'vue-router'
import { apiClient, type InvoiceDocument, type InvoiceInput } from '@/services/api'
import { toastManager } from '@/services/notifications'
import { downloadBlob, printInvoice } from '@/services/invoice-download'
import {
  amountWords, buildLegacyPrintHtml, buildLegacyWorkbook, cleanHsnCode, crateRanges, createLegacyInvoice, excelPreviewHtml,
  groupedLinesByHsn, headerDefaults, headerGroups, invoiceTotal, lineAmount, validateLegacyInvoice,
  type LegacyDocument, type LegacyLine, type PORow,
} from '../../../api/services/legacy-invoice.js'

const route = useRoute()
const step = ref(1)
const busy = ref(false)
const error = ref('')
const fileName = ref('')
const rows = ref<PORow[]>([])
const columns = ref<string[]>([])
const hidden = ref(new Set<string>())
const selected = ref(new Set<number>())
const query = ref('')
const filters = ref<Record<string, string>>({})
const dragColumn = ref('')
const invoice = ref<LegacyDocument>()
const saved = ref<InvoiceDocument>()
const savedJson = ref('')
const format = ref('excel')
const previewHtml = ref('')
let hydrating = false
const validationAttempted = ref(false)
const touchedFields = ref(new Set<string>())
interface HsnMemory { categoryCodes: Record<string, string> }
const hsnMemory = ref<HsnMemory>({ categoryCodes: {} })
const master = ref<{ vendors: { id: number; name: string }[]; buyers: { id: number; name: string }[] }>({ vendors: [], buyers: [] })
const vendorId = ref(0)
const buyerId = ref(0)
const canEdit = computed(() => apiClient.hasPermission(saved.value ? 'invoice.update' : 'invoice.create'))
const issues = computed(() => invoice.value ? validateLegacyInvoice(invoice.value) : [])
const issueKey = (field: string, line?: number, category?: string) => category
  ? `category:${category}:${field}` : line === undefined ? `header:${field}` : `line:${line}:${field}`
const visibleIssues = computed(() => issues.value.filter(issue => validationAttempted.value
  || touchedFields.value.has(issueKey(issue.field, issue.line, issue.category))))
const invalid = (field: string, line?: number, category?: string) => visibleIssues.value.some(issue =>
  issue.field === field && issue.line === line && issue.category === category)
const fieldIssue = (field: string, line?: number, category?: string) => visibleIssues.value.find(issue =>
  issue.field === field && issue.line === line && issue.category === category)?.message
const summaryMessages = computed(() => validationAttempted.value ? issues.value.map(issue => issue.message) : [])
const groupedLines = computed(() => {
  const document = invoice.value
  if (!document) return []
  return groupedLinesByHsn(document.lines, document).map(category => {
    return {
      name: category.category || 'Uncategorized',
      rawName: category.category,
      lines: category.codes.flatMap(group => group.lines),
    }
  })
})
const visibleColumns = computed(() => columns.value.filter(column => !hidden.value.has(column)))
const filterOptions = computed(() => Object.fromEntries(columns.value.flatMap(column => {
  const values = [...new Set(rows.value.map(row => row.raw[column]))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
  return values.length > 1 && values.length <= 30 ? [[column, values]] : []
})))
const visibleRows = computed(() => rows.value.filter(row => row.all.includes(query.value.toLowerCase())
  && Object.entries(filters.value).every(([column, value]) => !value || (filterOptions.value[column]
    ? row.raw[column] === value : row.raw[column].toLowerCase().includes(value.toLowerCase())))))
const total = computed(() => invoiceTotal(invoice.value?.lines || []))
const totalCrates = computed(() => (invoice.value?.lines || []).reduce((sum, line) => sum + (Number(line.crates) || 0), 0))
const totalWeight = computed(() => (invoice.value?.lines || []).reduce((sum, line) => sum + (Number(line.weight) || 0), 0))
const quantityTotal = computed(() => {
  const lines = invoice.value?.lines || []
  const units = new Set(lines.map(line => line.uom.trim().toUpperCase()))
  return units.size === 1 ? `Quantity: ${lines.reduce((sum, line) => sum + (Number(line.qty) || 0), 0)} ${[...units][0]}` : 'Mixed UOM: quantities not combined'
})
const money = (value: number) => Number.isFinite(value) ? value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : 'Invalid'
const message = (value: unknown) => value && typeof value === 'object' && 'message' in value ? String(value.message) : String(value)
const lineFields: { key: keyof LegacyLine; label: string; numeric?: boolean }[] = [
  { key: 'stone', label: 'Stone / PO ref' }, { key: 'finish', label: 'Finish' }, { key: 'size', label: 'Size' },
  { key: 'crates', label: 'Crate count', numeric: true }, { key: 'crt', label: 'Crate range' }, { key: 'qty', label: 'Qty', numeric: true },
  { key: 'uom', label: 'UOM' }, { key: 'weight', label: 'Wgt', numeric: true },
  { key: 'rate', label: 'Rate / UOM', numeric: true },
]
function inputSize(value: unknown, label: string) {
  return Math.max(label.length, String(value ?? '').length, 4)
}
function toggleSelection(id: number) { selected.value.has(id) ? selected.value.delete(id) : selected.value.add(id) }
function selectShown(on: boolean) { visibleRows.value.forEach(row => on ? selected.value.add(row.id) : selected.value.delete(row.id)) }
function toggleColumn(column: string) { hidden.value.has(column) ? hidden.value.delete(column) : hidden.value.add(column) }
function clearFilters() { filters.value = {}; query.value = '' }
function moveColumn(target: string) {
  if (!dragColumn.value || target === 'SPS Item' || dragColumn.value === 'SPS Item') return
  const from = columns.value.indexOf(dragColumn.value)
  const to = columns.value.indexOf(target)
  columns.value.splice(from, 1)
  columns.value.splice(to, 0, dragColumn.value)
  dragColumn.value = ''
}
const hsnMemoryKey = 'smi_hsn_memory_v3'
const previousHsnMemoryKey = 'smi_hsn_memory_v2'
const oldHsnCodesKey = 'smi_last_hsn_codes_v1'
function readHsnMemory(): HsnMemory {
  try {
    const stored = window.localStorage.getItem(hsnMemoryKey) || window.localStorage.getItem(previousHsnMemoryKey)
    if (stored) {
      const parsed: unknown = JSON.parse(stored)
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Stored HSN memory has an invalid format')
      const value = parsed as { categoryCodes?: unknown }
      const categoryCodes = value.categoryCodes && typeof value.categoryCodes === 'object' && !Array.isArray(value.categoryCodes)
        ? value.categoryCodes as Record<string, unknown> : {}
      return {
        categoryCodes: Object.fromEntries(Object.entries(categoryCodes).map(([category, code]) => [
          category, cleanHsnCode(Array.isArray(code) ? code[0] : code),
        ]).filter(([, code]) => code)),
      }
    }
    const old = window.localStorage.getItem(oldHsnCodesKey)
    if (!old) return { categoryCodes: {} }
    const parsed: unknown = JSON.parse(old)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Stored HSN codes have an invalid format')
    return { categoryCodes: Object.fromEntries(Object.entries(parsed).map(([category, code]) => [category, cleanHsnCode(code)])
      .filter(([, code]) => code)) }
  } catch (cause) {
    error.value = `Could not load remembered HSN codes: ${message(cause)}`
    return { categoryCodes: {} }
  }
}
function touch(field: string, line?: number, category?: string) {
  const updated = new Set(touchedFields.value)
  updated.add(issueKey(field, line, category))
  touchedFields.value = updated
}
function sanitizeCategoryHsn(category: string) {
  if (!invoice.value) return
  invoice.value.hsnCodes[category] = cleanHsnCode(invoice.value.hsnCodes[category])
}
function hsnMemoryForDocument(document: LegacyDocument): HsnMemory {
  const memory: HsnMemory = { categoryCodes: { ...hsnMemory.value.categoryCodes } }
  const codes: Record<string, string> = {}
  for (const category of new Set(document.lines.map(line => line.kind).filter(Boolean))) {
    const code = cleanHsnCode(document.hsnCodes?.[category])
    codes[category] = code
    if (code) memory.categoryCodes[category] = code
  }
  document.hsnCodes = codes
  delete document.knownHsnCodes
  return memory
}
function rememberSavedHsnCodes(document: LegacyDocument) {
  const memory = hsnMemoryForDocument(document)
  try {
    window.localStorage.setItem(hsnMemoryKey, JSON.stringify(memory))
    hsnMemory.value = memory
  } catch (cause) {
    throw new Error(`Could not remember saved HSN codes in this browser: ${message(cause)}`)
  }
}
function resetValidation() {
  validationAttempted.value = false
  touchedFields.value = new Set()
}
async function validateForAction() {
  if (!invoice.value) return false
  for (const category of groupedLines.value) sanitizeCategoryHsn(category.rawName)
  validationAttempted.value = true
  if (!issues.value.length) return true
  await nextTick()
  const first = issues.value[0]
  const key = first.category ? `category:${first.category}:${first.field}`
    : first.line === undefined ? `header:${first.field}` : `line:${first.line}:${first.field}`
  const target = [...document.querySelectorAll<HTMLElement>('[data-validation-key]')]
    .find(element => element.dataset.validationKey === key)
  target?.focus()
  target?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  return false
}
async function loadFile(file?: File) {
  if (!file || busy.value) return
  if (!/\.(xlsx|csv)$/i.test(file.name) || !file.size || file.size > 10 * 1024 * 1024) {
    error.value = 'Select an .xlsx or .csv PO file between 1 byte and 10 MB'
    return
  }
  if (invoice.value && !window.confirm('Replace this unsaved PO invoice?')) return
  busy.value = true
  error.value = ''
  try {
    const result = await apiClient.parsePO(file)
    rows.value = result.rows
    fileName.value = result.fileName
    columns.value = result.columns.includes('SPS Item') ? ['SPS Item', ...result.columns.filter(column => column !== 'SPS Item')] : result.columns
    hidden.value.clear()
    selected.value.clear()
    clearFilters()
    invoice.value = undefined
    saved.value = undefined
    savedJson.value = ''
    step.value = 2
  } catch (cause) { error.value = message(cause); toastManager.error(error.value) }
  finally { busy.value = false }
}
function selectFile(event: Event) {
  if (event.target instanceof HTMLInputElement) {
    void loadFile(event.target.files?.[0])
    event.target.value = ''
  }
}
function dropFile(event: DragEvent) { void loadFile(event.dataTransfer?.files[0]) }
function review() {
  if (!selected.value.size) return
  hsnMemory.value = readHsnMemory()
  const next = createLegacyInvoice(rows.value.filter(row => selected.value.has(row.id)), invoice.value?.lines, invoice.value?.header, hsnMemory.value)
  if (invoice.value) next.header = { ...next.header, ...invoice.value.header, 'Buyer PO nos': next.header['Buyer PO nos'], 'Buyer PO date': next.header['Buyer PO date'] }
  if (invoice.value) next.hsnCodes = { ...next.hsnCodes, ...invoice.value.hsnCodes }
  hsnMemoryForDocument(next)
  invoice.value = next
  resetValidation()
  step.value = 3
}
function addLine() {
  invoice.value?.lines.push({ stone: '', finish: '', size: '', ref: '', crates: '', crt: '', qty: '', uom: 'SF', weight: '', rate: '', kind: '', sku: '' })
}
watch(() => [invoice.value?.header['Crate starting no'], invoice.value?.lines.map(line => line.crates)], () => {
  if (!invoice.value) return
  crateRanges(invoice.value.lines, invoice.value.header['Crate starting no']).forEach((range, index) => { invoice.value!.lines[index].crt = range })
}, { deep: true, flush: 'sync' })
watch(total, value => {
  if (invoice.value && !hydrating) invoice.value.words = Number.isFinite(value) ? amountWords(value) : ''
}, { flush: 'sync' })
watch(invoice, () => { previewHtml.value = '' }, { deep: true })
watch(format, () => { previewHtml.value = '' })
async function preview() {
  if (!invoice.value || busy.value || !await validateForAction()) return
  busy.value = true
  error.value = ''
  try {
    previewHtml.value = format.value === 'pdf' ? buildLegacyPrintHtml(invoice.value, invoice.value.header['Invoice no'])
      : excelPreviewHtml(await buildLegacyWorkbook(invoice.value), invoice.value.header['Invoice no'])
  } catch (cause) { error.value = message(cause); toastManager.error(error.value) }
  finally { busy.value = false }
}
function applySaved(value: InvoiceDocument) {
  if (!value.document) throw new Error('Saved invoice has no PO document')
  saved.value = value
  hydrating = true
  invoice.value = value.document
  const documentWithLegacyCodes = invoice.value as LegacyDocument & {
    hsnCodes?: Record<string, string>; knownHsnCodes?: Record<string, string[]>;
    lines: (LegacyLine & { net?: string | number; gross?: string | number })[];
  }
  invoice.value.hsnCodes ||= {}
  for (const line of invoice.value.lines) {
    invoice.value.hsnCodes[line.kind] = cleanHsnCode(invoice.value.hsnCodes[line.kind]
      || line.hsnCode || documentWithLegacyCodes.knownHsnCodes?.[line.kind]?.[0])
    line.weight = line.weight ?? line.net ?? line.gross ?? ''
    delete line.hsnCode
    delete line.net
    delete line.gross
    line.sku ||= ''
  }
  for (const [category, code] of Object.entries(invoice.value.hsnCodes)) invoice.value.hsnCodes[category] = cleanHsnCode(code)
  delete documentWithLegacyCodes.knownHsnCodes
  hsnMemory.value = readHsnMemory()
  hydrating = false
  vendorId.value = value.vendorId
  buyerId.value = value.buyerId
  savedJson.value = JSON.stringify(value.document)
  resetValidation()
  step.value = 3
}
async function reload() {
  const id = saved.value?.id || (typeof route.query.invoice === 'string' ? route.query.invoice : '')
  if (!id) return
  busy.value = true
  error.value = ''
  try { applySaved((await apiClient.getInvoice(id)).data) }
  catch (cause) { error.value = message(cause); toastManager.error(error.value) }
  finally { busy.value = false }
}
async function persistInvoice() {
  if (!invoice.value) throw new Error('Invoice details are unavailable')
  hsnMemoryForDocument(invoice.value)
  if (!saved.value) {
    const input: InvoiceInput = {
      invoiceDate: invoice.value.header['Invoice date'], vendorId: vendorId.value, buyerId: buyerId.value,
      document: invoice.value, lineItems: invoice.value.lines.map(line => ({
        description: `${line.stone} ${line.finish} ${line.size} ${line.ref}`.trim() || 'Invoice line',
        quantity: Number(line.qty), unitPrice: Number(line.rate), taxPercent: 0, unitOfMeasure: line.uom,
      })),
    }
    applySaved((await apiClient.createInvoice(input)).data)
  } else if (JSON.stringify(invoice.value) !== savedJson.value) {
    applySaved((await apiClient.updateInvoice(saved.value.id, { document: invoice.value }, saved.value.rowVersion)).data)
  }
  if (!invoice.value) throw new Error('Saved invoice document is unavailable')
  rememberSavedHsnCodes(invoice.value)
}
async function saveInvoice() {
  if (!invoice.value || busy.value || !canEdit.value || (!saved.value && (!vendorId.value || !buyerId.value))
      || !await validateForAction()) return
  busy.value = true
  error.value = ''
  try {
    await persistInvoice()
    toastManager.success('Invoice saved')
  } catch (cause) {
    error.value = message(cause)
    toastManager.error(error.value)
  } finally { busy.value = false }
}
async function saveDownload() {
  if (!invoice.value || busy.value || !canEdit.value || (!saved.value && (!vendorId.value || !buyerId.value))
      || !await validateForAction()) return
  busy.value = true
  error.value = ''
  try {
    await persistInvoice()
    const id = saved.value!.id
    const name = `Invoice_${invoice.value!.header['Invoice no'].replace(/[^a-zA-Z0-9_-]/g, '-')}_${new Date().toISOString().replace(/[-:TZ.]/g, '')}`
    if (format.value === 'excel') downloadBlob(await apiClient.exportInvoiceAsExcel(id), `${name}.xlsx`)
    else {
      await printInvoice(await apiClient.legacyPrintHtml(id), name)
      toastManager.info('Choose Save as PDF in the print dialog; both invoice and packing list are included')
    }
    toastManager.success('Invoice saved')
  } catch (cause) {
    error.value = saved.value && JSON.stringify(invoice.value) === savedJson.value
      ? `Invoice is saved, but a follow-up action failed: ${message(cause)}. Retry Save & download to continue.`
      : message(cause)
    toastManager.error(error.value)
  }
  finally { busy.value = false }
}
onMounted(async () => {
  try { master.value = await apiClient.masterData() }
  catch (cause) { error.value = `Could not load vendor/buyer choices: ${message(cause)}`; toastManager.error(error.value) }
  hsnMemory.value = readHsnMemory()
  if (route.query.invoice) await reload()
})
onBeforeRouteLeave(() => !invoice.value || JSON.stringify(invoice.value) === savedJson.value || window.confirm('Leave without saving invoice changes?'))
</script>

<style scoped>
.po-flow { display: grid; grid-template-columns: minmax(0, 1fr); gap: 1rem; min-width: 0; }
.toolbar { display: flex; align-items: center; flex-wrap: wrap; gap: .75rem; }
.panel { padding: 1.5rem; background: white; border: 1px solid #c8bead; border-radius: 5px; min-width: 0; }
fieldset { border: 1px solid #c8bead; margin: 1rem 0; }
legend { color: #7a5c3e; font-weight: bold; }
.fields { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 1rem; }
.header-groups { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: .5rem 1rem; align-items: start; }
.header-groups fieldset { min-width: 0; margin: .5rem 0; }
.header-groups .fields { grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: .75rem; }
label { display: grid; gap: .3rem; }
input, select, textarea { border: 1px solid #aaa; border-radius: 3px; padding: .5rem; min-width: 0; font: inherit; }
button { cursor: pointer; padding: .5rem .75rem; }
button:disabled { cursor: not-allowed; opacity: .55; }
.error { background: #f2e2da; color: #7e3a24; padding: 1rem; }
.category-row th { background: #e4d3bd; color: #60442f; }
.category-heading { display: flex; align-items: center; justify-content: space-between; gap: 1rem; }
.category-heading label { display: grid; grid-template-columns: auto minmax(8rem, 12rem); align-items: center; gap: .5rem; }
.category-heading small { grid-column: 1 / -1; }
.line-table input[type="checkbox"] { width: auto; }
.invalid { border: 2px solid #c32032; background: #fff4f4; }
.field-error { color: #7e3a24; font-weight: 600; }
.table-scroll { overflow: auto; max-height: 65vh; margin: 1rem 0; }
table { border-collapse: separate; border-spacing: 0; }
th, td { border-right: 1px solid var(--rule-lt); border-bottom: 1px solid var(--rule-lt); padding: .5rem; text-align: left; }
th { background: #ede6da; position: relative; }
.po-table { width: max-content; min-width: 100%; }
.po-table th { position: sticky; top: 0; z-index: 2; height: 40px; box-sizing: border-box; white-space: nowrap; }
.po-table thead tr:nth-child(2) th { top: 40px; height: auto; }
.po-table td { white-space: nowrap; }
.select-column { width: 65px; }
.pinned-check { position: sticky; left: 0; background: white; width: 65px; min-width: 65px; max-width: 65px; box-sizing: border-box; z-index: 1; }
.pinned-check input { width: auto; min-width: 0; }
.pinned { position: sticky; left: 65px; background: white; z-index: 1; }
.po-table th.pinned, .po-table th.pinned-check { z-index: 3; background: #ede6da; }
.chosen td { background: #f1e5d7; }
.line-table { table-layout: auto; width: max-content; }
.line-table th { position: sticky; top: 0; z-index: 2; }
.line-table th:first-child, .line-table td:first-child { position: sticky; left: 0; background: white; z-index: 1; box-shadow: 2px 0 0 #c8bead; }
.line-table th:first-child { background: #ede6da; z-index: 3; }
.stone-ref { display: grid; gap: .3rem; }
.line-table input { width: auto; box-sizing: border-box; }
.column-option { display: flex; padding: .2rem; }
.preview { width: 100%; height: 800px; border: 1px solid #c8bead; }
@media (max-width: 900px) { .header-groups { grid-template-columns: minmax(0, 1fr); } }
</style>
