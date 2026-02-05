<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { onMounted, ref } from 'vue'
import { cn } from '@/lib/utils'
import { authClient } from '@/lib/auth-client'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'

const props = defineProps<{
  class?: HTMLAttributes['class']
}>()

const email = ref('')
const token = ref('')
const newPassword = ref('')
const confirmPassword = ref('')
const error = ref('')
const success = ref('')
const loading = ref(false)

onMounted(() => {
  const params = new URLSearchParams(window.location.search)
  token.value = params.get('token') ?? ''

  const urlError = params.get('error')
  if (urlError) {
    error.value =
      urlError === 'INVALID_TOKEN'
        ? 'Der Link ist ungültig oder abgelaufen. Bitte fordern Sie einen neuen Link an.'
        : 'Ein Fehler ist aufgetreten. Bitte fordern Sie einen neuen Link an.'
  }
})

async function handleRequestReset() {
  error.value = ''
  success.value = ''
  loading.value = true
  try {
    const { error: resetError } = await authClient.requestPasswordReset({
      email: email.value,
      redirectTo: '/reset-password',
    })
    if (resetError) {
      error.value = resetError.message ?? 'Zurücksetzen fehlgeschlagen.'
      return
    }
    success.value =
      'Falls ein Konto mit dieser E-Mail existiert, wurde ein Link gesendet.'
  } catch {
    error.value = 'Zurücksetzen fehlgeschlagen.'
  } finally {
    loading.value = false
  }
}

async function handleResetPassword() {
  error.value = ''
  success.value = ''

  if (newPassword.value.length < 8) {
    error.value = 'Das Passwort muss mindestens 8 Zeichen lang sein.'
    return
  }

  if (newPassword.value !== confirmPassword.value) {
    error.value = 'Die Passwörter stimmen nicht überein.'
    return
  }

  loading.value = true
  try {
    const { error: resetError } = await authClient.resetPassword({
      newPassword: newPassword.value,
      token: token.value,
    })
    if (resetError) {
      error.value =
        resetError.message ?? 'Passwort konnte nicht gespeichert werden.'
      return
    }
    success.value = 'Ihr Passwort wurde erfolgreich geändert.'
  } catch {
    error.value = 'Passwort konnte nicht gespeichert werden.'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div :class="cn('flex flex-col gap-6', props.class)">
    <!-- Mode 2: Set new password (token present) -->
    <Card v-if="token">
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
        <form v-else @submit.prevent="handleResetPassword">
          <FieldGroup>
            <Field>
              <FieldLabel for="new-password">Passwort</FieldLabel>
              <Input
                id="new-password"
                v-model="newPassword"
                type="password"
                required
                minlength="8"
              />
            </Field>
            <Field>
              <FieldLabel for="confirm-password">
                Passwort bestätigen
              </FieldLabel>
              <Input
                id="confirm-password"
                v-model="confirmPassword"
                type="password"
                required
                minlength="8"
              />
            </Field>
            <Field>
              <Button type="submit" class="w-full" :disabled="loading">
                Passwort speichern
              </Button>
            </Field>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>

    <!-- Mode 1: Request reset email (no token) -->
    <Card v-else>
      <CardHeader>
        <CardTitle>Passwort zurücksetzen</CardTitle>
        <CardDescription>
          Geben Sie Ihre E-Mail-Adresse ein, um einen Link zum Zurücksetzen zu
          erhalten.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <p v-if="error" class="text-destructive mb-4 text-sm">
          {{ error }}
        </p>
        <p v-if="success" class="text-success mb-4 text-sm text-green-600">
          {{ success }}
        </p>
        <form @submit.prevent="handleRequestReset">
          <FieldGroup>
            <Field>
              <FieldLabel for="email"> E-Mail </FieldLabel>
              <Input
                id="email"
                v-model="email"
                type="email"
                placeholder="name@beispiel.de"
                required
              />
            </Field>
            <Field>
              <Button type="submit" class="w-full" :disabled="loading">
                Link senden
              </Button>
            </Field>
          </FieldGroup>
        </form>
        <div class="mt-4 text-center text-sm">
          <a href="/login" class="underline-offset-4 hover:underline">
            Zurück zur Anmeldung
          </a>
        </div>
      </CardContent>
    </Card>
  </div>
</template>
