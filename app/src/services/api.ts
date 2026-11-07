import axios, { AxiosInstance, AxiosError } from 'axios'
import { ref } from 'vue'

export interface ApiError {
  statusCode: number
  message: string
  code?: string
  details?: any
}

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
      this.correlationId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
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
      (error: AxiosError) => {
        const apiError: ApiError = {
          statusCode: error.response?.status || 500,
          message: error.message,
          code: (error.response?.data as any)?.code,
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
  async uploadPO(file: File): Promise<any> {
    const formData = new FormData()
    formData.append('file', file)

    return this.instance.post('/po/import', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    })
  }

  // ========== Invoice CRUD ==========
  async createInvoice(data: any): Promise<any> {
    return this.instance.post('/invoices', data)
  }

  async listInvoices(params?: any): Promise<any> {
    return this.instance.get('/invoices', { params })
  }

  async getInvoice(id: string): Promise<any> {
    return this.instance.get(`/invoices/${id}`)
  }

  async updateInvoice(id: string, data: any, rowVersion?: string): Promise<any> {
    const headers = rowVersion ? { 'X-Row-Version': rowVersion } : {}
    return this.instance.put(`/invoices/${id}`, data, { headers })
  }

  async deleteInvoice(id: string): Promise<any> {
    return this.instance.delete(`/invoices/${id}`)
  }

  // ========== Invoice Export ==========
  async exportInvoiceAsExcel(id: string): Promise<Blob> {
    const response = await this.instance.get(`/invoices/${id}/export/excel`, {
      responseType: 'blob',
    })
    return response.data
  }

  async exportInvoiceAsPdf(id: string): Promise<Blob> {
    const response = await this.instance.get(`/invoices/${id}/export/pdf`, {
      responseType: 'blob',
    })
    return response.data
  }

  // ========== Invoice History ==========
  async getInvoiceHistory(id: string): Promise<any> {
    return this.instance.get(`/invoices/${id}/history`)
  }

  async compareInvoiceVersions(id: string, version1: number, version2: number): Promise<any> {
    return this.instance.get(`/invoices/${id}/history/compare`, {
      params: { v1: version1, v2: version2 },
    })
  }

  // ========== Admin ==========
  async listUsers(): Promise<any> {
    return this.instance.get('/admin/users')
  }

  async createUser(data: any): Promise<any> {
    return this.instance.post('/admin/users', data)
  }

  async updateUser(id: string, data: any): Promise<any> {
    return this.instance.put(`/admin/users/${id}`, data)
  }

  async deleteUser(id: string): Promise<any> {
    return this.instance.delete(`/admin/users/${id}`)
  }

  async searchErrorLogs(params?: any): Promise<any> {
    return this.instance.get('/admin/errors', { params })
  }

  // ========== Health Check ==========
  async healthCheck(): Promise<any> {
    return this.instance.get('/health')
  }
}

export const apiClient = new ApiClient()
