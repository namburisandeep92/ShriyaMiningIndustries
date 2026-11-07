---
description: "Implement mandatory PO Item IDs, saved PO selection, invoice reservations and partial shipment fulfillment when this deferred feature is explicitly requested."
agent: "agent"
---

Implement permanent PO item identity and invoice fulfillment tracking in this
repository. This feature was deferred; the presence of this prompt does not
authorize implementation or deployment. Execute it only when explicitly invoked
for development. Do not push or deploy without separate explicit approval.

## Confirmed requirements

- Require a `PO Item ID` column during upload. Each nonempty row must have an ID.
  Identity validation is the intentional exception to the current rule that
  invoice field validation occurs during review/save, not upload.
- Treat the supplied ID as permanent identity, not an ID generated on each upload.
  Do not include quantity, file name or row position in its identity.
- Show rows whose IDs already exist, disable their selection checkboxes, and show
  `PO Item ID exists`. Do not overwrite the existing PO record or its baseline.
- Provide a saved PO list where existing items with remaining quantity can be
  selected for subsequent partial invoices. Disabling duplicates in the upload
  table must not prevent partial fulfillment through this saved list.
- Use the first uploaded pending quantity as the tracking baseline. Clearly label
  this as fulfillment tracked from first import, not historical original order
  fulfillment. Never reset it when a pending-order file is reuploaded.
- Saving a Draft, In Review or Approved invoice reserves its linked quantities.
  Marking an invoice Shipped converts its reservation into fulfilled quantity.
  Do not count both reservation and fulfillment for the same invoice.
- Invoice edits atomically adjust reservations. Deleting a draft releases its
  reservation. Define safe handling for deletion/edit of shipped invoices before
  permitting these operations; do not silently erase shipment history.
- Block saving if aggregate reserved plus fulfilled quantity would exceed the
  baseline. Apply this invariant transactionally for concurrent saves and edits,
  accounting for the current invoice's allocation when editing.
- Preserve the link between each PO item and each invoice line, supporting one
  PO item across multiple invoices. Preserve links in invoice version snapshots.
- Show baseline, reserved, shipped/fulfilled and available quantities, together
  with linked invoice numbers/statuses and partial/complete fulfillment state.
- Do not silently combine incompatible units. Enforce the source UOM or require
  an explicitly approved conversion.

## Decisions to clarify before implementation

- ID format, maximum length, case sensitivity and whether uniqueness is global
  or scoped by supplier. Do not infer these from the numeric row index.
- How to handle duplicate IDs within one upload and simultaneous uploads.
  Recommend disabling ambiguous rows with explicit notices, never silently merging.
- Where a new, incomplete upload becomes a persisted PO record: quantity/UOM can
  be corrected during review before establishing the baseline. Retain the existing
  no-invoice-validation-on-upload UX.
- How to migrate existing invoices whose source rows have no supplied PO Item ID.
  Never invent authoritative historical links or mark them fulfilled automatically.
- Saved-list permissions, pagination/filtering and visibility.

## Existing surfaces to investigate and extend

- [PO parser](../../api/services/pending-orders.js): currently returns an ephemeral
  row `id` and a `key` containing PO/SKU/SO/quantity/occurrence. Neither is permanent.
- [Legacy invoice model](../../api/services/legacy-invoice.js) and
  [types](../../api/services/legacy-invoice.d.ts): currently retain `src`, `poQty`
  and `poUom` in the complete document.
- [PO handlers](../../api/functions/po-import.js),
  [invoice CRUD](../../api/functions/invoice-crud.js),
  [contracts](../../api/services/api-contracts.js) and
  [routes](../../api/server.js).
- [PO editor](../../app/src/views/POImport.vue) and
  [typed API client](../../app/src/services/api.ts).
- [Schema](../../database/migrations/V001__schemas.sql): `sales.POLine` already has
  an internal UUID but is tied to an import batch; inspect reuse before adding
  structures. Never edit an applied versioned migration.
- [Platform procedures](../../database/migrations/R__platform-procedures.sql):
  invoice CRUD and immutable snapshots are transactional. Use additive migrations,
  foreign keys, unique constraints and transaction-safe allocation enforcement.
- [Legacy reference](../../legacy/Invoice_Generator.html): keep the current
  selection, editing, freezes, crate calculations, validation and output behavior.
  Its fulfillment/ledger features are disabled, so do not enable them as a shortcut.

## Acceptance tests

1. Missing/blank IDs produce explicit identity errors; incomplete invoice values
   can still be reviewed and corrected at the appropriate stage.
2. Existing uploaded IDs remain visible and unselectable, with the required notice.
   Existing PO baseline and invoice links survive reuploads and row reorderings.
3. From a saved PO item with baseline 100: save a draft for 40, show reserved 40,
   fulfilled 0 and available 60. Ship it: reserved 0, fulfilled 40, available 60.
   Save/ship another invoice for 60: fulfilled 100, available 0, complete.
4. Reject an allocation for 61 while 40 is reserved/fulfilled against 100.
   Two concurrent requests must not bypass the limit.
5. Edit a draft from 40 to 30 and verify available becomes 70; delete it and verify
   its reservation is released. Stale row versions remain 409 conflicts.
6. Changed UOM, invalid links, unknown IDs and forged baseline quantities are
   rejected server-side. Manual invoice lines follow explicitly documented rules.
7. Historical snapshots retain the original IDs and allocations; existing
   invoices/data/roles remain intact after migrations.
8. Run browser upload/duplicate handling/saved selection/partial invoice flows,
   targeted API/model tests and guarded real Test SQL transaction tests.
   Never create production fixture data.

Report implemented changes, schema/API contracts, intentional UX differences,
test results and outstanding decisions. Leave deployment awaiting user approval.
