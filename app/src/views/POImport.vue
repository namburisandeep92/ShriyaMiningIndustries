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
      <div class="table-scroll line-scroll">
        <table class="line-table">
          <colgroup>
            <col v-for="(field, index) in lineFields" :key="field.key" :style="{ width: `${lineWidths[index]}px` }" />
            <col style="width:200px" /><col style="width:140px" /><col style="width:100px" />
          </colgroup>
          <thead><tr>
            <th v-for="(field, index) in lineFields" :key="field.key" :style="{ minWidth: `${lineWidths[index]}px`, width: `${lineWidths[index]}px` }">
              {{ field.label }} <span class="resize" @pointerdown.prevent="resizeColumn($event, index)" title="Drag to resize"></span>
            </th><th>HSN code</th><th>Amount USD</th><th>Action</th>
          </tr></thead>
          <tbody>
            <template v-for="category in groupedLines" :key="category.name">
              <tr class="category-row">
                <th :colspan="lineFields.length + 3">
                  {{ category.name }}
                  <button v-if="category.missing.length" class="missing-count" type="button" @click="jumpToFirstMissing(category)">
                    ⚠ {{ category.missing.length }} {{ category.missing.length === 1 ? 'line needs' : 'lines need' }} HSN
                  </button>
                  <span v-else class="missing-count">All lines have HSN</span>
                  <label class="hsn-action">Fill empty lines with…
                    <input v-model="fillHsn[category.rawName]" :list="hsnListId(category.index)" :aria-label="`${category.name} fill empty HSN`"
                           :disabled="busy || !canEdit" @input="sanitizeBulkHsn(category.rawName)" @blur="sanitizeBulkHsn(category.rawName)" />
                  </label>
                  <button type="button" :disabled="busy || !canEdit || !category.missing.length || !validHsnCode(fillHsn[category.rawName])"
                          @click="fillEmptyHsn(category)">Fill</button>
                </th>
              </tr>
              <template v-for="section in category.sections" :key="section.key">
                <tr :class="section.missing ? 'needs-hsn-row' : 'hsn-group-row'">
                  <th :colspan="lineFields.length + 3">
                    <template v-if="section.missing">
                      Needs HSN ({{ section.lines.length }})
                      <label><input type="checkbox" :checked="allMissingSelected(section.lines)"
                                    :disabled="busy || !canEdit" @change="toggleMissingSelection(section.lines)" /> Select all</label>
                      <label class="hsn-action">Set HSN…
                        <input v-model="bulkHsn[category.rawName]" :list="hsnListId(category.index)" :aria-label="`${category.name} set HSN`"
                               :disabled="busy || !canEdit" @input="sanitizeBulkHsn(category.rawName)" @blur="sanitizeBulkHsn(category.rawName)" />
                      </label>
                      <button type="button" :disabled="busy || !canEdit || !selectedMissingCount(section.lines) || !validHsnCode(bulkHsn[category.rawName])"
                              @click="setSelectedHsn(category)">Set HSN</button>
                    </template>
                    <template v-else>HSN {{ section.code }}</template>
                  </th>
                </tr>
                <tr v-for="entry in section.lines" :key="entry.line.src || entry.index">
                  <td v-for="field in lineFields" :key="field.key">
                    <div v-if="field.key === 'stone'" class="stone-ref">
                      <input v-model="entry.line.stone" :aria-label="`Line ${entry.index + 1} Stone`" :disabled="busy || !canEdit"
                             :data-validation-key="`line:${entry.index}:stone`" :aria-invalid="invalid('stone', entry.index)"
                             :class="{ invalid: invalid('stone', entry.index) }" @blur="touch('stone', entry.index)" />
                      <input v-model="entry.line.ref" :aria-label="`Line ${entry.index + 1} PO / ref`" :disabled="busy || !canEdit"
                             :data-validation-key="`line:${entry.index}:ref`" :aria-invalid="invalid('ref', entry.index)"
                             :class="{ invalid: invalid('ref', entry.index) }" @blur="touch('ref', entry.index)" />
                    </div>
                    <template v-else>
                      <input v-model="entry.line[field.key]" :aria-label="`Line ${entry.index + 1} ${field.label}`"
                             :inputmode="field.numeric ? 'decimal' : undefined" :readonly="field.key === 'crt'"
                             :disabled="busy || !canEdit" :data-validation-key="`line:${entry.index}:${field.key}`"
                             :aria-invalid="invalid(field.key, entry.index)" :class="{ invalid: invalid(field.key, entry.index) }"
                             @blur="touch(field.key, entry.index)" />
                      <small v-if="fieldIssue(field.key, entry.index)" class="field-error" role="alert">
                        {{ fieldIssue(field.key, entry.index) }}
                      </small>
                    </template>
                  </td>
                  <td class="hsn-cell">
                    <input v-if="section.missing" type="checkbox" :aria-label="`Select line ${entry.index + 1} for HSN assignment`"
                           :checked="selectedMissing.has(entry.index)" :disabled="busy || !canEdit"
                           @change="toggleMissingLine(entry.index)" />
                        <input :value="hsnDrafts[entry.index] ?? entry.line.hsnCode" :list="hsnListId(category.index)"
                               :aria-label="`Line ${entry.index + 1} HSN code`"
                               :disabled="busy || !canEdit" :data-validation-key="`line:${entry.index}:hsn`"
                               :aria-invalid="invalid('hsn', entry.index)" :class="{ invalid: invalid('hsn', entry.index) }"
                               @input="updateLineHsnDraft(entry.index, $event)"
                               @blur="sanitizeLineHsn(entry.index); touch('hsn', entry.index)" />
                    <small v-if="fieldIssue('hsn', entry.index)" class="field-error" role="alert">{{ fieldIssue('hsn', entry.index) }}</small>
                    <button type="button" :disabled="busy || !canEdit || !previousHsn(entry.index)"
                            @click="copyPreviousHsn(entry.index)">Same as above</button>
                  </td>
                  <td>{{ money(lineAmount(entry.line)) }}</td>
                  <td><button :disabled="busy || !canEdit" @click="invoice.lines.splice(entry.index, 1)">Remove</button></td>
                </tr>
              </template>
            </template>
          </tbody>
        </table>
        <datalist v-for="category in groupedLines" :key="`hsn-list-${category.index}`" :id="hsnListId(category.index)">
          <option v-for="code in category.knownCodes" :key="code" :value="code" />
        </datalist>
      </div>
      <button data-validation-key="header:lines" :disabled="busy || !canEdit" @click="addLine">Add line</button>
      <p>Total crates: {{ totalCrates }} · {{ quantityTotal }} · Gross weight: {{ totalGrossWeight }} KGS · Net weight: {{ totalWeight }} KGS · <strong>TOTAL USD {{ money(total) }}</strong></p>
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
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { onBeforeRouteLeave, useRoute } from 'vue-router'
import { apiClient, type InvoiceDocument, type InvoiceInput } from '@/services/api'
import { toastManager } from '@/services/notifications'
import { downloadBlob, printInvoice } from '@/services/invoice-download'
import {
  amountWords, buildLegacyPrintHtml, buildLegacyWorkbook, cleanHsnCode, crateRanges, createLegacyInvoice, excelPreviewHtml,
  groupedLinesByHsn, headerDefaults, headerGroups, invoiceTotal, lineAmount, validHsnCode, validateLegacyInvoice,
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
const selectedMissing = ref(new Set<number>())
const bulkHsn = ref<Record<string, string>>({})
const fillHsn = ref<Record<string, string>>({})
const hsnDrafts = ref<Record<number, string>>({})
interface HsnMemory { skuCodes: Record<string, string>; categoryCodes: Record<string, string[]> }
const hsnMemory = ref<HsnMemory>({ skuCodes: {}, categoryCodes: {} })
const master = ref<{ vendors: { id: number; name: string }[]; buyers: { id: number; name: string }[] }>({ vendors: [], buyers: [] })
const vendorId = ref(0)
const buyerId = ref(0)
const canEdit = computed(() => apiClient.hasPermission(saved.value ? 'invoice.update' : 'invoice.create'))
const issues = computed(() => invoice.value ? validateLegacyInvoice(invoice.value) : [])
const issueKey = (field: string, line?: number) => line === undefined ? `header:${field}` : `line:${line}:${field}`
const visibleIssues = computed(() => issues.value.filter(issue => validationAttempted.value || touchedFields.value.has(issueKey(issue.field, issue.line))))
const invalid = (field: string, line?: number) => visibleIssues.value.some(issue => issue.field === field && issue.line === line)
const fieldIssue = (field: string, line?: number) => visibleIssues.value.find(issue => issue.field === field && issue.line === line)?.message
const summaryMessages = computed(() => {
  if (!validationAttempted.value) return []
  const missingByCategory = new Map<string, number>()
  const other = issues.value.filter(issue => {
    if (issue.field !== 'hsn' || issue.line === undefined) return true
    const category = String(invoice.value?.lines[issue.line]?.kind || 'Other')
    missingByCategory.set(category, (missingByCategory.get(category) || 0) + 1)
    return false
  }).map(issue => issue.message)
  return [...other, ...[...missingByCategory].map(([category, count]) => `${count} ${count === 1 ? 'line' : 'lines'} in ${category} ${count === 1 ? 'needs' : 'need'} an HSN code`)]
})
const groupedLines = computed(() => {
  const document = invoice.value
  if (!document) return []
  const invoiceCodes = document.lines.map(line => cleanHsnCode(line.hsnCode))
  return groupedLinesByHsn(document.lines, document).map((category, index) => {
    const lines = category.codes.flatMap(group => group.lines)
    const missing = lines.filter(entry => !cleanHsnCode(entry.line.hsnCode))
    const sections = category.codes.filter(group => group.code).map(group => ({
      key: `${category.category}:${group.code}`, code: group.code, missing: false, lines: group.lines,
    }))
    if (missing.length) sections.push({ key: `${category.category}:missing`, code: '', missing: true, lines: missing })
    const knownCodes = [...new Set([
      ...(hsnMemory.value.categoryCodes[category.category] || []),
      ...(document.knownHsnCodes?.[category.category] || []),
      ...invoiceCodes,
      ...lines.map(entry => cleanHsnCode(entry.line.hsnCode)),
    ].map(cleanHsnCode).filter(Boolean))]
    return { name: category.category || 'Uncategorized', rawName: category.category, index, sections, missing, knownCodes }
  })
})
const hsnListId = (index: number) => `hsn-options-${index}`
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
const totalGrossWeight = computed(() => (invoice.value?.lines || []).reduce((sum, line) => sum + (Number(line.gross) || 0), 0))
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
  { key: 'uom', label: 'UOM' }, { key: 'net', label: 'Net weight', numeric: true }, { key: 'gross', label: 'Gross weight', numeric: true },
  { key: 'rate', label: 'Rate / UOM', numeric: true },
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
const hsnMemoryKey = 'smi_hsn_memory_v2'
const oldHsnCodesKey = 'smi_last_hsn_codes_v1'
function readHsnMemory(): HsnMemory {
  try {
    const stored = window.localStorage.getItem(hsnMemoryKey)
    if (stored) {
      const parsed: unknown = JSON.parse(stored)
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Stored HSN memory has an invalid format')
      const value = parsed as Partial<HsnMemory>
      const skuCodes = value.skuCodes && typeof value.skuCodes === 'object' && !Array.isArray(value.skuCodes) ? value.skuCodes : {}
      const categoryCodes = value.categoryCodes && typeof value.categoryCodes === 'object' && !Array.isArray(value.categoryCodes) ? value.categoryCodes : {}
      return {
        skuCodes: Object.fromEntries(Object.entries(skuCodes).map(([sku, code]) => [sku, cleanHsnCode(code)]).filter(([, code]) => code)),
        categoryCodes: Object.fromEntries(Object.entries(categoryCodes).map(([category, codes]) => [
          category, [...new Set((Array.isArray(codes) ? codes : []).map(cleanHsnCode).filter(Boolean))],
        ])),
      }
    }
    const old = window.localStorage.getItem(oldHsnCodesKey)
    if (!old) return { skuCodes: {}, categoryCodes: {} }
    const parsed: unknown = JSON.parse(old)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Stored HSN codes have an invalid format')
    return {
      skuCodes: {},
      categoryCodes: Object.fromEntries(Object.entries(parsed).map(([category, code]) => [category, [cleanHsnCode(code)]])
        .filter(([, codes]) => codes[0])),
    }
  } catch (cause) {
    error.value = `Could not load remembered HSN codes: ${message(cause)}`
    return { skuCodes: {}, categoryCodes: {} }
  }
}
function touch(field: string, line?: number) {
  const updated = new Set(touchedFields.value)
  updated.add(issueKey(field, line))
  touchedFields.value = updated
}
function sanitizeLineHsn(index: number) {
  const line = invoice.value?.lines[index]
  if (!line) return
  const draft = hsnDrafts.value[index]
  line.hsnCode = cleanHsnCode(draft === undefined ? line.hsnCode : draft)
  const drafts = { ...hsnDrafts.value }
  delete drafts[index]
  hsnDrafts.value = drafts
}
function updateLineHsnDraft(index: number, event: Event) {
  const input = event.target
  if (input instanceof HTMLInputElement) hsnDrafts.value[index] = cleanHsnCode(input.value)
}
function sanitizeBulkHsn(category: string) {
  bulkHsn.value[category] = cleanHsnCode(bulkHsn.value[category])
  fillHsn.value[category] = cleanHsnCode(fillHsn.value[category])
}
function toggleMissingLine(index: number) {
  const updated = new Set(selectedMissing.value)
  updated.has(index) ? updated.delete(index) : updated.add(index)
  selectedMissing.value = updated
}
function allMissingSelected(lines: { index: number }[]) {
  return !!lines.length && lines.every(({ index }) => selectedMissing.value.has(index))
}
function selectedMissingCount(lines: { index: number }[]) {
  return lines.filter(({ index }) => selectedMissing.value.has(index)).length
}
function toggleMissingSelection(lines: { index: number }[]) {
  const updated = new Set(selectedMissing.value)
  const shouldSelect = !allMissingSelected(lines)
  lines.forEach(({ index }) => shouldSelect ? updated.add(index) : updated.delete(index))
  selectedMissing.value = updated
}
function setSelectedHsn(category: { rawName: string; missing: { index: number }[] }) {
  if (!invoice.value) return
  const code = cleanHsnCode(bulkHsn.value[category.rawName])
  if (!code) return
  category.missing.filter(({ index }) => selectedMissing.value.has(index))
    .forEach(({ index }) => { invoice.value!.lines[index].hsnCode = code })
  const updatedSelection = new Set(selectedMissing.value)
  category.missing.forEach(({ index }) => updatedSelection.delete(index))
  selectedMissing.value = updatedSelection
}
function fillEmptyHsn(category: { rawName: string; missing: { index: number }[] }) {
  if (!invoice.value) return
  const code = cleanHsnCode(fillHsn.value[category.rawName])
  if (!code) return
  category.missing.forEach(({ index }) => { invoice.value!.lines[index].hsnCode = code })
}
function previousHsn(index: number) {
  return cleanHsnCode(invoice.value?.lines[index - 1]?.hsnCode)
}
function copyPreviousHsn(index: number) {
  if (invoice.value && previousHsn(index)) {
    invoice.value.lines[index].hsnCode = previousHsn(index)
    const drafts = { ...hsnDrafts.value }
    delete drafts[index]
    hsnDrafts.value = drafts
  }
}
function jumpToFirstMissing(category: { missing: { index: number }[] }) {
  const first = category.missing[0]
  if (!first) return
  document.querySelectorAll<HTMLElement>('[data-validation-key]')
    .forEach(element => {
      if (element.dataset.validationKey === `line:${first.index}:hsn`) {
        element.focus()
        element.scrollIntoView({ block: 'center', behavior: 'smooth' })
      }
    })
}
function hsnMemoryForDocument(document: LegacyDocument): HsnMemory {
  const memory: HsnMemory = {
    skuCodes: { ...hsnMemory.value.skuCodes },
    categoryCodes: Object.fromEntries(Object.entries(hsnMemory.value.categoryCodes).map(([category, codes]) => [category, [...codes]])),
  }
  document.knownHsnCodes ||= {}
  for (const line of document.lines) {
    const code = cleanHsnCode(line.hsnCode)
    line.hsnCode = code
    if (!code) continue
    const category = line.kind || ''
    const known = new Set([
      ...(memory.categoryCodes[category] || []),
      ...(document.knownHsnCodes[category] || []),
      code,
    ].map(cleanHsnCode).filter(Boolean))
    memory.categoryCodes[category] = [...known]
    document.knownHsnCodes[category] = [...known]
    if (line.sku) memory.skuCodes[line.sku] = code
  }
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
  hsnDrafts.value = {}
}
async function validateForAction() {
  if (!invoice.value) return false
  invoice.value.lines.forEach((line, index) => sanitizeLineHsn(index))
  validationAttempted.value = true
  if (!issues.value.length) return true
  await nextTick()
  const first = issues.value[0]
  const key = first.line === undefined ? `header:${first.field}` : `line:${first.line}:${first.field}`
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
  hsnMemoryForDocument(next)
  invoice.value = next
  selectedMissing.value = new Set()
  bulkHsn.value = {}
  fillHsn.value = {}
  resetValidation()
  step.value = 3
}
function addLine() {
  invoice.value?.lines.push({ stone: '', finish: '', size: '', ref: '', crates: '', crt: '', qty: '', uom: 'SF', net: '', gross: '', rate: '', kind: '', hsnCode: '', sku: '' })
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
  const documentWithLegacyCodes = invoice.value as LegacyDocument & { hsnCodes?: Record<string, string> }
  for (const line of invoice.value.lines) {
    line.hsnCode = cleanHsnCode(line.hsnCode || documentWithLegacyCodes.hsnCodes?.[line.kind])
    line.sku ||= ''
  }
  delete documentWithLegacyCodes.hsnCodes
  invoice.value.knownHsnCodes ||= {}
  for (const [category, codes] of Object.entries(invoice.value.knownHsnCodes)) {
    invoice.value.knownHsnCodes[category] = [...new Set((Array.isArray(codes) ? codes : []).map(cleanHsnCode).filter(Boolean))]
  }
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
.error { background: #f2e2da; color: #7e3a24; padding: 1rem; }
.missing-count { margin-left: 1rem; color: #7e3a24; }
.hsn-action { display: inline-flex; align-items: center; gap: .35rem; margin-left: 1rem; }
.hsn-action input { width: 10rem; }
.category-row th { background: #e4d3bd; color: #60442f; }
.hsn-group-row th, .needs-hsn-row th { background: #f7f3ee; color: #7a5c3e; }
.hsn-group-row th { padding-left: 1.5rem; }
.needs-hsn-row label { display: inline-flex; align-items: center; gap: .35rem; margin-left: 1rem; }
.hsn-cell { display: grid; grid-template-columns: auto minmax(7rem, 1fr); align-items: center; gap: .3rem; }
.hsn-cell input[type="checkbox"], .needs-hsn-row input[type="checkbox"] { width: auto; }
.hsn-cell small, .hsn-cell button { grid-column: 2; }
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
