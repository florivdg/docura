<script setup lang="ts">
import { ref } from 'vue'
import { authClient } from '@/lib/auth-client'
import { usePasswordForm } from '@/composables/usePasswordForm'
import PasswordFields from '@/components/account/PasswordFields.vue'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

const props = defineProps<{ token: string; initialError?: string }>()

const {
  password: newPassword,
  confirmation: confirmPassword,
  pending,
  error,
  canSave,
  run,
} = usePasswordForm()
error.value = props.initialError ?? ''
const success = ref('')

async function handleResetPassword() {
  if (!canSave.value) return
  const saved = await run(
    () =>
      authClient.resetPassword({
        newPassword: newPassword.value,
        token: props.token,
      }),
    'Passwort konnte nicht gespeichert werden.',
  )
  if (saved) success.value = 'Ihr Passwort wurde erfolgreich geändert.'
}
</script>

<template>
  <Card>
    <CardHeader>
      <CardTitle>Neues Passwort vergeben</CardTitle>
      <CardDescription> Geben Sie Ihr neues Passwort ein. </CardDescription>
    </CardHeader>
    <CardContent>
      <p v-if="error" class="text-destructive mb-4 text-sm">
        {{ error }}
      </p>
      <template v-if="success">
        <p class="mb-4 text-sm text-green-600">
          {{ success }}
        </p>
        <div class="text-center text-sm">
          <a href="/login" class="underline-offset-4 hover:underline">
            Zur Anmeldung
          </a>
        </div>
      </template>
      <form v-else class="space-y-4" @submit.prevent="handleResetPassword">
        <PasswordFields
          v-model:password="newPassword"
          v-model:confirmation="confirmPassword"
          id-prefix="reset"
          :disabled="pending"
        />
        <Button type="submit" class="w-full" :disabled="!canSave">
          Passwort speichern
        </Button>
      </form>
    </CardContent>
  </Card>
</template>
