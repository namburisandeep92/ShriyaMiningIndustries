import axios, { AxiosInstance, AxiosError, AxiosResponse } from 'axios'
import { ref } from 'vue'

export interface ApiError {
  statusCode: number
  message: string
  code?: string
  details?: unknown
}

interface ErrorResponse { error?: { message?: string; code?: string } }
export interface InvoiceLine {
  description: string
  quantity: number
  unitPrice: number
  taxPercent: number
  unitOfMeasure?: string
}
export interface InvoiceInput {
  invoiceDate: string
  vendorId: number
  buyerId: number
  poNumber?: string
  notes?: string
  lineItems: InvoiceLine[]
}
export interface InvoiceDocument extends Omit<InvoiceInput, 'poNumber' | 'notes'> {
  id: string
  invoiceId: string
  invoiceNumber: string
  poNumber: string | null
  notes: string | null
  vendorName: string
  buyerName: string
  status: 'draft' | 'in review' | 'approved' | 'shipped'
  version: number
  rowVersion: string
  totalAmount: number
  totals: { subtotal: number; tax: number; total: number }
  createdAt: string
  modifiedAt: string
}
export interface InvoiceVersion { version: number; modifiedAt: string; modifiedBy: string }
export interface UserRecord { id: string; email: string; roles: string[]; role: string; createdAt: string }
export interface ErrorLogRecord {
  id: number; timestamp: string; severity: string; message: string; endpoint: string; stack: string; context: unknown
}
export interface POImportRecord {
  importId: string; poNumber: string; rowsImported: number; status: string
}
export interface POImportResult extends POImportRecord { itemsCount: number }
type QueryParams = Record<string, string | number | undefined>

export interface AuthContext {
  userId?: string
  email?: string
  roles?: string[]
  permissions?: string[]
}

class ApiClient {
  private instance: AxiosInstance
  private authContext = ref<AuthContext | null>(null)
  private correlationId: string = ''

  constructor() {
    const baseURL = import.meta.env.VITE_API_BASE_URL || '/api'
    
    this.instance = axios.create({
      baseURL,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    })

    // Request interceptor to add correlation ID and auth headers
    this.instance.interceptors.request.use((config) => {
      this.correlationId = crypto.randomUUID()
      config.headers['X-Correlation-ID'] = this.correlationId

      // Add auth principal from SWA (x-ms-client-principal)
      const principal = this.getPrincipalFromCookie()
      if (principal) {
        config.headers['X-MS-Client-Principal'] = principal
      }

      return config
    })

    // Response interceptor for error handling
    this.instance.interceptors.response.use(
      (response) => response,
      (error: AxiosError<ErrorResponse>) => {
        const apiError: ApiError = {
          statusCode: error.response?.status || 500,
          message: error.response?.data?.error?.message || error.message,
          code: error.response?.data?.error?.code,
          details: error.response?.data,
        }

        // Handle 401 Unauthorized
        if (error.response?.status === 401) {
          window.location.href = '/.auth/login/aad?post_login_redirect_uri=/'
          return Promise.reject(apiError)
        }

        // Handle 403 Forbidden
        if (error.response?.status === 403) {
          window.dispatchEvent(
            new CustomEvent('api:forbidden', { detail: apiError })
          )
        }

        return Promise.reject(apiError)
      }
    )
  }

  private getPrincipalFromCookie(): string | null {
    // In SWA, the principal is available via x-ms-client-principal header
    // or from document.cookie (injected by SWA runtime)
    // For local dev, this can be mocked
    return null
  }

  setAuthContext(context: AuthContext) {
    this.authContext.value = context
  }

  getAuthContext() {
    return this.authContext.value
  }

  async refreshAuthContext(): Promise<void> {
    this.authContext.value = null
    const response = await this.instance.get<{ authenticated: boolean; user: AuthContext | null }>('/me')
    this.authContext.value = response.data.authenticated ? response.data.user : null
  }

