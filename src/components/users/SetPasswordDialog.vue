<script setup lang="ts">
import { authClient } from '@/lib/auth-client'
import { usePasswordDialog } from '@/composables/usePasswordForm'
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

const props = defineProps<{ user: { id: string; name: string } }>()
const open = defineModel<boolean>('open', { required: true })
const emit = defineEmits<{ saved: [] }>()

const { password, confirmation, pending, error, canSave, run } =
  usePasswordDialog(open)

// The server revokes every session of the user once the password is set.
async function submit() {
  if (!canSave.value) return
  const saved = await run(
    () =>
      authClient.admin.setUserPassword({
        userId: props.user.id,
        newPassword: password.value,
      }),
    'Passwort konnte nicht gesetzt werden.',
  )
  if (saved) emit('saved')
}
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Passwort setzen</DialogTitle>
        <DialogDescription>
          Neues Passwort für {{ props.user.name }}. Alle bestehenden Sitzungen
          dieses Benutzers werden abgemeldet.
        </DialogDescription>
      </DialogHeader>

      <form class="flex flex-col gap-4" @submit.prevent="submit">
        <p v-if="error" class="text-destructive text-sm">{{ error }}</p>
        <PasswordFields
          v-model:password="password"
          v-model:confirmation="confirmation"
          id-prefix="set"
          label="Neues Passwort"
          :disabled="pending"
        />
        <DialogFooter>
          <Button type="submit" :disabled="!canSave">
            {{ pending ? 'Speichert...' : 'Passwort setzen' }}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
</template>
