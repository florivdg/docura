<script setup lang="ts">
/** One-line feedback above a table: an error wins over a success notice. */
defineProps<{ error: string; notice: string }>()
</script>

<template>
  <div class="text-sm" role="status">
    <p v-if="error" class="text-destructive">{{ error }}</p>
    <p v-else-if="notice" class="text-emerald-600">{{ notice }}</p>
  </div>
</template>
