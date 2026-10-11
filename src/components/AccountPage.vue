<script setup lang="ts">
import PageLayout from '@/components/PageLayout.vue'
import ProfileSettings from '@/components/account/ProfileSettings.vue'
import PasskeyManager from '@/components/account/PasskeyManager.vue'
import ChangePasswordForm from '@/components/account/ChangePasswordForm.vue'
</script>

<template>
  <PageLayout title="Konto">
    <ProfileSettings />
    <ChangePasswordForm />
    <PasskeyManager />
  </PageLayout>
</template>
