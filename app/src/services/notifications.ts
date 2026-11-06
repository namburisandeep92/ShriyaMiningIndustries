import { ref, Ref } from 'vue'

export interface Toast {
  id: string
  message: string
  type: 'success' | 'error' | 'warning' | 'info'
  duration: number
}

class ToastManager {
  private toasts = ref<Toast[]>([])
  private toastCounter = 0

  getToasts(): Ref<Toast[]> {
    return this.toasts
  }

  add(message: string, type: 'success' | 'error' | 'warning' | 'info' = 'info', duration: number = 5000) {
    const id = `toast-${++this.toastCounter}`
    const toast: Toast = { id, message, type, duration }
    this.toasts.value.push(toast)

    if (duration > 0) {
      setTimeout(() => {
        this.remove(id)
      }, duration)
    }

    return id
  }

  remove(id: string) {
    const index = this.toasts.value.findIndex((t) => t.id === id)
    if (index >= 0) {
      this.toasts.value.splice(index, 1)
    }
  }

  success(message: string, duration?: number) {
    return this.add(message, 'success', duration)
  }

  error(message: string, duration?: number) {
    return this.add(message, 'error', duration ?? 8000)
  }

  warning(message: string, duration?: number) {
    return this.add(message, 'warning', duration ?? 6000)
  }

  info(message: string, duration?: number) {
    return this.add(message, 'info', duration)
  }
}

export const toastManager = new ToastManager()

export class GlobalErrorHandler {
  static setup() {
    // Handle uncaught promise rejections
    window.addEventListener('unhandledrejection', (event) => {
      console.error('Unhandled promise rejection:', event.reason)
      toastManager.error(
        event.reason?.message || 'An unexpected error occurred'
      )
      event.preventDefault()
    })

    // Handle global errors
    window.addEventListener('error', (event) => {
      console.error('Global error:', event.error)
      toastManager.error(event.error?.message || 'An unexpected error occurred')
    })

    // Handle API forbidden events
    window.addEventListener('api:forbidden', (event: any) => {
      console.warn('Access forbidden:', event.detail)
      toastManager.warning('You do not have permission to perform this action')
    })
  }
}
