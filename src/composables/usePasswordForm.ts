import { computed, ref, watch, type Ref } from 'vue'
import { useAuthRequest } from '@/composables/useAuthRequest'
import { passwordValidationError } from '@/lib/password-policy'

/** New password with confirmation; `canSave` once the policy is met and no request is pending. */
export function usePasswordForm() {
  const password = ref('')
  const confirmation = ref('')
  const request = useAuthRequest()

  const canSave = computed(
    () =>
      !request.pending.value &&
      passwordValidationError(password.value, confirmation.value) === '',
  )

  return { password, confirmation, canSave, ...request }
}

/** Password form of the admin dialogs, cleared whenever the dialog opens. */
export function usePasswordDialog(open: Ref<boolean>, onOpen = () => {}) {
  const form = usePasswordForm()

  watch(open, (isOpen) => {
    if (!isOpen) return
    form.password.value = ''
    form.confirmation.value = ''
    form.error.value = ''
    onOpen()
  })

  return form
}
