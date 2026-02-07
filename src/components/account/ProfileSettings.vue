<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { authClient } from '@/lib/auth-client'
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

const MAX_NAME_LENGTH = 80

const name = ref('')
const initialName = ref('')
const loading = ref(true)
const saving = ref(false)
const error = ref('')
const success = ref('')

const trimmedName = computed(() => name.value.trim())
const isUnchanged = computed(() => trimmedName.value === initialName.value)
const validationError = computed(() => {
  if (trimmedName.value.length === 0) {
    return 'Der Anzeigename darf nicht leer sein.'
  }
  if (trimmedName.value.length > MAX_NAME_LENGTH) {
    return `Der Anzeigename darf maximal ${MAX_NAME_LENGTH} Zeichen lang sein.`
  }
  return ''
})

const canSave = computed(() => {
  if (loading.value || saving.value) return false
  if (isUnchanged.value) return false
  return validationError.value.length === 0
})

async function fetchProfile() {
  error.value = ''
  success.value = ''
  loading.value = true
  try {
    const { data, error: sessionError } = await authClient.getSession()
    if (sessionError || !data?.user) {
      error.value = sessionError?.message ?? 'Konto konnte nicht geladen werden.'
      return
    }
    name.value = data.user.name
    initialName.value = data.user.name.trim()
  } catch {
    error.value = 'Konto konnte nicht geladen werden.'
  } finally {
    loading.value = false
  }
}

async function handleSave() {
  if (!canSave.value) return
  error.value = ''
  success.value = ''
  saving.value = true
  try {
    const { error: updateError } = await authClient.updateUser({
      name: trimmedName.value,
    })
    if (updateError) {
      error.value =
        updateError.message ?? 'Anzeigename konnte nicht gespeichert werden.'
      return
    }
    name.value = trimmedName.value
    initialName.value = trimmedName.value
    success.value = 'Anzeigename wurde gespeichert.'
  } catch {
    error.value = 'Anzeigename konnte nicht gespeichert werden.'
  } finally {
    saving.value = false
  }
}

onMounted(fetchProfile)
</script>

<template>
  <Card>
    <CardHeader>
      <CardTitle>Profil</CardTitle>
      <CardDescription>
        Aktualisieren Sie Ihren Anzeigenamen für die App.
      </CardDescription>
    </CardHeader>
    <CardContent class="space-y-4">
      <p v-if="error" class="text-destructive text-sm">
        {{ error }}
      </p>
      <p v-else-if="success" class="text-sm text-emerald-600">
        {{ success }}
      </p>

      <div class="space-y-2">
        <Label for="display-name">Anzeigename</Label>
        <Input
          id="display-name"
          v-model="name"
          :maxlength="MAX_NAME_LENGTH"
          :disabled="loading || saving"
          placeholder="Ihr Anzeigename"
          @keydown.enter="handleSave"
        />
        <p v-if="validationError && !loading" class="text-destructive text-sm">
          {{ validationError }}
        </p>
      </div>

      <div class="flex justify-end">
        <Button :disabled="!canSave" @click="handleSave">
          {{ saving ? 'Speichert...' : 'Speichern' }}
        </Button>
      </div>
    </CardContent>
  </Card>
</template>
