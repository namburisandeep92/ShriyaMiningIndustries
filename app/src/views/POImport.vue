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
      <div v-if="issues.length" class="error" role="alert">
        <strong>Correct these fields before preview or download:</strong>
        <ul><li v-for="(issue, index) in issues" :key="index">{{ issue.message }}</li></ul>
      </div>
      <fieldset v-for="group in headerGroups" :key="group.title" :disabled="busy || !canEdit">
        <legend>{{ group.title }}</legend>
        <div class="fields">
          <label v-for="key in group.fields" :key="key">
            {{ key }}
            <textarea v-if="headerDefaults[key].includes('\n')" v-model="invoice.header[key]" rows="4"
                      :aria-invalid="invalid(key)" :class="{ invalid: invalid(key) }"></textarea>
            <input v-else v-model="invoice.header[key]" :type="/date/i.test(key) ? 'date' : 'text'"
                   :inputmode="key === 'Crate starting no' ? 'numeric' : undefined"
                   :aria-invalid="invalid(key)" :class="{ invalid: invalid(key) }" />
          </label>
        </div>
      </fieldset>
      <div class="table-scroll line-scroll">
        <table class="line-table">
          <colgroup>
            <col v-for="(field, index) in lineFields" :key="field.key" :style="{ width: `${lineWidths[index]}px` }" />
            <col style="width:140px" /><col style="width:100px" />
          </colgroup>
          <thead><tr>
            <th v-for="(field, index) in lineFields" :key="field.key" :style="{ minWidth: `${lineWidths[index]}px`, width: `${lineWidths[index]}px` }">
              {{ field.label }} <span class="resize" @pointerdown.prevent="resizeColumn($event, index)" title="Drag to resize"></span>
            </th><th>Amount USD</th><th>Action</th>
          </tr></thead>
          <tbody>
            <tr v-for="(line, index) in invoice.lines" :key="index">
              <td v-for="field in lineFields" :key="field.key">
                <div v-if="field.key === 'stone'" class="stone-ref">
                  <input v-model="line.stone" :aria-label="`Line ${index + 1} Stone`" :disabled="busy || !canEdit"
                         :aria-invalid="invalid('stone', index)" :class="{ invalid: invalid('stone', index) }" />
                  <input v-model="line.ref" :aria-label="`Line ${index + 1} PO / ref`" :disabled="busy || !canEdit"
                         :aria-invalid="invalid('ref', index)" :class="{ invalid: invalid('ref', index) }" />
                </div>
                <input v-else v-model="line[field.key]" :aria-label="`Line ${index + 1} ${field.label}`"
                       :inputmode="field.numeric ? 'decimal' : undefined" :readonly="field.key === 'crt'"
                       :disabled="busy || !canEdit" :aria-invalid="invalid(field.key, index)" :class="{ invalid: invalid(field.key, index) }" />
              </td>
              <td>{{ money(lineAmount(line)) }}</td>
              <td><button :disabled="busy || !canEdit" @click="invoice.lines.splice(index, 1)">Remove</button></td>
            </tr>
          </tbody>
        </table>
      </div>
      <button :disabled="busy || !canEdit" @click="addLine">Add line</button>
      <p>Total crates: {{ totalCrates }} · {{ quantityTotal }} · Net weight: {{ totalWeight }} KGS · <strong>TOTAL USD {{ money(total) }}</strong></p>
      <label>Amount chargeable in words <input v-model="invoice.words" :disabled="busy || !canEdit" /></label>
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
        <button :disabled="busy || !!issues.length" @click="preview">Preview</button>
        <button class="btn btn-primary" :disabled="busy || !!issues.length || !canEdit || (!saved && (!vendorId || !buyerId))" @click="saveDownload">Save &amp; download</button>
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
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { onBeforeRouteLeave, useRoute } from 'vue-router'
import { apiClient, type InvoiceDocument, type InvoiceInput } from '@/services/api'
import { toastManager } from '@/services/notifications'
import { downloadBlob, printInvoice } from '@/services/invoice-download'
import {
  amountWords, buildLegacyPrintHtml, buildLegacyWorkbook, crateRanges, createLegacyInvoice, excelPreviewHtml,
  headerDefaults, headerGroups, invoiceTotal, lineAmount, validateLegacyInvoice,
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
const master = ref<{ vendors: { id: number; name: string }[]; buyers: { id: number; name: string }[] }>({ vendors: [], buyers: [] })
const vendorId = ref(0)
const buyerId = ref(0)
const canEdit = computed(() => apiClient.hasPermission(saved.value ? 'invoice.update' : 'invoice.create'))
const issues = computed(() => invoice.value ? validateLegacyInvoice(invoice.value) : [])
const invalid = (field: string, line?: number) => issues.value.some(issue => issue.field === field && issue.line === line)
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
const totalWeight = computed(() => (invoice.value?.lines || []).reduce((sum, line) => sum + (Number(line.net) || 0), 0))
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
  { key: 'uom', label: 'UOM' }, { key: 'net', label: 'Weight', numeric: true }, { key: 'rate', label: 'Rate / UOM', numeric: true },
  { key: 'kind', label: 'Goods group' },
]
const lineWidths = ref<number[]>(lineFields.map(field => field.key === 'stone' || field.key === 'ref' ? 250 : 120))
let resizing: { index: number; x: number; width: number } | undefined
function resizeColumn(event: PointerEvent, index: number) { resizing = { index, x: event.clientX, width: lineWidths.value[index] } }
function resizeMove(event: PointerEvent) { if (resizing) lineWidths.value[resizing.index] = Math.max(80, resizing.width + event.clientX - resizing.x) }
function resizeEnd() { resizing = undefined }
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
  const next = createLegacyInvoice(rows.value.filter(row => selected.value.has(row.id)), invoice.value?.lines, invoice.value?.header)
  if (invoice.value) next.header = { ...next.header, ...invoice.value.header, 'Buyer PO nos': next.header['Buyer PO nos'], 'Buyer PO date': next.header['Buyer PO date'] }
  invoice.value = next
  step.value = 3
}
function addLine() {
  invoice.value?.lines.push({ stone: '', finish: '', size: '', ref: '', crates: '', crt: '', qty: '', uom: 'SF', net: '', rate: '', kind: '' })
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
  if (!invoice.value || issues.value.length || busy.value) return
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
  hydrating = false
  vendorId.value = value.vendorId
  buyerId.value = value.buyerId
  savedJson.value = JSON.stringify(value.document)
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
async function saveDownload() {
  if (!invoice.value || issues.value.length || busy.value || !canEdit.value || (!saved.value && (!vendorId.value || !buyerId.value))) return
  busy.value = true
  error.value = ''
  try {
    const input: InvoiceInput = {
      invoiceDate: invoice.value.header['Invoice date'], vendorId: vendorId.value, buyerId: buyerId.value,
      document: invoice.value, lineItems: invoice.value.lines.map(line => ({
        description: `${line.stone} ${line.finish} ${line.size} ${line.ref}`.trim() || 'Invoice line',
        quantity: Number(line.qty), unitPrice: Number(line.rate), taxPercent: 0, unitOfMeasure: line.uom,
      })),
    }
    if (!saved.value) applySaved((await apiClient.createInvoice(input)).data)
    else if (JSON.stringify(invoice.value) !== savedJson.value) applySaved((await apiClient.updateInvoice(saved.value.id, { document: invoice.value }, saved.value.rowVersion)).data)
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
      ? `Invoice is saved, but download failed: ${message(cause)}. Retry Save & download to download it without creating another invoice.`
      : message(cause)
    toastManager.error(error.value)
  }
  finally { busy.value = false }
}
onMounted(async () => {
  window.addEventListener('pointermove', resizeMove)
  window.addEventListener('pointerup', resizeEnd)
  try { master.value = await apiClient.masterData() }
  catch (cause) { error.value = `Could not load vendor/buyer choices: ${message(cause)}`; toastManager.error(error.value) }
  if (route.query.invoice) await reload()
})
onUnmounted(() => { window.removeEventListener('pointermove', resizeMove); window.removeEventListener('pointerup', resizeEnd) })
onBeforeRouteLeave(() => !invoice.value || JSON.stringify(invoice.value) === savedJson.value || window.confirm('Leave without saving invoice changes?'))
</script>

<style scoped>
.po-flow { display: grid; grid-template-columns: minmax(0, 1fr); gap: 1rem; min-width: 0; }
.toolbar { display: flex; align-items: center; flex-wrap: wrap; gap: .75rem; }
.panel { padding: 1.5rem; background: white; border: 1px solid #c8bead; border-radius: 5px; min-width: 0; }
fieldset { border: 1px solid #c8bead; margin: 1rem 0; }
legend { color: #7a5c3e; font-weight: bold; }
.fields { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 1rem; }
label { display: grid; gap: .3rem; }
input, select, textarea { border: 1px solid #aaa; border-radius: 3px; padding: .5rem; min-width: 0; font: inherit; }
button { cursor: pointer; padding: .5rem .75rem; }
button:disabled { cursor: not-allowed; opacity: .55; }
.error { background: #f8d7da; color: #721c24; padding: 1rem; }
.invalid { border: 2px solid #c32032; background: #fff4f4; }
.table-scroll { overflow: auto; max-height: 65vh; margin: 1rem 0; }
table { border-collapse: separate; border-spacing: 0; }
th, td { border-right: 1px solid #ddd; border-bottom: 1px solid #ddd; padding: .5rem; text-align: left; }
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
.line-table { table-layout: fixed; width: max-content; }
.line-table th { position: sticky; top: 0; z-index: 2; }
.line-table th:first-child, .line-table td:first-child { position: sticky; left: 0; background: white; z-index: 1; box-shadow: 2px 0 0 #c8bead; }
.line-table th:first-child { background: #ede6da; z-index: 3; }
.stone-ref { display: grid; gap: .3rem; }
.line-table input { width: 100%; box-sizing: border-box; }
.resize { position: absolute; right: 0; top: 0; bottom: 0; width: 7px; cursor: col-resize; touch-action: none; }
.column-option { display: flex; padding: .2rem; }
.preview { width: 100%; height: 800px; border: 1px solid #c8bead; }
</style>
