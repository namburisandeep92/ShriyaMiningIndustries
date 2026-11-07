import type { Workbook } from 'exceljs';
export interface LegacyLine {
  stone: string; finish: string; size: string; ref: string; crates: string | number;
  crt: string; qty: string | number; uom: string; net: string | number;
  rate: string | number; kind: string; src?: string; code?: string;
  poQty?: number; poUom?: string; gross?: string | number;
}
export interface LegacyDocument { header: Record<string, string>; lines: LegacyLine[]; words: string }
export interface PORow {
  id: number; key: string; raw: Record<string, string>; all: string; item: string;
  sku: string; po: string; date: string; so: string; qty: number; uom: string;
}
export interface ValidationIssue { field: string; line?: number; message: string }
export const headerDefaults: Record<string, string>;
export const headerGroups: { title: string; fields: string[] }[];
export function lineAmount(line: LegacyLine): number;
export function invoiceTotal(lines: LegacyLine[]): number;
export function amountWords(total: number): string;
export function crateRanges(lines: LegacyLine[], start: string): string[];
export function validateLegacyInvoice(document: LegacyDocument): ValidationIssue[];
export function createLegacyInvoice(rows: PORow[], previousLines?: LegacyLine[], previousHeader?: Record<string, string>): LegacyDocument;
export function parseItem(row: { item: string }): { stone: string; size: string; finish: string; code: string; kind: string; area: number };
export function buildLegacyWorkbook(document: LegacyDocument): Promise<Workbook>;
export function buildLegacyPrintHtml(document: LegacyDocument, title: string): string;
export function excelPreviewHtml(workbook: Workbook, title: string): string;
