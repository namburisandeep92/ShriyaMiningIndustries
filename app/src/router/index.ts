import { createRouter, createWebHistory, RouteRecordRaw } from 'vue-router'
import { apiClient } from '@/services/api'

// Views (lazy loaded)
const InvoiceList = () => import('@/views/InvoiceList.vue')
const InvoiceEditor = () => import('@/views/InvoiceEditor.vue')
const InvoiceView = () => import('@/views/InvoiceView.vue')
const POImport = () => import('@/views/POImport.vue')
const AdminUsers = () => import('@/views/AdminUsers.vue')
const AdminErrors = () => import('@/views/AdminErrors.vue')
const CompanyProfile = () => import('@/views/CompanyProfile.vue')
const NotFound = () => import('@/views/NotFound.vue')

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    redirect: '/invoices',
  },
  {
    path: '/invoices',
    component: InvoiceList,
    meta: { title: 'Invoices' },
  },
  {
    path: '/invoices/create',
    component: InvoiceEditor,
    meta: { title: 'Create Invoice' },
  },
  {
    path: '/invoices/:id',
    component: InvoiceView,
    meta: { title: 'View Invoice' },
  },
  {
    path: '/invoices/:id/edit',
    component: InvoiceEditor,
    meta: { title: 'Edit Invoice' },
  },
  {
    path: '/po-import',
    component: POImport,
    meta: { title: 'PO Import' },
  },
  {
    path: '/admin/users',
    component: AdminUsers,
    meta: { title: 'Admin - Users' },
  },
  {
    path: '/admin/errors',
    component: AdminErrors,
    meta: { title: 'Admin - Error Logs' },
  },
  {
    path: '/admin/company-profile',
    component: CompanyProfile,
    meta: { title: 'Admin - Company Profile', requiresPermission: 'vendor.manage' },
  },
  {
    path: '/:pathMatch(.*)*',
    component: NotFound,
    meta: { title: 'Page Not Found' },
  },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

router.beforeEach(async (to) => {
  const permission = to.meta.requiresPermission
  if (typeof permission !== 'string' || apiClient.hasPermission(permission)) return true
  try {
    await apiClient.refreshAuthContext()
  } catch {
    return '/invoices'
  }
  return apiClient.hasPermission(permission) ? true : '/invoices'
})

router.afterEach((to) => {
  document.title = `${to.meta.title || 'Page'} - SMI Invoice Platform`
})

export default router
