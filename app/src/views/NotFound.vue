<template>
  <div class="not-found-page">
    <div class="content">
      <h1>404</h1>
      <h2>Page Not Found</h2>
      <p>Sorry, the page you're looking for doesn't exist.</p>
      <router-link to="/invoices" class="btn btn-primary">← Go to Invoices</router-link>
    </div>
  </div>
</template>

<script setup lang="ts"></script>

<style scoped>
.not-found-page {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: calc(100vh - 100px);
}

.content {
  text-align: center;
}

.content h1 {
  font-size: 5rem;
  margin: 0;
  color: var(--stone);
}

.content h2 {
  font-size: 2rem;
  margin: 0.5rem 0 1rem 0;
  color: var(--ink-mid);
}

.content p {
  color: var(--ink-lt);
  margin-bottom: 2rem;
}
</style>
