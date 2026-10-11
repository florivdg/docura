<script setup lang="ts">
import { computed, ref } from 'vue'
import { authClient } from '@/lib/auth-client'
import { usePasswordDialog } from '@/composables/usePasswordForm'
import type { AdminUserRow } from '@/composables/useUserAdmin'
import { ROLE_LABELS, USER_ROLES, type UserRole } from '@/lib/roles'
import PasswordFields from '@/components/account/PasswordFields.vue'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

const open = defineModel<boolean>('open', { required: true })
const emit = defineEmits<{ saved: [user: AdminUserRow] }>()

const name = ref('')
const email = ref('')
const role = ref<UserRole>('user')
const {
  password,
  confirmation,
  pending,
  error,
  canSave: passwordReady,
  run,
} = usePasswordDialog(open, () => {
  name.value = ''
  email.value = ''
  role.value = 'user'
})

const canSave = computed(
  () =>
    passwordReady.value &&
    name.value.trim() !== '' &&
    email.value.trim() !== '',
)

async function submit() {
  if (!canSave.value) return
  const body = {
    name: name.value.trim(),
    email: email.value.trim(),
    password: password.value,
    role: role.value,
  }
  const result = await run(
    () => authClient.admin.createUser(body),
    'Benutzer konnte nicht angelegt werden.',
  )
  if (result?.data) emit('saved', result.data.user)
}
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Neuer Benutzer</DialogTitle>
        <DialogDescription>
          Der Benutzer kann sich danach mit E-Mail-Adresse und Passwort anmelden
          und sieht die gemeinsame Dokumentbibliothek.
        </DialogDescription>
      </DialogHeader>

      <form class="flex flex-col gap-4" @submit.prevent="submit">
        <p v-if="error" class="text-destructive text-sm">{{ error }}</p>
        <div class="space-y-2">
          <Label for="user-name">Name</Label>
          <Input id="user-name" v-model="name" data-1p-ignore />
        </div>
        <div class="space-y-2">
          <Label for="user-email">E-Mail</Label>
          <Input
            id="user-email"
            v-model="email"
            type="email"
            placeholder="name@beispiel.de"
            autocomplete="off"
          />
        </div>
        <div class="space-y-2">
          <Label for="user-role">Rolle</Label>
          <Select v-model="role">
            <SelectTrigger id="user-role" class="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem v-for="r in USER_ROLES" :key="r" :value="r">
                {{ ROLE_LABELS[r] }}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
        <PasswordFields
          v-model:password="password"
          v-model:confirmation="confirmation"
          id-prefix="user"
          :disabled="pending"
        />

        <DialogFooter>
          <Button type="submit" :disabled="!canSave">
            {{ pending ? 'Erstellt...' : 'Erstellen' }}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
</template>
