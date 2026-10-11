<script setup lang="ts">
import { computed, ref } from 'vue'
import { authClient } from '@/lib/auth-client'
import { usePasswordForm } from '@/composables/usePasswordForm'
import { MIN_PASSWORD_LENGTH } from '@/lib/password-policy'
import PasswordFields from '@/components/account/PasswordFields.vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

const currentPassword = ref('')
const success = ref('')
const {
  password: newPassword,
  confirmation: confirmPassword,
  pending,
  error,
  canSave: passwordReady,
  run,
} = usePasswordForm()

const canSave = computed(
  () => passwordReady.value && currentPassword.value.length > 0,
)

async function handleSubmit() {
  if (!canSave.value) return
  success.value = ''
  const changed = await run(
    () =>
      authClient.changePassword({
        currentPassword: currentPassword.value,
        newPassword: newPassword.value,
        revokeOtherSessions: true,
      }),
    'Passwort konnte nicht geändert werden.',
  )
  if (!changed) return
  currentPassword.value = ''
  newPassword.value = ''
  confirmPassword.value = ''
  success.value =
    'Passwort wurde geändert. Alle anderen Sitzungen wurden abgemeldet.'
}
</script>

<template>
  <Card>
    <CardHeader>
      <CardTitle>Passwort ändern</CardTitle>
      <CardDescription>
        Das neue Passwort muss mindestens {{ MIN_PASSWORD_LENGTH }} Zeichen lang
        sein. Andere angemeldete Geräte werden danach abgemeldet.
      </CardDescription>
    </CardHeader>
    <CardContent>
      <form class="space-y-4" @submit.prevent="handleSubmit">
        <p v-if="error" class="text-destructive text-sm">{{ error }}</p>
        <p v-else-if="success" class="text-sm text-emerald-600">
          {{ success }}
        </p>

        <div class="space-y-2">
          <Label for="current-password">Aktuelles Passwort</Label>
          <Input
            id="current-password"
            v-model="currentPassword"
            type="password"
            autocomplete="current-password"
            :disabled="pending"
          />
        </div>
        <PasswordFields
          v-model:password="newPassword"
          v-model:confirmation="confirmPassword"
          id-prefix="new"
          label="Neues Passwort"
          :disabled="pending"
        />

        <div class="flex justify-end">
          <Button type="submit" :disabled="!canSave">
            {{ pending ? 'Speichert...' : 'Passwort ändern' }}
          </Button>
        </div>
      </form>
    </CardContent>
  </Card>
</template>
