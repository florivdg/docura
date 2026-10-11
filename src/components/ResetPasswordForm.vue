<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { cn } from '@/lib/utils'
import { authErrorMessage } from '@/lib/auth-errors'
import NewPasswordCard from '@/components/reset-password/NewPasswordCard.vue'
import RequestResetCard from '@/components/reset-password/RequestResetCard.vue'

const props = defineProps<{
  class?: HTMLAttributes['class']
}>()

// Rendered with client:only, so the URL is available during setup.
const params = new URLSearchParams(window.location.search)
const token = params.get('token') ?? ''
const errorCode = params.get('error')
const urlError = errorCode
  ? authErrorMessage(
      { code: errorCode },
      'Ein Fehler ist aufgetreten. Bitte fordern Sie einen neuen Link an.',
    )
  : ''
</script>

<template>
  <div :class="cn('flex flex-col gap-6', props.class)">
    <!-- Mode 2: Set new password (token present) -->
    <NewPasswordCard v-if="token" :token="token" :initial-error="urlError" />
    <!-- Mode 1: Request reset email (no token) -->
    <RequestResetCard v-else :initial-error="urlError" />
  </div>
</template>
