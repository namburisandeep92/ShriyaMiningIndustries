<template>
  <div class="admin-users-page">
    <div class="page-header">
      <h1>User Management</h1>
      <button @click="showAddUserForm = true" class="btn btn-primary">+ Add User</button>
    </div>

    <div v-if="showAddUserForm" class="modal-overlay" @click="showAddUserForm = false">
      <div class="modal" @click.stop>
        <div class="modal-header">
          <h2>Add New User</h2>
          <button @click="showAddUserForm = false" class="btn-close">×</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label>Email *</label>
            <input v-model="newUser.email" type="email" class="form-input" />
          </div>
          <div class="form-group">
            <label>Role *</label>
            <select v-model="newUser.role" class="form-input">
              <option value="">Select a role</option>
              <option value="viewer">Viewer</option>
              <option value="editor">Editor</option>
              <option value="admin">Admin</option>
            </select>
          </div>
        </div>
        <div class="modal-footer">
          <button @click="showAddUserForm = false" class="btn btn-secondary">Cancel</button>
          <button @click="saveUser" class="btn btn-primary">Save User</button>
        </div>
      </div>
    </div>

    <div v-if="loading" class="text-center p-3">
      <div class="loading"></div>
    </div>

    <div v-else-if="error" class="error-box">
      <strong>Error:</strong> {{ error.message }}
    </div>

    <div v-else class="users-table-container">
      <table class="users-table">
        <thead>
          <tr>
            <th>Email</th>
            <th>Role</th>
            <th>Created</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="user in users" :key="user.id">
            <td>{{ user.email }}</td>
            <td>{{ user.role }}</td>
            <td>{{ formatDate(user.createdAt) }}</td>
            <td>
              <button @click="deleteUser(user.id)" class="btn btn-danger btn-small">Delete</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { apiClient } from '@/services/api'
import { toastManager } from '@/services/notifications'

const users = ref<any[]>([])
const loading = ref(false)
const error = ref<any>(null)
const showAddUserForm = ref(false)

const newUser = ref({
  email: '',
  role: '',
})

const formatDate = (dateString: string) => {
  return new Date(dateString).toLocaleDateString('en-IN')
}

const loadUsers = async () => {
  loading.value = true
  error.value = null
  try {
    const response = await apiClient.listUsers()
    users.value = response.data || []
  } catch (err: any) {
    error.value = err
    toastManager.error('Failed to load users')
  } finally {
    loading.value = false
  }
}

const saveUser = async () => {
  if (!newUser.value.email || !newUser.value.role) {
    toastManager.warning('Please fill all fields')
    return
  }

  try {
    await apiClient.createUser(newUser.value)
    toastManager.success('User created successfully')
    newUser.value = { email: '', role: '' }
    showAddUserForm.value = false
    await loadUsers()
  } catch (err: any) {
    toastManager.error('Failed to create user: ' + err.message)
  }
}

const deleteUser = async (userId: string) => {
  if (!confirm('Are you sure?')) return

  try {
    await apiClient.deleteUser(userId)
    toastManager.success('User deleted successfully')
    await loadUsers()
  } catch (err: any) {
    toastManager.error('Failed to delete user: ' + err.message)
  }
}

onMounted(() => {
  loadUsers()
})
</script>

<style scoped>
.admin-users-page {
  display: flex;
  flex-direction: column;
  gap: 2rem;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-bottom: 1rem;
  border-bottom: 2px solid #ddd;
}

.page-header h1 {
  margin: 0;
}

.users-table-container {
  background: white;
  border: 1px solid #ddd;
  border-radius: 4px;
  overflow-x: auto;
}

.users-table {
  width: 100%;
  border-collapse: collapse;
}

.users-table th {
  background-color: #f0f0f0;
  padding: 1rem;
  text-align: left;
  font-weight: 600;
  border-bottom: 2px solid #ddd;
}

.users-table td {
  padding: 1rem;
  border-bottom: 1px solid #ddd;
}

.users-table tbody tr:hover {
  background-color: #f9f9f9;
}

.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal {
  background: white;
  border-radius: 8px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
  max-width: 500px;
  width: 90%;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1.5rem;
  border-bottom: 1px solid #ddd;
}

.modal-header h2 {
  margin: 0;
}

.btn-close {
  background: none;
  border: none;
  font-size: 2rem;
  cursor: pointer;
  color: #999;
}

.modal-body {
  padding: 1.5rem;
}

.modal-footer {
  display: flex;
  gap: 1rem;
  justify-content: flex-end;
  padding: 1.5rem;
  border-top: 1px solid #ddd;
}

.form-group {
  display: flex;
  flex-direction: column;
  margin-bottom: 1rem;
}

.form-group label {
  margin-bottom: 0.5rem;
  font-weight: 500;
}

.form-input {
  padding: 0.75rem;
  border: 1px solid #ddd;
  border-radius: 4px;
}

.error-box {
  padding: 1rem;
  background-color: #f8d7da;
  color: #721c24;
  border: 1px solid #f5c6cb;
  border-radius: 4px;
}

.text-center {
  text-align: center;
}
</style>
