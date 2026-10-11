<script setup lang="ts">
import { ref } from 'vue'
import { authClient } from '@/lib/auth-client'
import { useAuthRequest } from '@/composables/useAuthRequest'
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

const props = defineProps<{ initialError?: string }>()

const email = ref('')
const success = ref('')
const { pending, error, run } = useAuthRequest()
error.value = props.initialError ?? ''

async function handleRequestReset() {
  success.value = ''
  const sent = await run(
    () =>
      authClient.requestPasswordReset({
        email: email.value,
        redirectTo: '/reset-password',
      }),
    'Zurücksetzen fehlgeschlagen.',
  )
  if (sent) {
    success.value =
      'Falls ein Konto mit dieser E-Mail existiert, wurde ein Link gesendet.'
  }
}
</script>

<template>
  <Card>
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
            <Button type="submit" class="w-full" :disabled="pending">
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
</template>
