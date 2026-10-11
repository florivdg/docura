<script setup lang="ts">
import PageLayout from '@/components/PageLayout.vue'
import UsersTable from '@/components/users/UsersTable.vue'

defineProps<{ currentUserId: string }>()
</script>

<template>
  <PageLayout title="Benutzer">
    <UsersTable :current-user-id="currentUserId" />
  </PageLayout>
</template>
