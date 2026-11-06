import { ref, Ref } from 'vue'
import { apiClient, ApiError } from '@/services/api'

export interface UseAsyncState<T> {
  data: Ref<T | null>
  loading: Ref<boolean>
  error: Ref<ApiError | null>
  execute: () => Promise<void>
}

export function useAsync<T>(
  fn: () => Promise<T>,
  immediate: boolean = true
): UseAsyncState<T> {
  const data = ref<T | null>(null)
  const loading = ref(false)
  const error = ref<ApiError | null>(null)

  const execute = async () => {
    loading.value = true
    error.value = null
    try {
      data.value = await fn()
    } catch (err: any) {
      error.value = err
    } finally {
      loading.value = false
    }
  }

  if (immediate) {
    execute()
  }

  return { data, loading, error, execute }
}

export interface UseFormState<T> {
  form: Ref<T>
  isDirty: Ref<boolean>
  isSubmitting: Ref<boolean>
  error: Ref<ApiError | null>
  resetForm: () => void
  markDirty: () => void
  submit: (submitFn: (data: T) => Promise<any>) => Promise<void>
}

export function useForm<T>(initialValues: T): UseFormState<T> {
  const form = ref<T>({ ...initialValues })
  const isDirty = ref(false)
  const isSubmitting = ref(false)
  const error = ref<ApiError | null>(null)

  const resetForm = () => {
    form.value = { ...initialValues }
    isDirty.value = false
    error.value = null
  }

  const markDirty = () => {
    isDirty.value = true
  }

  const submit = async (submitFn: (data: T) => Promise<any>) => {
    isSubmitting.value = true
    error.value = null
    try {
      await submitFn(form.value)
      resetForm()
    } catch (err: any) {
      error.value = err
    } finally {
      isSubmitting.value = false
    }
  }

  return { form, isDirty, isSubmitting, error, resetForm, markDirty, submit }
}

export interface UsePaginationState<T> {
  items: Ref<T[]>
  page: Ref<number>
  pageSize: Ref<number>
  total: Ref<number>
  loading: Ref<boolean>
  error: Ref<ApiError | null>
  hasNextPage: () => boolean
  hasPrevPage: () => boolean
  nextPage: () => Promise<void>
  prevPage: () => Promise<void>
  goToPage: (page: number) => Promise<void>
  refresh: () => Promise<void>
}

export function usePagination<T>(
  fetchFn: (page: number, pageSize: number) => Promise<{ items: T[]; total: number }>,
  initialPageSize: number = 10
): UsePaginationState<T> {
  const items = ref<T[]>([])
  const page = ref(1)
  const pageSize = ref(initialPageSize)
  const total = ref(0)
  const loading = ref(false)
  const error = ref<ApiError | null>(null)

  const hasNextPage = () => page.value * pageSize.value < total.value
  const hasPrevPage = () => page.value > 1

  const loadPage = async (pageNum: number) => {
    loading.value = true
    error.value = null
    try {
      const result = await fetchFn(pageNum, pageSize.value)
      items.value = result.items
      total.value = result.total
      page.value = pageNum
    } catch (err: any) {
      error.value = err
    } finally {
      loading.value = false
    }
  }

  const nextPage = async () => {
    if (hasNextPage()) {
      await loadPage(page.value + 1)
    }
  }

  const prevPage = async () => {
    if (hasPrevPage()) {
      await loadPage(page.value - 1)
    }
  }

  const goToPage = async (pageNum: number) => {
    if (pageNum >= 1) {
      await loadPage(pageNum)
    }
  }

  const refresh = async () => {
    await loadPage(page.value)
  }

  // Load initial page
  loadPage(1)

  return { items, page, pageSize, total, loading, error, hasNextPage, hasPrevPage, nextPage, prevPage, goToPage, refresh }
}
