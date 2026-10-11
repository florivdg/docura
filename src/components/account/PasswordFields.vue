<script setup lang="ts">
import { computed } from 'vue'
import {
  MAX_PASSWORD_LENGTH,
  passwordValidationError,
} from '@/lib/password-policy'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

/** New-password input with confirmation and inline policy feedback. */
const props = withDefaults(
  defineProps<{
    idPrefix: string
    label?: string
    disabled?: boolean
  }>(),
  { label: 'Passwort', disabled: false },
)

const password = defineModel<string>('password', { required: true })
const confirmation = defineModel<string>('confirmation', { required: true })

// Only complain once typing has started; a missing confirmation is not a mismatch yet.
const validationError = computed(() =>
  password.value
    ? passwordValidationError(
        password.value,
        confirmation.value || password.value,
      )
    : '',
)
</script>

<template>
  <div class="space-y-2">
    <Label :for="`${props.idPrefix}-password`">{{ props.label }}</Label>
    <Input
      :id="`${props.idPrefix}-password`"
      v-model="password"
      type="password"
      autocomplete="new-password"
      :maxlength="MAX_PASSWORD_LENGTH"
      :disabled="props.disabled"
    />
  </div>
  <div class="space-y-2">
    <Label :for="`${props.idPrefix}-confirmation`">
      {{ props.label }} bestätigen
    </Label>
    <Input
      :id="`${props.idPrefix}-confirmation`"
      v-model="confirmation"
      type="password"
      autocomplete="new-password"
      :maxlength="MAX_PASSWORD_LENGTH"
      :disabled="props.disabled"
    />
    <p v-if="validationError" class="text-destructive text-sm">
      {{ validationError }}
    </p>
  </div>
</template>