  hasPermission(permission: string): boolean {
    return this.authContext.value?.permissions?.includes(permission) ?? false
  }

  // ========== PO Import ==========
  async uploadPO(file: File, vendorId: number, poNumber: string): Promise<AxiosResponse<POImportResult>> {
    const encoded = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result).split(',')[1])
      reader.onerror = () => reject(reader.error || new Error('Failed to read PO file'))
      reader.readAsDataURL(file)
    })
    return this.instance.post('/po-import', { file: encoded, fileName: file.name, vendorId, poNumber })
  }

  async masterData(): Promise<{ vendors: { id: number; name: string }[]; buyers: { id: number; name: string }[] }> {
    return (await this.instance.get('/master-data')).data
  }

  async listPOImports(): Promise<AxiosResponse<{ imports: POImportRecord[]; total: number }>> {
    return this.instance.get('/po-import')
  }

  // ========== Invoice CRUD ==========
  async createInvoice(data: InvoiceInput): Promise<AxiosResponse<InvoiceDocument>> {
    return this.instance.post('/invoices', data)
  }

  async listInvoices(params?: QueryParams): Promise<AxiosResponse<{ invoices: InvoiceDocument[]; total: number }>> {
    return this.instance.get('/invoices', { params })
  }

  async getInvoice(id: string): Promise<AxiosResponse<InvoiceDocument>> {
    return this.instance.get(`/invoices/${id}`)
  }

  async updateInvoice(id: string, data: Partial<InvoiceInput> & { status?: string }, rowVersion?: string): Promise<AxiosResponse<InvoiceDocument>> {
    const headers = rowVersion ? { 'X-Row-Version': rowVersion } : {}
    return this.instance.patch(`/invoices/${id}`, data, { headers })
  }

  async deleteInvoice(id: string): Promise<any> {
    return this.instance.delete(`/invoices/${id}`)
  }

  // ========== Invoice Export ==========
  async exportInvoiceAsExcel(id: string): Promise<Blob> {
    const response = await this.instance.get(`/invoices/${id}/export`, {
      params: { format: 'excel' },
      responseType: 'blob',
    })
    return response.data
  }

  async exportInvoiceAsPdf(id: string): Promise<Blob> {
    const response = await this.instance.get(`/invoices/${id}/export`, {
      params: { format: 'pdf' },
      responseType: 'blob',
    })
    return response.data
  }

  // ========== Invoice History ==========
  async getInvoiceHistory(id: string): Promise<AxiosResponse<{ versions: InvoiceVersion[] }>> {
    return this.instance.get(`/invoices/${id}/history`)
  }

  async compareInvoiceVersions(id: string, version1: number, version2: number): Promise<AxiosResponse<{ changes: { field: string; before: unknown; after: unknown }[] }>> {
    return this.instance.get(`/invoices/${id}/history/compare`, {
      params: { v1: version1, v2: version2 },
    })
  }

  // ========== Admin ==========
  async listUsers(params?: QueryParams): Promise<AxiosResponse<{ users: UserRecord[]; total: number }>> {
    return this.instance.get('/admin/users', { params })
  }

  async listRoles(): Promise<{ name: string }[]> {
    return (await this.instance.get('/admin/roles')).data.roles
  }

  async createUser(data: { email: string; role: string }): Promise<AxiosResponse<UserRecord>> {
    return this.instance.post('/admin/users', data)
  }

  async deleteUser(id: string): Promise<any> {
    return this.instance.delete(`/admin/users/${id}`)
  }

  async searchErrorLogs(params?: QueryParams): Promise<AxiosResponse<{ errors: ErrorLogRecord[]; total: number }>> {
    return this.instance.get('/admin/error-log', { params })
  }

  // ========== Health Check ==========
  async healthCheck(): Promise<any> {
    return this.instance.get('/health')
  }
}

export const apiClient = new ApiClient()
