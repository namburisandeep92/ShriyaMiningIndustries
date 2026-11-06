<template>
  <div class="toast-container">
    <transition-group name="toast" tag="div">
      <div
        v-for="toast in toasts"
        :key="toast.id"
        :class="['toast', `toast-${toast.type}`]"
      >
        <div class="toast-content">
          <span class="toast-icon">
            <span v-if="toast.type === 'success'" class="icon">✓</span>
            <span v-else-if="toast.type === 'error'" class="icon">✕</span>
            <span v-else-if="toast.type === 'warning'" class="icon">!</span>
            <span v-else class="icon">ℹ</span>
          </span>
          <span class="toast-message">{{ toast.message }}</span>
        </div>
        <button
          class="toast-close"
          @click="toastManager.remove(toast.id)"
          aria-label="Close notification"
        >
          ×
        </button>
      </div>
    </transition-group>
  </div>
</template>

<script setup lang="ts">
import { toastManager } from '@/services/notifications'

const toasts = toastManager.getToasts()
</script>

<style scoped>
.toast-container {
  position: fixed;
  top: 1rem;
  right: 1rem;
  z-index: 9999;
  display: flex;
  flex-direction: column;
  gap: 1rem;
  pointer-events: none;
}

.toast {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1rem;
  border-radius: 4px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  pointer-events: auto;
  min-width: 300px;
  animation: slideIn 0.3s ease-out;
}

.toast-success {
  background-color: #d4edda;
  color: #155724;
  border-left: 4px solid #28a745;
}

.toast-error {
  background-color: #f8d7da;
  color: #721c24;
  border-left: 4px solid #dc3545;
}

.toast-warning {
  background-color: #fff3cd;
  color: #856404;
  border-left: 4px solid #ffc107;
}

.toast-info {
  background-color: #d1ecf1;
  color: #0c5460;
  border-left: 4px solid #17a2b8;
}

.toast-content {
  display: flex;
  align-items: center;
  gap: 1rem;
  flex: 1;
}

.toast-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: bold;
  min-width: 24px;
}

.toast-message {
  word-break: break-word;
}

.toast-close {
  background: none;
  border: none;
  font-size: 1.5rem;
  cursor: pointer;
  opacity: 0.7;
  transition: opacity 0.2s;
  padding: 0;
  margin-left: 1rem;
}

.toast-close:hover {
  opacity: 1;
}

@keyframes slideIn {
  from {
    transform: translateX(400px);
    opacity: 0;
  }
  to {
    transform: translateX(0);
    opacity: 1;
  }
}

.toast-enter-active,
.toast-leave-active {
  transition: all 0.3s ease;
}

.toast-enter-from {
  transform: translateX(400px);
  opacity: 0;
}

.toast-leave-to {
  transform: translateX(400px);
  opacity: 0;
}

@media (max-width: 768px) {
  .toast-container {
    left: 1rem;
    right: 1rem;
  }

  .toast {
    min-width: auto;
  }
}
</style>
